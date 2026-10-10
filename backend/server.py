from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import base64
import asyncio
import hashlib
import logging
import io
from datetime import datetime, timezone, timedelta, date as date_cls

import jwt
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from PIL import Image, ImageOps

import brand
import image_service
import messaging
import permissions
import watermark
import websites
import display_media

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=30000,
    connectTimeoutMS=20000,
    socketTimeoutMS=45000,
    maxPoolSize=50,
    minPoolSize=0,
    maxIdleTimeMS=60000,
    retryWrites=True,
    retryReads=True,
)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("somani")


def now_utc():
    return datetime.now(timezone.utc)


def iso():
    return now_utc().isoformat()


def new_id():
    return str(uuid.uuid4())


# The shop is in India: every "day" in the app (today's sessions, history and
# stats date filters) is an IST calendar day.
IST = timezone(timedelta(hours=5, minutes=30))


def _parse_day(value: str) -> date_cls:
    try:
        return date_cls.fromisoformat(value[:10])
    except (TypeError, ValueError):
        raise HTTPException(400, f"Invalid date: {value}")


def ist_day_start_utc(d: date_cls) -> str:
    """UTC ISO timestamp of 00:00 IST on day d, comparable with stored start_time."""
    return datetime(d.year, d.month, d.day, tzinfo=IST).astimezone(timezone.utc).isoformat()


def ist_range_query(frm: Optional[str], to: Optional[str]) -> Dict[str, str]:
    """start_time filter for an inclusive IST date range (YYYY-MM-DD)."""
    rng = {}
    if frm:
        rng["$gte"] = ist_day_start_utc(_parse_day(frm))
    if to:
        rng["$lt"] = ist_day_start_utc(_parse_day(to) + timedelta(days=1))
    return rng


def make_thumb(photo: str, max_px: int = 160) -> str:
    """Small JPEG data URI of a photo, for lists that would otherwise download full photos."""
    try:
        raw = base64.b64decode(photo.split(",", 1)[1] if photo.startswith("data:") else photo)
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        img.thumbnail((max_px, max_px), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


def is_image_data(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("data:image/") and len(value) > 100


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def make_token(user):
    payload = {"sub": user["id"], "role": user["role"], "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


# ---------- Sign-in identity ----------
# Admins sign in with their mobile number or email; there are no usernames.
# Mobiles are Indian and stored as 10 digits, whatever way they are typed:
# "+91 72299 00422", "917229900422", "07229900422" and "0091-7229900422" are
# all 7229900422. Emails are stored lowercased.
_MOBILE_RX = re.compile(r"[6-9]\d{9}")
_EMAIL_RX = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def normalize_mobile(value: Any) -> str:
    """10-digit Indian mobile, or '' when `value` is not one."""
    d = re.sub(r"\D", "", str(value or "")).lstrip("0")
    if len(d) > 10 and d.startswith("91"):
        d = d[2:].lstrip("0")
    return d if _MOBILE_RX.fullmatch(d) else ""


def normalize_email(value: Any) -> str:
    e = str(value or "").strip().lower()
    return e if len(e) <= 120 and _EMAIL_RX.fullmatch(e) else ""


def login_query(identifier: str) -> Optional[Dict[str, str]]:
    """Mongo filter for the admin a sign-in identifier names, or None."""
    if "@" in identifier:
        email = normalize_email(identifier)
        return {"email": email} if email else None
    mobile = normalize_mobile(identifier)
    return {"mobile": mobile} if mobile else None


def fmt_mobile(mobile: str) -> str:
    return f"+91 {mobile[:5]} {mobile[5:]}" if len(mobile or "") == 10 else (mobile or "")


def display_name(a: Dict[str, Any]) -> str:
    """How an admin is named on screen and in logs."""
    return (a.get("name") or "").strip() or fmt_mobile(a.get("mobile", "")) or a.get("email") or "Admin"


async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.admins.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("active") is False:
        raise HTTPException(401, "This account is turned off. Ask a super admin.")
    user["name"] = display_name(user)
    return user


# The Owner: the first super admin, set in .env. Identified by mobile number.
OWNER_MOBILE = normalize_mobile(os.environ.get("SUPER_ADMIN_MOBILE") or "7229900422")
OWNER_EMAIL = normalize_email(os.environ.get("SUPER_ADMIN_EMAIL") or "ashwinipareek19@gmail.com")


def is_owner(a: Dict[str, Any]) -> bool:
    return bool(OWNER_MOBILE) and a.get("mobile") == OWNER_MOBILE


def public_admin(a: Dict[str, Any]) -> Dict[str, Any]:
    """Admin as the app sees it: role, effective permissions, owner flag."""
    return {"id": a["id"], "name": display_name(a), "full_name": a.get("name", ""),
            "mobile": a.get("mobile", ""), "email": a.get("email", ""), "role": a["role"],
            "active": a.get("active", True), "is_owner": is_owner(a),
            "permissions": permissions.effective(a), "created_at": a.get("created_at"),
            "created_by": a.get("created_by")}


messaging.init(db, get_current_user)


async def log_action(user, action, details=""):
    await db.logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "admin_username": user["name"],
        "action": action, "details": details, "timestamp": iso(),
    })


websites.init(lambda: db, get_current_user, log_action)
display_media.init(lambda: db, get_current_user, log_action)


# ---------- Models ----------
class LoginIn(BaseModel):
    login: str  # mobile number or email
    password: str


class SessionIn(BaseModel):
    customer_name: str
    mobile: str
    mobile2: Optional[str] = ""
    photo: Optional[str] = ""
    extra: Dict[str, Any] = {}
    # "Customer agrees to receive WhatsApp messages". None = not asked
    # (WhatsApp not connected), which leaves any earlier answer unchanged.
    wa_consent: Optional[bool] = None
    # Optional {day, month, year?}; None leaves the saved value unchanged.
    dob: Optional[Dict[str, Any]] = None


def _clean_day(value: Optional[Dict[str, Any]], label: str) -> Optional[Dict[str, Optional[int]]]:
    """{day, month, year?} with day + month required, year optional. {} clears it."""
    if not value or not (value.get("day") or value.get("month")):
        return None
    try:
        day, month = int(value["day"]), int(value["month"])
        year = int(value["year"]) if value.get("year") else None
        # 2000 is a leap year, so 29 Feb is allowed when the year is unknown.
        date_cls(year or 2000, month, day)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, f"{label}: choose a valid day and month")
    if year and not 1900 <= year <= datetime.now(IST).year:
        raise HTTPException(400, f"{label}: the year is not valid")
    return {"day": day, "month": month, "year": year}


class EndSessionIn(BaseModel):
    purchased: bool
    total_value: Optional[float] = Field(0, ge=0)
    discount: Optional[float] = Field(0, ge=0)
    final_paid: Optional[float] = Field(0, ge=0)


def _session_amounts(body: EndSessionIn) -> Dict[str, Any]:
    """Validated purchase fields. Amounts only count when the customer purchased."""
    if not body.purchased:
        return {"purchased": False, "total_value": 0, "discount": 0, "final_paid": 0}
    total, discount = body.total_value or 0, body.discount or 0
    if discount > total:
        raise HTTPException(400, "Discount cannot be more than the total value")
    return {"purchased": True, "total_value": total, "discount": discount,
            "final_paid": body.final_paid or 0}


class GenerateIn(BaseModel):
    type: str = ""  # category label (older clients); the catalog flow sends none
    # [{slot, garment_type, fabric_b64}] or [{slot, garment_type, catalog_id}]
    garments: List[Dict[str, Any]]


SLOTS = ("top", "bottom", "third")
MAX_GARMENTS = len(SLOTS)


# Try-on categories come in two kinds:
# - "single": holds styles (items) and takes one fabric photo. `position` says
#   where it is worn (SLOTS), which the AI needs to place the garment.
# - "group": combines single categories (`members`), one photo each. Its
#   styles are always its members' current styles.
# `slots` is kept in step for older readers: [position] or the members' positions.
POSITION_LABEL = {"top": "upper body", "bottom": "lower body", "third": "outer layer"}


class CategoryIn(BaseModel):
    label: str
    description: str = ""
    kind: str = "single"
    position: str = "top"
    items: List[Dict[str, Any]] = []  # styles of a single category
    members: List[str] = []  # single-category ids of a group
    order: int = 0


async def _clean_category(body: CategoryIn, cid: Optional[str] = None) -> Dict[str, Any]:
    label = " ".join(body.label.split())
    if not label:
        raise HTTPException(400, "Category name is required")
    cats = await db.categories.find({}, {"_id": 0}).to_list(500)
    by_id = {c["id"]: c for c in cats}
    if any(c["id"] != cid and c["label"].casefold() == label.casefold() for c in cats):
        raise HTTPException(400, f'A category named "{label}" already exists')
    kind = body.kind if body.kind in ("single", "group") else None
    if not kind:
        raise HTTPException(400, "Kind must be single or group")
    if cid and by_id.get(cid, {}).get("kind", kind) != kind:
        raise HTTPException(400, "A category cannot become a group (or back). Create a new one instead.")
    doc = {"label": label, "description": body.description.strip(), "kind": kind, "order": body.order}

    if kind == "single":
        if body.position not in SLOTS:
            raise HTTPException(400, "Choose where it is worn: upper body, lower body or outer layer")
        items, seen = [], set()
        for it in body.items:
            il = " ".join(str(it.get("label", "")).split())
            if il and il.casefold() not in seen:
                seen.add(il.casefold())
                items.append({"label": il, "description": str(it.get("description", "")).strip()})
        # Moving it to another body part must not clash inside its groups.
        for g in cats:
            if g.get("kind") == "group" and cid in g.get("members", []):
                for m in g["members"]:
                    if m != cid and by_id.get(m, {}).get("position") == body.position:
                        raise HTTPException(400, f'"{g["label"]}" already has {by_id[m]["label"]} for the '
                                                 f'{POSITION_LABEL[body.position]}')
        doc.update(position=body.position, items=items, members=[], slots=[body.position], slot_count=1)
        return doc

    members, used = [], {}
    for m in body.members:
        c = by_id.get(m)
        if not c or c.get("kind") != "single" or m in members:
            raise HTTPException(400, "A group can only contain other (non-group) categories, once each")
        pos = c.get("position")
        if pos in used:
            raise HTTPException(400, f'{used[pos]} and {c["label"]} are both worn on the '
                                     f'{POSITION_LABEL.get(pos, pos)}. A group takes one of each.')
        used[pos] = c["label"]
        members.append(m)
    slots = [by_id[m]["position"] for m in members]
    doc.update(position="", items=[], members=members, slots=slots, slot_count=len(slots))
    return doc


class CatalogIn(BaseModel):
    name: str
    code: str = ""
    category_id: str = ""  # a single (non-group) try-on category
    garment_type: str = ""  # default style staff get pre-selected, e.g. "Kurta"
    description: str = ""
    keywords: str = ""
    image: str = ""  # data URI; required when adding, optional when editing


CATALOG_IMAGE_PX = 800  # stored swatch; the AI only uses a 192px crop of it
CATALOG_THUMB_PX = 160  # search-list icon (shown at ~48px, sharp on 3x screens)
CATALOG_MAX_UPLOAD = 15_000_000  # chars of data URI (~11 MB photo)


def _name_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def _code_key(code: str) -> str:
    """'sf-102', 'SF 102' and 'SF102' are the same code."""
    return re.sub(r"[^0-9A-Z]", "", code.upper())


def _catalog_images(data_uri: str) -> Dict[str, str]:
    """Square-crop the swatch and make its small thumbnail."""
    if not is_image_data(data_uri) or len(data_uri) > CATALOG_MAX_UPLOAD:
        raise HTTPException(400, "Add a fabric photo (JPEG or PNG, under 10 MB)")
    try:
        raw = base64.b64decode(data_uri.split(",", 1)[1])
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        raise HTTPException(400, "That photo could not be read. Try another one.")
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side))
    out = {}
    for key, px, q in (("image", CATALOG_IMAGE_PX, 88), ("thumb", CATALOG_THUMB_PX, 72)):
        im = img.copy()
        im.thumbnail((px, px), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=q, optimize=True)
        out[key] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return out


class FieldIn(BaseModel):
    label: str
    type: str = "text"
    required: bool = False
    order: int = 0


# ---------- Auth ----------
# Lock a sign-in name from one IP address after repeated wrong passwords. Keyed
# by IP + mobile/email so a stranger cannot lock the owner out from their phone.
LOGIN_MAX_FAILS = 5
LOGIN_LOCK_MINUTES = 15
LOGIN_WRONG = "Wrong mobile number / email or password"


def _client_ip(request: Request) -> str:
    # nginx sets X-Real-IP; the backend port itself is bound to localhost only.
    return request.headers.get("X-Real-IP") or (request.client.host if request.client else "")


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    query = login_query(body.login.strip())
    who = next(iter(query.values())) if query else body.login.strip().lower()
    key = f"{_client_ip(request)}|{who}"
    since = now_utc() - timedelta(minutes=LOGIN_LOCK_MINUTES)
    attempts = await db.login_attempts.find_one({"key": key, "last": {"$gte": since}})
    if attempts and attempts.get("count", 0) >= LOGIN_MAX_FAILS:
        raise HTTPException(429, f"Too many wrong attempts. Try again in {LOGIN_LOCK_MINUTES} minutes.")
    user = await db.admins.find_one(query) if query else None
    if not user or not verify_pw(body.password, user["password_hash"]):
        if attempts:
            await db.login_attempts.update_one(
                {"key": key}, {"$inc": {"count": 1}, "$set": {"last": now_utc()}})
        else:
            await db.login_attempts.update_one(
                {"key": key}, {"$set": {"count": 1, "last": now_utc()}}, upsert=True)
        raise HTTPException(401, LOGIN_WRONG)
    if user.get("active") is False:
        raise HTTPException(403, "This account is turned off. Ask a super admin.")
    await db.login_attempts.delete_one({"key": key})
    await log_action({"id": user["id"], "name": display_name(user)}, "login", "Logged in")
    return {"token": make_token(user), "user": {**public_admin(user), "app_language": await app_language()}}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {**public_admin(user), "app_language": await app_language()}


# The admin app's language is one shop-wide setting (More Settings > Language).
APP_LANGUAGES = ("hinglish", "english", "hindi")


async def app_language() -> str:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "app_language": 1}) or {}
    return s.get("app_language") if s.get("app_language") in APP_LANGUAGES else "hinglish"


# ---------- Admin management ----------
# Only super admins manage the team. Staff get exactly the permissions ticked
# for them (see permissions.py); super admins have all of them. Every admin has
# a mobile number (their sign-in) and may add an email as a second sign-in.
# The Owner (SUPER_ADMIN_MOBILE) can never be deleted, turned off, downgraded
# or edited in the app, and a super admin cannot lock themselves out.
class AdminIn(BaseModel):
    name: str = ""
    mobile: str
    email: str = ""
    password: str
    role: str = "admin"
    permissions: Dict[str, bool] = {}


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None
    active: Optional[bool] = None
    password: Optional[str] = None


def _check_password(pw: str):
    if len(pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")


def _clean_name(name: str) -> str:
    name = " ".join((name or "").split())
    if len(name) > 60:
        raise HTTPException(400, "Name can be at most 60 characters")
    return name


def _clean_mobile(value: str) -> str:
    mobile = normalize_mobile(value)
    if not mobile:
        raise HTTPException(400, "Enter a valid 10-digit Indian mobile number")
    return mobile


def _clean_email(value: str) -> str:
    """'' when left empty; an error when filled in but not an email."""
    if not (value or "").strip():
        return ""
    email = normalize_email(value)
    if not email:
        raise HTTPException(400, "Enter a valid email address, or leave it empty")
    return email


async def _check_unique(mobile: str = "", email: str = "", exclude: str = ""):
    if mobile and await db.admins.find_one({"mobile": mobile, "id": {"$ne": exclude}}):
        raise HTTPException(400, "Another admin already uses this mobile number")
    if email and await db.admins.find_one({"email": email, "id": {"$ne": exclude}}):
        raise HTTPException(400, "Another admin already uses this email")


@api.get("/permissions")
async def list_permissions(user=Depends(get_current_user)):
    return permissions.catalog()


@api.get("/admins")
async def list_admins(user=Depends(get_current_user)):
    permissions.require_super(user)
    admins = await db.admins.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
    return [public_admin(a) for a in admins]


@api.post("/admins")
async def create_admin(body: AdminIn, user=Depends(get_current_user)):
    permissions.require_super(user)
    name, mobile, email = _clean_name(body.name), _clean_mobile(body.mobile), _clean_email(body.email)
    _check_password(body.password)
    if body.role not in ("admin", "super"):
        raise HTTPException(400, "Role must be staff or super admin")
    await _check_unique(mobile, email)
    doc = {"id": new_id(), "name": name, "mobile": mobile, "password_hash": hash_pw(body.password),
           "role": body.role, "active": True, "created_at": iso(), "created_by": user["name"],
           "permissions": {} if body.role == "super" else permissions.clean(body.permissions)}
    if email:
        doc["email"] = email
    await db.admins.insert_one(doc)
    await log_action(user, "create_admin",
                     f"Created {'super admin' if body.role == 'super' else 'staff'} {display_name(doc)}")
    return public_admin(doc)


@api.put("/admins/{admin_id}")
async def update_admin(admin_id: str, body: AdminUpdate, user=Depends(get_current_user)):
    permissions.require_super(user)
    target = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Admin not found")
    owner = is_owner(target)
    self_edit = target["id"] == user["id"]
    upd: Dict[str, Any] = {}
    unset: Dict[str, str] = {}
    if body.name is not None and _clean_name(body.name) != target.get("name", ""):
        upd["name"] = _clean_name(body.name)
    if body.mobile is not None and normalize_mobile(body.mobile) != target.get("mobile", ""):
        if owner:
            raise HTTPException(400, "The owner's mobile number is set in the server settings (.env)")
        upd["mobile"] = _clean_mobile(body.mobile)
    if body.email is not None and _clean_email(body.email) != target.get("email", ""):
        if owner:
            raise HTTPException(400, "The owner's email is set in the server settings (.env)")
        email = _clean_email(body.email)
        if email:
            upd["email"] = email
        else:
            unset["email"] = ""
    await _check_unique(upd.get("mobile", ""), upd.get("email", ""), exclude=admin_id)
    if body.role is not None and body.role != target["role"]:
        if body.role not in ("admin", "super"):
            raise HTTPException(400, "Role must be staff or super admin")
        if owner or self_edit:
            raise HTTPException(400, "The owner's role, and your own, cannot be changed")
        upd["role"] = body.role
    if body.active is not None and body.active != target.get("active", True):
        if owner or self_edit:
            raise HTTPException(400, "The owner, and your own account, cannot be turned off")
        upd["active"] = body.active
    if body.permissions is not None:
        upd["permissions"] = permissions.clean(body.permissions)
    if body.password:
        if owner:
            raise HTTPException(400, "The owner's password is set in the server settings (.env)")
        _check_password(body.password)
        upd["password_hash"] = hash_pw(body.password)
    if not upd and not unset:
        return public_admin(target)
    upd["updated_at"] = iso()
    await db.admins.update_one({"id": admin_id}, {"$set": upd, **({"$unset": unset} if unset else {})})
    changes = [k for k in [*upd, *unset] if k not in ("updated_at", "password_hash")]
    changes += ["password"] if "password_hash" in upd else []
    await log_action(user, "edit_admin", f"{display_name(target)}: {', '.join(changes)}")
    after = {**target, **upd}
    for k in unset:
        after.pop(k, None)
    return public_admin(after)


@api.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str, user=Depends(get_current_user)):
    permissions.require_super(user)
    target = await db.admins.find_one({"id": admin_id})
    if not target:
        raise HTTPException(404, "Admin not found")
    if is_owner(target):
        raise HTTPException(400, "The owner account cannot be deleted")
    if target["id"] == user["id"]:
        raise HTTPException(400, "You cannot delete your own account")
    await db.admins.delete_one({"id": admin_id})
    await log_action(user, "delete_admin", f"Deleted admin {display_name(target)}")
    return {"ok": True}


# ---------- Customers ----------
async def customer_stats(customer_id):
    sessions = await db.sessions.find({"customer_id": customer_id}, {"_id": 0, "photo": 0, "thumb": 0}).to_list(1000)
    purchased = [s for s in sessions if s.get("purchased")]
    starts = [s["start_time"] for s in sessions if s.get("start_time")]
    bought_on = [s["start_time"] for s in purchased if s.get("start_time")]
    return {
        "total_sessions": len(sessions),
        "purchased_count": len(purchased),
        "not_purchased_count": len([s for s in sessions if s.get("status") == "closed" and not s.get("purchased")]),
        "total_collected": sum(float(s.get("final_paid") or 0) for s in purchased),
        "total_discount": sum(float(s.get("discount") or 0) for s in purchased),
        "total_value": sum(float(s.get("total_value") or 0) for s in purchased),
        "first_visit": min(starts) if starts else None,
        # A customer "since" their first paid purchase, not their first visit.
        "first_purchase": min(bought_on) if bought_on else None,
        "last_visit": max(starts) if starts else None,
    }


async def bulk_customer_stats():
    """Aggregate stats for all customers in a single query (avoids N+1)."""
    pipeline = [
        {"$group": {
            "_id": "$customer_id",
            "total_sessions": {"$sum": 1},
            "purchased_count": {
                "$sum": {"$cond": [{"$eq": ["$purchased", True]}, 1, 0]}},
            "not_purchased_count": {
                "$sum": {"$cond": [
                    {"$and": [{"$eq": ["$status", "closed"]},
                              {"$ne": ["$purchased", True]}]}, 1, 0]}},
            "total_collected": {
                "$sum": {"$cond": [
                    {"$eq": ["$purchased", True]},
                    {"$toDouble": {"$ifNull": ["$final_paid", 0]}}, 0]}},
            "total_discount": {
                "$sum": {"$cond": [
                    {"$eq": ["$purchased", True]},
                    {"$toDouble": {"$ifNull": ["$discount", 0]}}, 0]}},
            "total_value": {
                "$sum": {"$cond": [
                    {"$eq": ["$purchased", True]},
                    {"$toDouble": {"$ifNull": ["$total_value", 0]}}, 0]}},
            "first_visit": {"$min": "$start_time"},
            # $min skips nulls, so only purchased visits count.
            "first_purchase": {"$min": {"$cond": [{"$eq": ["$purchased", True]}, "$start_time", None]}},
            "last_visit": {"$max": "$start_time"},
        }},
    ]
    stats = {}
    async for row in db.sessions.aggregate(pipeline):
        stats[row.pop("_id")] = row
    return stats


EMPTY_STATS = {"total_sessions": 0, "purchased_count": 0, "not_purchased_count": 0,
               "total_collected": 0, "total_discount": 0, "total_value": 0,
               "first_visit": None, "first_purchase": None, "last_visit": None}


def ist_date_text(value) -> str:
    """'2026-10-04T08:00:00+00:00' -> '04 Oct 2026' (IST) for exports."""
    try:
        return datetime.fromisoformat(value).astimezone(IST).strftime("%d %b %Y")
    except (TypeError, ValueError):
        return ""


def dob_text(dob: Optional[Dict[str, Any]]) -> str:
    if not dob or not dob.get("day") or not dob.get("month"):
        return ""
    text = date_cls(2000, dob["month"], dob["day"]).strftime("%d %b")
    return f"{text} {dob['year']}" if dob.get("year") else text


def dob_age(dob: Optional[Dict[str, Any]]) -> Optional[int]:
    if not dob or not dob.get("year"):
        return None
    today = datetime.now(IST).date()
    return today.year - dob["year"] - ((today.month, today.day) < (dob["month"], dob["day"]))


async def custom_field_labels() -> List[str]:
    """Session fields the super admin added in Settings -> Config, in order."""
    return [f["label"] async for f in db.session_fields.find({}, {"_id": 0, "label": 1}).sort("order", 1)]


async def attach_customer_history(sessions: List[Dict[str, Any]]):
    """Add `history` to each session: what staff should know about the customer
    (visits, purchases, revenue, previous visit, customer since, birthday), in place."""
    cids = list({s["customer_id"] for s in sessions if s.get("customer_id")})
    if not cids:
        return
    visits: Dict[str, List[Dict[str, Any]]] = {}
    async for v in db.sessions.find({"customer_id": {"$in": cids}}, {
            "_id": 0, "customer_id": 1, "start_time": 1, "status": 1, "purchased": 1, "final_paid": 1}):
        visits.setdefault(v["customer_id"], []).append(v)
    dates = {c["id"]: c async for c in db.customers.find(
        {"id": {"$in": cids}}, {"_id": 0, "id": 1, "dob": 1})}
    for s in sessions:
        vs = visits.get(s.get("customer_id"), [])
        bought = [v for v in vs if v.get("purchased")]
        earlier = [v["start_time"] for v in vs if v.get("start_time", "") < s.get("start_time", "")]
        c = dates.get(s.get("customer_id"), {})
        s["history"] = {
            "visits": len(vs),
            "purchased": len(bought),
            "not_purchased": len([v for v in vs if v.get("status") == "closed" and not v.get("purchased")]),
            "revenue": sum(float(v.get("final_paid") or 0) for v in bought),
            "last_visit": max(earlier) if earlier else None,
            # First paid purchase: the day they became a customer.
            "since": min((v["start_time"] for v in bought if v.get("start_time")), default=None),
            "dob": c.get("dob"),
        }


@api.get("/customers/search")
async def search_customers(q: str, user=Depends(get_current_user)):
    if not (permissions.can(user, "sessions_manage") or permissions.can(user, "customers_view")):
        permissions.require(user, "customers_view")
    q = (q or "").strip()
    if len(q) < 2:
        return []
    # Escape so characters like "(" or "+" are searched literally, not as regex.
    rx = {"$regex": re.escape(q[:50]), "$options": "i"}
    res = await db.customers.find(
        {"$or": [{"mobile": rx}, {"mobile2": rx}, {"name": rx}]},
        {"_id": 0}
    ).limit(8).to_list(8)
    consent = await messaging.consent_map([c.get("mobile") for c in res])
    for c in res:
        c["wa"] = consent.get(c.get("mobile"), {"opted_in": False, "opted_out": False})
    return res


@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
    permissions.require(user, "customers_view")
    # Full photos are ~100 KB each; the list only needs a small thumbnail.
    res = await db.customers.find({}, {"_id": 0, "photo": 0}).sort("created_at", -1).to_list(5000)
    missing = [c["id"] for c in res if "thumb" not in c]
    if missing:
        # One-time backfill for customers saved before thumbnails existed.
        thumbs = {}
        async for c in db.customers.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "photo": 1}):
            thumbs[c["id"]] = make_thumb(c.get("photo") or "")
            await db.customers.update_one({"id": c["id"]}, {"$set": {"thumb": thumbs[c["id"]]}})
        for c in res:
            if c["id"] in thumbs:
                c["thumb"] = thumbs[c["id"]]
    stats = await bulk_customer_stats()
    for c in res:
        c["stats"] = stats.get(c["id"], dict(EMPTY_STATS))
    return res


@api.get("/customers/export")
async def export_customers(user=Depends(get_current_user)):
    permissions.require(user, "customers_export")
    customers = await db.customers.find({}, {"_id": 0, "photo": 0, "thumb": 0}).sort("created_at", -1).to_list(5000)
    stats = await bulk_customer_stats()
    consent = await messaging.consent_map([c.get("mobile") for c in customers])
    labels = await custom_field_labels()
    rows = []
    for c in customers:
        st = stats.get(c["id"], dict(EMPTY_STATS))
        wa = consent.get(c.get("mobile"), {})
        row = {
            "Name": c.get("name"), "Primary Mobile": c.get("mobile"),
            "Secondary Mobile": c.get("mobile2", ""),
            "Date of Birth": dob_text(c.get("dob")), "Age": dob_age(c.get("dob")),
            "Customer Since": ist_date_text(st["first_purchase"]),
            "First Visit": ist_date_text(st["first_visit"]), "Last Visit": ist_date_text(st["last_visit"]),
            "Visits": st["total_sessions"], "Purchased": st["purchased_count"],
            "Not Purchased": st["not_purchased_count"], "Total Revenue": st["total_collected"],
            "Total Discount": st["total_discount"], "Total Value": st["total_value"],
            "WhatsApp": "Unsubscribed" if wa.get("opted_out") else "Agreed" if wa.get("opted_in") else "",
        }
        extra = c.get("extra") or {}
        # Every custom field gets a column, even when this customer left it empty;
        # values of fields deleted since are kept after them.
        for k in labels + [k for k in extra if k not in labels]:
            row[k] = extra.get(k, "")
        rows.append(row)
    import pandas as pd  # loaded here so the server still starts when pandas cannot load
    df = pd.DataFrame(rows)
    shop = (await current_brand())["shop_name"]
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    await log_action(user, "export_customers", f"Exported {len(rows)} customers")
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={brand.slug(shop)}_customers.xlsx"})


@api.put("/customers/{customer_id}/dates")
async def set_customer_dates(customer_id: str, body: Dict[str, Any], user=Depends(get_current_user)):
    """Add or correct a customer's date of birth from the session page."""
    permissions.require(user, "customers_edit")
    if "dob" not in body:
        raise HTTPException(400, "Nothing to update")
    upd = {"dob": _clean_day(body["dob"], "Date of birth")}
    r = await db.customers.update_one({"id": customer_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Customer not found")
    await log_action(user, "edit_customer_dates", customer_id)
    return {"ok": True}


@api.put("/customers/{customer_id}")
async def edit_customer(customer_id: str, body: Dict[str, Any], user=Depends(get_current_user)):
    """Correct a customer's name. The mobile number is who they are and stays."""
    permissions.require(user, "customers_edit")
    name = " ".join(str(body.get("name") or "").split())
    if not name:
        raise HTTPException(400, "Name is required")
    if len(name) > 80:
        raise HTTPException(400, "Name can be at most 80 characters")
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0, "name": 1})
    if not c:
        raise HTTPException(404, "Customer not found")
    if c.get("name") != name:
        await db.customers.update_one({"id": customer_id}, {"$set": {"name": name}})
        # Sessions and the shop screen show the name they were started with.
        await db.sessions.update_many({"customer_id": customer_id}, {"$set": {"customer_name": name}})
        sids = [s["id"] async for s in db.sessions.find({"customer_id": customer_id}, {"_id": 0, "id": 1})]
        if sids:
            await db.live_previews.update_many({"session_id": {"$in": sids}}, {"$set": {"customer_name": name}})
        await log_action(user, "edit_customer", f"{c.get('name')} -> {name}")
    return {"ok": True, "name": name}


@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user=Depends(get_current_user)):
    permissions.require(user, "customers_view")
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    c["stats"] = await customer_stats(customer_id)
    c["age"] = dob_age(c.get("dob"))
    c["wa"] = (await messaging.consent_map([c.get("mobile")])).get(c.get("mobile"), {"opted_in": False, "opted_out": False})
    c["custom_fields"] = await custom_field_labels()
    c["sessions"] = await db.sessions.find(
        {"customer_id": customer_id}, {"_id": 0, "photo": 0}
    ).sort("start_time", -1).to_list(1000)
    return c


# ---------- Sessions ----------
@api.post("/sessions")
async def create_session(body: SessionIn, user=Depends(get_current_user)):
    permissions.require(user, "sessions_manage")
    body.customer_name = body.customer_name.strip()
    body.mobile = body.mobile.strip()
    body.mobile2 = (body.mobile2 or "").strip()
    if not body.customer_name or not body.mobile:
        raise HTTPException(400, "Name and mobile are required")
    # Session fields the super admin marked as required must be answered.
    missing = [f["label"] async for f in db.session_fields.find({"required": True}, {"_id": 0, "label": 1})
               if body.extra.get(f["label"]) in (None, "", False)]
    if missing:
        raise HTTPException(400, f"Please fill in: {', '.join(missing)}")
    # One open session per customer: a second one would split their try-ons.
    open_session = await db.sessions.find_one({"mobile": body.mobile, "status": "active"},
                                              {"_id": 0, "customer_name": 1})
    if open_session:
        raise HTTPException(409, f"{open_session['customer_name']} already has an open session. "
                                 "Open it from the Sessions screen, or end it first.")
    # The photo is optional. Without one the session is a "customer entry"
    # (visit + purchase log only, no try-on) until a photo is added later.
    photo = body.photo or ""
    if photo and not is_image_data(photo):
        raise HTTPException(400, "The photo is not a valid image")
    thumb = make_thumb(photo) if photo else ""
    cust_fields = {"name": body.customer_name, "mobile2": body.mobile2, "extra": body.extra}
    if body.dob is not None:
        cust_fields["dob"] = _clean_day(body.dob, "Date of birth")
    if photo:
        # Never wipe a returning customer's saved photo with an empty one.
        cust_fields.update(photo=photo, thumb=thumb)
    customer = await db.customers.find_one({"mobile": body.mobile})
    if customer:
        await db.customers.update_one({"id": customer["id"]}, {"$set": cust_fields})
        customer_id = customer["id"]
    else:
        customer_id = new_id()
        await db.customers.insert_one({
            "id": customer_id, "mobile": body.mobile, "photo": "", "thumb": "",
            "created_at": iso(), **cust_fields})
    sid = new_id()
    doc = {
        "id": sid, "customer_id": customer_id, "customer_name": body.customer_name,
        "mobile": body.mobile, "mobile2": body.mobile2, "photo": photo, "thumb": thumb,
        "has_photo": bool(photo),
        "extra": body.extra, "status": "active", "start_time": iso(), "end_time": None,
        "purchased": None, "total_value": 0, "discount": 0, "final_paid": 0,
        "admin_id": user["id"], "admin_username": user["name"],
        "wa_phone": messaging.to_e164(body.mobile), "wa_consent": body.wa_consent}
    await db.sessions.insert_one(doc)
    await log_action(user, "create_session", f"{body.customer_name} ({body.mobile})")
    if body.wa_consent is not None:
        await messaging.record_consent(doc["wa_phone"], customer_id, body.wa_consent, user["name"])
    messaging.on_session_created(doc)
    doc.pop("_id", None)
    return doc


@api.get("/sessions/active")
async def active_sessions(user=Depends(get_current_user)):
    res = await db.sessions.find({"status": "active"}, {"_id": 0, "photo": 0}).sort("start_time", -1).to_list(200)
    # One-time backfill: sessions created before thumbnails get one from their photo.
    missing = [s["id"] for s in res if "thumb" not in s]
    if missing:
        thumbs = {}
        async for s in db.sessions.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "photo": 1}):
            thumbs[s["id"]] = make_thumb(s["photo"]) if s.get("photo") else ""
            await db.sessions.update_one({"id": s["id"]}, {"$set": {"thumb": thumbs[s["id"]]}})
        for s in res:
            if s["id"] in thumbs:
                s["thumb"] = thumbs[s["id"]]
    await attach_customer_history(res)
    return res


@api.get("/sessions/today")
async def today_sessions(date: Optional[str] = None, user=Depends(get_current_user)):
    # date in YYYY-MM-DD (IST). Default: today in IST.
    day = date or datetime.now(IST).date().isoformat()
    res = await db.sessions.find(
        {"start_time": ist_range_query(day, day)}, {"_id": 0, "photo": 0}
    ).sort("start_time", -1).to_list(500)
    return res


@api.get("/sessions/history")
async def session_history(frm: Optional[str] = None, to: Optional[str] = None, user=Depends(get_current_user)):
    permissions.require(user, "history_view")
    rng = ist_range_query(frm, to)
    q = {"start_time": rng} if rng else {}
    res = await db.sessions.find(q, {"_id": 0, "photo": 0}).sort("start_time", -1).to_list(5000)
    return res


@api.get("/sessions/{sid}")
async def get_session(sid: str, user=Depends(get_current_user)):
    s = await db.sessions.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    await expire_stale_trials()
    s["trials"] = await db.trials.find(
        {"session_id": sid}, {"_id": 0, "garments.fabric_b64": 0, "clean_image": 0}
    ).sort("created_at", 1).to_list(1000)
    await refresh_watermarks(s["trials"])
    await attach_customer_history([s])
    return s


@api.post("/sessions/{sid}/photo")
async def change_photo(sid: str, body: Dict[str, str], user=Depends(get_current_user)):
    permissions.require(user, "sessions_manage")
    photo = body.get("photo")
    if not is_image_data(photo):
        raise HTTPException(400, "A valid photo is required")
    s = await db.sessions.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Session not found")
    if s.get("status") == "closed":
        raise HTTPException(400, "Session is closed")
    # Adding a photo also turns a customer-entry session into a try-on session.
    thumb = make_thumb(photo)
    await db.sessions.update_one({"id": sid}, {"$set": {"photo": photo, "thumb": thumb, "has_photo": True}})
    await db.customers.update_one({"id": s["customer_id"]}, {"$set": {"photo": photo, "thumb": thumb}})
    await log_action(user, "change_photo", f"Session {sid}")
    messaging.on_photo_added(sid)
    return {"ok": True}


@api.post("/sessions/{sid}/end")
async def end_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    permissions.require(user, "sessions_manage")
    upd = {"status": "closed", "end_time": iso(), **_session_amounts(body)}
    r = await db.sessions.update_one({"id": sid, "status": "active"}, {"$set": upd})
    if r.matched_count == 0:
        if await db.sessions.find_one({"id": sid}):
            raise HTTPException(400, "Session is already closed")
        raise HTTPException(404, "Session not found")
    await log_action(user, "end_session", f"Session {sid} purchased={upd['purchased']} paid={upd['final_paid']}")
    # The receipt goes out here only: editing a session later never re-sends it.
    messaging.on_session_ended(sid, upd["purchased"])
    return {"ok": True}


@api.patch("/sessions/{sid}")
async def edit_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    permissions.require(user, "history_edit")
    upd = _session_amounts(body)
    r = await db.sessions.update_one({"id": sid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    await log_action(user, "edit_session", f"Session {sid} purchased={upd['purchased']} paid={upd['final_paid']}")
    return {"ok": True}


@api.delete("/sessions/{sid}")
async def delete_session(sid: str, user=Depends(get_current_user)):
    permissions.require(user, "history_delete")
    await db.trials.delete_many({"session_id": sid})
    await db.sessions.delete_one({"id": sid})
    await db.live_previews.delete_many({"session_id": sid})
    await messaging.on_session_deleted(sid)
    await log_action(user, "delete_session", f"Session {sid}")
    return {"ok": True}


# ---------- Trials ----------
# A try-on normally takes under a minute. One still "generating" after this long
# was lost (server restart or crash) and is marked failed so staff can retry.
STALE_TRIAL_MINUTES = 10
# Keep references to running generations; asyncio only holds weak references,
# so an unreferenced task can be garbage-collected mid-run.
_generation_tasks = set()


async def expire_stale_trials():
    cutoff = (now_utc() - timedelta(minutes=STALE_TRIAL_MINUTES)).isoformat()
    await db.trials.update_many(
        {"status": "generating", "created_at": {"$lt": cutoff}},
        {"$set": {"status": "failed", "error": "Generation took too long. Please try again."}})


def friendly_generation_error(e: Exception) -> str:
    """Short message for shop staff; the full error goes to the server log."""
    msg = str(e).lower()
    if "insufficient_quota" in msg or "billing" in msg:
        return "AI credits are used up. Ask the owner to add OpenAI credits."
    if "rate limit" in msg or "rate_limit" in msg or "429" in msg:
        return "The AI is busy right now. Please try again in a minute."
    if "moderation" in msg or "safety" in msg or "content_policy" in msg:
        return "The AI refused these photos. Try a clearer customer or fabric photo."
    if "timed out" in msg or "timeout" in msg or "connection" in msg:
        return "Could not reach the AI service. Check the internet and try again."
    if "api key" in msg or "api_key" in msg:
        return "The AI key is not set up correctly. Ask the owner to check it."
    return "Image generation failed. Please try again."


# ---------- Watermark ----------
# Try-on images are stored twice: `clean_image` (untouched AI output) and
# `generated_image` (with the brand watermark, what every screen shows).
# `wm_sig` records which watermark text was burned in; when the super admin
# changes the text, images are re-watermarked from the clean copy on next view.
_WM_KEYS = {"text": "watermark_text", "style": "watermark_style",
            "visibility": "watermark_visibility", "weight": "watermark_weight"}


async def current_watermark():
    """(config, signature) of the watermark set by the super admin."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, **{v: 1 for v in _WM_KEYS.values()}}) or {}
    cfg = watermark.normalize({k: s.get(v) for k, v in _WM_KEYS.items()})
    sig = hashlib.md5("\x1f".join(cfg[k] for k in sorted(cfg)).encode()).hexdigest()
    return cfg, sig


async def watermarked_fields(clean: str, wm=None) -> Dict[str, str]:
    cfg, sig = wm or await current_watermark()
    image = await asyncio.to_thread(watermark.apply, clean, cfg)
    return {"clean_image": clean, "generated_image": image, "wm_sig": sig}


async def refresh_watermarks(trials: List[Dict[str, Any]]):
    """Re-watermark any finished trial in `trials` stamped with an old watermark (in place)."""
    wm = await current_watermark()
    stale = [t for t in trials if t.get("generated_image") and t.get("wm_sig") != wm[1]]
    if not stale:
        return
    cleans = {}
    async for t in db.trials.find({"id": {"$in": [t["id"] for t in stale]}},
                                  {"_id": 0, "id": 1, "clean_image": 1, "generated_image": 1}):
        # Trials made before watermarking have only the clean image.
        cleans[t["id"]] = t.get("clean_image") or t.get("generated_image")
    for t in stale:
        clean = cleans.get(t["id"])
        if not clean:
            continue
        fields = await watermarked_fields(clean, wm)
        await db.trials.update_one({"id": t["id"]}, {"$set": fields})
        t["generated_image"], t["wm_sig"] = fields["generated_image"], fields["wm_sig"]


async def _run_generation(tid, photo, garments):
    try:
        image, usage = await image_service.generate_tryon(photo, garments)
        fields = await watermarked_fields(image)
        await db.trials.update_one(
            {"id": tid}, {"$set": {**fields, "status": "done", "usage": usage}})
        logger.info(f"Try-on {tid} usage: {usage}")
    except Exception as e:
        logger.error(f"Image generation error (trial {tid}): {e}")
        await db.trials.update_one(
            {"id": tid}, {"$set": {"status": "failed", "error": friendly_generation_error(e)}})


async def _validated_garments(body: GenerateIn) -> List[Dict[str, Any]]:
    """Check the garments and attach each item's AI description from its category."""
    if not body.garments:
        raise HTTPException(400, "Add at least one garment")
    if len(body.garments) > MAX_GARMENTS:
        raise HTTPException(400, f"At most {MAX_GARMENTS} garments per try-on")
    # The chosen category's description wins; otherwise any category's item of
    # that name (the catalog flow picks styles without a category).
    item_desc: Dict[str, str] = {}
    async for c in db.categories.find({}, {"_id": 0, "label": 1, "items": 1}):
        for it in c.get("items") or []:
            if it.get("description") and (c.get("label") == body.type or it.get("label") not in item_desc):
                item_desc[it.get("label")] = it["description"]
    ids = [str(g.get("catalog_id")) for g in body.garments if g.get("catalog_id")]
    catalog = {c["id"]: c async for c in db.catalog.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "code": 1, "image": 1})} if ids else {}
    out, seen = [], set()
    for g in body.garments:
        slot = str(g.get("slot", "")).strip().lower()
        gtype = str(g.get("garment_type", "")).strip()
        fabric, fabric_name = g.get("fabric_b64"), ""
        if g.get("catalog_id"):
            item = catalog.get(str(g["catalog_id"]))
            if not item:
                raise HTTPException(400, "A chosen fabric was removed from the catalog. Pick it again.")
            fabric = item["image"]
            fabric_name = item["name"] + (f" ({item['code']})" if item.get("code") else "")
        if slot not in SLOTS or slot in seen:
            raise HTTPException(400, "Each garment needs a different slot: top, bottom or third")
        if not gtype:
            raise HTTPException(400, "Choose a garment type for every fabric")
        if not is_image_data(fabric):
            raise HTTPException(400, "Every garment needs a fabric photo")
        seen.add(slot)
        desc = item_desc.get(gtype) or DEFAULT_ITEM_DESCRIPTIONS.get(gtype, "")
        out.append({"slot": slot, "garment_type": gtype, "description": desc,
                    "fabric_b64": fabric, "fabric_name": fabric_name})
    return out


@api.post("/sessions/{sid}/trials/generate")
async def generate_trial(sid: str, body: GenerateIn, user=Depends(get_current_user)):
    permissions.require(user, "trials_create")
    s = await db.sessions.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Session not found")
    if s.get("status") == "closed":
        raise HTTPException(400, "Session is closed")
    if not s.get("photo"):
        raise HTTPException(400, "Add the customer's photo to start try-on")
    garments = await _validated_garments(body)
    description = " + ".join(f"{g['slot']}: {g['garment_type']}" for g in garments)
    tid = new_id()
    # Same photo + same fabrics + same garments = same try-on. Reuse the earlier
    # image instead of paying OpenAI again (e.g. a double tap or retry).
    h = hashlib.sha256(s["photo"].encode())
    for g in garments:
        h.update(f"|{g['slot']}|{g['garment_type']}|{g['description']}|".encode())
        h.update(g["fabric_b64"].encode())
    input_hash = h.hexdigest()
    prev = await db.trials.find_one(
        {"session_id": sid, "input_hash": input_hash, "status": "done"},
        {"_id": 0, "generated_image": 1, "clean_image": 1, "wm_sig": 1})
    # Title of the look: the category (older clients) or the catalog fabric names.
    title = body.type.strip() or " + ".join(
        g["fabric_name"] or g["garment_type"] for g in garments)
    doc = {
        "id": tid, "session_id": sid, "type": title,
        "garments": [{k: g[k] for k in ("slot", "garment_type", "fabric_b64", "fabric_name")}
                     for g in garments],
        "fabric_thumb": make_thumb(garments[0]["fabric_b64"], 120) or garments[0]["fabric_b64"],
        "generated_image": "",
        "description": description, "status": "generating", "input_hash": input_hash,
        "created_at": iso(), "expire_at": now_utc() + timedelta(days=7)}
    if prev and prev.get("generated_image"):
        doc.update(generated_image=prev["generated_image"], status="done",
                   clean_image=prev.get("clean_image") or prev["generated_image"],
                   wm_sig=prev.get("wm_sig"), usage={"reused": True, "cost_usd": 0})
    await db.trials.insert_one(doc)
    # Generate in the background so the HTTP request returns immediately and
    # never hits the Cloudflare/origin timeout. Client polls GET /trials/{tid}.
    if doc["status"] == "generating":
        task = asyncio.create_task(_run_generation(tid, s["photo"], garments))
        _generation_tasks.add(task)
        task.add_done_callback(_generation_tasks.discard)
    await log_action(user, "generate_trial", f"Session {sid}: {description}")
    doc.pop("_id", None)
    doc.pop("garments", None)
    doc.pop("clean_image", None)
    return doc


@api.get("/trials/{tid}/status")
async def get_trial_status(tid: str, user=Depends(get_current_user)):
    await expire_stale_trials()
    tr = await db.trials.find_one({"id": tid}, {"_id": 0, "status": 1, "error": 1})
    if not tr:
        raise HTTPException(404, "Trial not found")
    return {"status": tr.get("status", "generating"), "error": tr.get("error", "")}


@api.get("/trials/{tid}")
async def get_trial(tid: str, user=Depends(get_current_user)):
    tr = await db.trials.find_one({"id": tid}, {"_id": 0, "garments.fabric_b64": 0, "clean_image": 0})
    if not tr:
        raise HTTPException(404, "Trial not found")
    await refresh_watermarks([tr])
    return tr


@api.patch("/trials/{tid}/star")
async def star_trial(tid: str, body: Dict[str, bool], user=Depends(get_current_user)):
    """Staff star the customer's favourite looks (used by the follow-up message)."""
    permissions.require(user, "trials_create")
    r = await db.trials.update_one({"id": tid}, {"$set": {"starred": bool(body.get("starred"))}})
    if r.matched_count == 0:
        raise HTTPException(404, "Trial not found")
    return {"ok": True}


@api.delete("/trials/{tid}")
async def delete_trial(tid: str, user=Depends(get_current_user)):
    permissions.require(user, "trials_delete")
    tr = await db.trials.find_one({"id": tid}, {"_id": 0, "session_id": 1, "description": 1})
    if not tr:
        raise HTTPException(404, "Trial not found")
    await db.trials.delete_one({"id": tid})
    await log_action(user, "delete_trial", f"Session {tr['session_id']}: {tr.get('description', '')}")
    return {"ok": True}


# ---------- Fabric catalog ----------
# Fabrics the super admin photographs once, so staff pick a swatch by name or
# code instead of photographing it for every customer. The list carries no
# images: staff search it in the browser and thumbnails load lazily from their
# own URL, which browsers cache.
CATALOG_LIST_FIELDS = {"_id": 0, "id": 1, "name": 1, "code": 1, "category_id": 1,
                       "garment_type": 1, "description": 1, "keywords": 1, "v": 1}


async def _with_category_labels(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add each fabric's current category name (searchable, follows renames)."""
    labels = {c["id"]: c["label"] async for c in db.categories.find({}, {"_id": 0, "id": 1, "label": 1})}
    for it in items:
        it["category"] = labels.get(it.get("category_id"), "")
    return items


async def _clean_catalog(body: CatalogIn, cid: Optional[str] = None) -> Dict[str, Any]:
    name = " ".join(body.name.split())
    if not name:
        raise HTTPException(400, "Fabric name is required")
    code = " ".join(body.code.split()).upper()
    not_me = {"id": {"$ne": cid}} if cid else {}
    if await db.catalog.find_one({"name_key": _name_key(name), **not_me}, {"_id": 1}):
        raise HTTPException(400, f'A fabric named "{name}" already exists')
    if code and await db.catalog.find_one({"code_key": _code_key(code), **not_me}, {"_id": 1}):
        raise HTTPException(400, f'Code "{code}" is already used by another fabric')
    cat = await db.categories.find_one({"id": body.category_id, "kind": "single"}, {"_id": 0})
    if not cat:
        raise HTTPException(400, "Choose the fabric's category")
    styles = {it["label"].casefold(): it["label"] for it in cat.get("items") or []}
    style = body.garment_type.strip()
    if style and style.casefold() not in styles:
        raise HTTPException(400, f'"{style}" is not a style of {cat["label"]}')
    doc = {"name": name, "name_key": _name_key(name), "code": code, "code_key": _code_key(code),
           "category_id": cat["id"], "garment_type": styles.get(style.casefold(), ""),
           "description": body.description.strip(), "keywords": " ".join(body.keywords.split()),
           "updated_at": iso()}
    if body.image:
        doc.update(_catalog_images(body.image), v=int(now_utc().timestamp()))
    elif not cid:
        raise HTTPException(400, "Add a fabric photo")
    return doc


def _super_only(user):
    """Catalog changes (name kept from before permissions existed)."""
    permissions.require(user, "catalog_manage")


@api.get("/catalog")
async def list_catalog(user=Depends(get_current_user)):
    items = await db.catalog.find({}, CATALOG_LIST_FIELDS).sort("name_key", 1).to_list(10000)
    return await _with_category_labels(items)


@api.get("/catalog/{cid}/thumb")
async def catalog_thumb(cid: str):
    # Public like the in-store display: an <img> cannot send the login header,
    # and the id is a random UUID. The URL carries ?v=, so cache it for good.
    item = await db.catalog.find_one({"id": cid}, {"_id": 0, "thumb": 1})
    if not item or not item.get("thumb"):
        raise HTTPException(404, "Not found")
    return Response(content=base64.b64decode(item["thumb"].split(",", 1)[1]), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@api.post("/catalog")
async def add_catalog(body: CatalogIn, user=Depends(get_current_user)):
    _super_only(user)
    doc = {"id": new_id(), **await _clean_catalog(body), "created_at": iso()}
    try:
        await db.catalog.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(400, f'A fabric named "{doc["name"]}" already exists')
    await log_action(user, "add_catalog", doc["name"])
    return (await _with_category_labels([{k: doc[k] for k in CATALOG_LIST_FIELDS if k != "_id" and k in doc}]))[0]


@api.put("/catalog/{cid}")
async def update_catalog(cid: str, body: CatalogIn, user=Depends(get_current_user)):
    _super_only(user)
    if not await db.catalog.find_one({"id": cid}, {"_id": 1}):
        raise HTTPException(404, "Fabric not found")
    doc = await _clean_catalog(body, cid)
    try:
        await db.catalog.update_one({"id": cid}, {"$set": doc})
    except DuplicateKeyError:
        raise HTTPException(400, f'A fabric named "{doc["name"]}" already exists')
    await log_action(user, "update_catalog", doc["name"])
    return (await _with_category_labels([await db.catalog.find_one({"id": cid}, CATALOG_LIST_FIELDS)]))[0]


@api.delete("/catalog/{cid}")
async def delete_catalog(cid: str, user=Depends(get_current_user)):
    _super_only(user)
    item = await db.catalog.find_one_and_delete({"id": cid}, {"_id": 0, "name": 1})
    if not item:
        raise HTTPException(404, "Fabric not found")
    await log_action(user, "delete_catalog", item["name"])
    return {"ok": True}


# ---------- Config: trial categories & session fields ----------
@api.get("/config/categories")
async def get_categories(user=Depends(get_current_user)):
    cats = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return cats


@api.post("/config/categories")
async def add_category(body: CategoryIn, user=Depends(get_current_user)):
    permissions.require(user, "catalog_manage")
    doc = {"id": new_id(), **await _clean_category(body)}
    await db.categories.insert_one(doc)
    await log_action(user, "add_category", doc["label"])
    doc.pop("_id", None)
    return doc


@api.put("/config/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, user=Depends(get_current_user)):
    permissions.require(user, "catalog_manage")
    if not await db.categories.find_one({"id": cid}, {"_id": 1}):
        raise HTTPException(404, "Category not found")
    clean = await _clean_category(body, cid)
    await db.categories.update_one({"id": cid}, {"$set": clean})
    await log_action(user, "update_category", clean["label"])
    return {"ok": True}


@api.delete("/config/categories/{cid}")
async def delete_category(cid: str, user=Depends(get_current_user)):
    permissions.require(user, "catalog_manage")
    cat = await db.categories.find_one({"id": cid}, {"_id": 0, "label": 1})
    if not cat:
        raise HTTPException(404, "Category not found")
    group = await db.categories.find_one({"members": cid}, {"_id": 0, "label": 1})
    if group:
        raise HTTPException(400, f'{cat["label"]} is part of "{group["label"]}". Remove it from that group first.')
    used = await db.catalog.count_documents({"category_id": cid})
    if used:
        raise HTTPException(400, f'{used} fabric(s) in the collection use {cat["label"]}. Move or delete them first.')
    await db.categories.delete_one({"id": cid})
    await log_action(user, "delete_category", cat["label"])
    return {"ok": True}


@api.get("/config/fields")
async def get_fields(user=Depends(get_current_user)):
    return await db.session_fields.find({}, {"_id": 0}).sort("order", 1).to_list(100)


@api.post("/config/fields")
async def add_field(body: FieldIn, user=Depends(get_current_user)):
    permissions.require(user, "settings_manage")
    body.label = body.label.strip()
    if not body.label:
        raise HTTPException(400, "Field label is required")
    if body.type not in ("text", "number", "date", "checkbox"):
        raise HTTPException(400, "Type must be text, number, date or checkbox")
    doc = {"id": new_id(), **body.model_dump()}
    await db.session_fields.insert_one(doc)
    await log_action(user, "add_field", body.label)
    doc.pop("_id", None)
    return doc


@api.patch("/config/fields/{fid}")
async def update_field(fid: str, body: Dict[str, Any], user=Depends(get_current_user)):
    """Make a session field required or optional."""
    permissions.require(user, "settings_manage")
    r = await db.session_fields.update_one({"id": fid}, {"$set": {"required": bool(body.get("required"))}})
    if r.matched_count == 0:
        raise HTTPException(404, "Field not found")
    return {"ok": True}


@api.delete("/config/fields/{fid}")
async def delete_field(fid: str, user=Depends(get_current_user)):
    permissions.require(user, "settings_manage")
    f = await db.session_fields.find_one({"id": fid}, {"_id": 0, "label": 1})
    await db.session_fields.delete_one({"id": fid})
    await log_action(user, "delete_field", f["label"] if f else fid)
    return {"ok": True}


# ---------- Settings (idle image, display secret) ----------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "brand_logo": 0})
    return s or {}


# ---------- General (shop name, logo, address, hours, contact, social) ----------
async def current_brand() -> Dict[str, Any]:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "brand": 1, "brand_logo_v": 1}) or {}
    out = brand.merged(s.get("brand"))
    v = s.get("brand_logo_v") or ""
    out["logo"] = f"/api/public/logo?v={v}" if v else ""
    return out


@api.get("/public/brand")
async def public_brand():
    """What the public site, login screen and shop screen show. No sign-in needed."""
    return await current_brand()


@api.get("/public/logo")
async def public_logo(v: Optional[str] = None):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "brand_logo": 1}) or {}
    logo = s.get("brand_logo") or ""
    if not logo:
        raise HTTPException(404, "No logo")
    raw = base64.b64decode(logo.split(",", 1)[1])
    # The URL carries the logo's version, so browsers may keep it for a long time.
    cache = "public, max-age=31536000, immutable" if v else "public, max-age=300"
    return Response(content=raw, media_type="image/png", headers={"Cache-Control": cache})


@api.put("/settings/brand")
async def update_brand(body: Dict[str, Any], user=Depends(get_current_user)):
    permissions.require(user, "settings_manage")
    fields = brand.clean(body)
    stored = (await db.settings.find_one({"id": "global"}, {"_id": 0, "brand": 1}) or {}).get("brand") or {}
    keep, older = brand.upgrade(stored, fields)
    upd: Dict[str, Any] = {f"brand.{k}": v for k, v in {**keep, **fields}.items()}
    if "logo" in body:
        logo = body.get("logo") or ""
        if logo.startswith("/api/public/logo"):
            pass  # unchanged
        elif logo:
            png = await asyncio.to_thread(brand.logo_image, logo)
            upd.update(brand_logo=png, brand_logo_v=brand.logo_version(png))
        else:
            upd.update(brand_logo="", brand_logo_v="")
    if not upd:
        raise HTTPException(400, "Nothing to update")
    change: Dict[str, Any] = {"$set": upd}
    if older:
        change["$unset"] = {f"brand.{k}": "" for k in older}
    await db.settings.update_one({"id": "global"}, change, upsert=True)
    await log_action(user, "update_general", ", ".join(sorted(
        {k.split(".", 1)[-1] for k in {**fields, **({"logo": 1} if "logo" in body else {})}})))
    return await current_brand()


def _watermark_settings(body: Dict[str, Any]) -> Dict[str, str]:
    """Validated watermark fields present in `body` (settings key -> value)."""
    out = {}
    if "watermark_text" in body:
        lines = [ln.strip() for ln in str(body.get("watermark_text") or "").replace("\r", "").split("\n")]
        lines = [ln for ln in lines if ln]
        if len(lines) > watermark.MAX_LINES:
            raise HTTPException(400, f"Watermark can have at most {watermark.MAX_LINES} lines")
        if any(len(ln) > 40 for ln in lines):
            raise HTTPException(400, "Each watermark line can be at most 40 characters")
        out["watermark_text"] = "\n".join(lines)
    for key, allowed in (("watermark_style", watermark.STYLES), ("watermark_visibility", watermark.VISIBILITY),
                         ("watermark_weight", watermark.WEIGHTS)):
        if key in body:
            if body[key] not in allowed:
                raise HTTPException(400, f"Invalid {key.replace('_', ' ')}")
            out[key] = body[key]
    return out


@api.post("/settings/watermark-preview")
async def watermark_preview(body: Dict[str, Any], user=Depends(get_current_user)):
    """Render unsaved watermark settings on the latest try-on (or a plain image)."""
    permissions.require(user, "settings_manage")
    fields = _watermark_settings(body)
    cfg = watermark.normalize({k: fields.get(v) for k, v in _WM_KEYS.items()})
    latest = await db.trials.find_one(
        {"status": "done"}, {"_id": 0, "clean_image": 1, "generated_image": 1}, sort=[("created_at", -1)])
    src = (latest or {}).get("clean_image") or ""
    base = await asyncio.to_thread(watermark.preview_base, src)
    return {"image": await asyncio.to_thread(watermark.apply, base, cfg)}


@api.put("/settings")
async def update_settings(body: Dict[str, Any], user=Depends(get_current_user)):
    permissions.require(user, "settings_manage")
    # Only these fields are editable; the display secret and anything else sent
    # by the client are ignored. Fields left out of the request are unchanged.
    upd = {}
    if "idle_image" in body:
        idle = body.get("idle_image") or ""
        if idle and not is_image_data(idle):
            raise HTTPException(400, "Idle image must be an image file")
        if len(idle) > 8 * 1024 * 1024:
            raise HTTPException(400, "Idle image is too large (max ~6 MB)")
        upd["idle_image"] = idle
    upd.update(_watermark_settings(body))
    if "app_language" in body:
        if body["app_language"] not in APP_LANGUAGES:
            raise HTTPException(400, "Language must be hinglish, english or hindi")
        upd["app_language"] = body["app_language"]
    if not upd:
        raise HTTPException(400, "Nothing to update")
    await db.settings.update_one({"id": "global"}, {"$set": upd})
    await log_action(user, "update_settings", ", ".join(
        f"{k}={upd[k]!r}" if k.startswith("watermark") else k for k in upd))
    return {"ok": True}


# ---------- Live Display ----------
# Every open preview (each screen of each admin, on any device) gets its own
# block on the shop screen: one try-on (`trial_id`) or every finished try-on
# of a session ("show all", `session_id`). A preview is `pid` = admin id +
# the device's own preview id, so two phones of one admin never clash.
# Blocks are ordered by `started_at` (first in, first out). Moving to another
# look only changes what the block shows, never its place; `seq` (from the
# device) makes a late, older request unable to undo a newer one.
# Previews not seen for PREVIEW_STALE seconds drop off (closed tab, locked
# phone); the app also removes its preview the moment it closes or hides.
PREVIEW_STALE = 9


def _pid(user: Dict[str, Any], preview_id: Any) -> str:
    raw = re.sub(r"[^A-Za-z0-9_-]", "", str(preview_id or ""))[:40]
    return f"{user['id']}:{raw}" if raw else user["id"]


@api.post("/display/preview")
async def set_preview(body: Dict[str, Any], user=Depends(get_current_user)):
    if body.get("trial_id"):
        trial = await db.trials.find_one({"id": body["trial_id"]}, {"_id": 0, "id": 1,
                                                                    "session_id": 1, "description": 1})
        if not trial:
            raise HTTPException(404, "Trial not found")
        sid, fields = trial["session_id"], {"mode": "trial", "trial_id": trial["id"],
                                            "description": trial["description"]}
    elif body.get("session_id"):
        sid, fields = body["session_id"], {"mode": "session", "trial_id": None,
                                           "description": "All try-ons"}
    else:
        raise HTTPException(400, "trial_id or session_id is required")
    session = await db.sessions.find_one({"id": sid}, {"_id": 0, "customer_name": 1, "start_time": 1})
    if not session:
        raise HTTPException(404, "Session not found")
    pid = _pid(user, body.get("preview_id"))
    try:
        seq = int(body.get("seq") or 0)
    except (TypeError, ValueError):
        seq = 0
    cur = await db.live_previews.find_one({"pid": pid}, {"_id": 0, "seq": 1})
    if cur and (cur.get("seq") or 0) > seq:
        return {"ok": True, "stale": True}
    await db.live_previews.update_one(
        {"pid": pid},
        {"$set": {
            "pid": pid, "admin_id": user["id"], "admin_username": user["name"], "session_id": sid,
            "customer_name": session.get("customer_name", ""), "seq": seq, "closed": False,
            "start_time": session.get("start_time", ""), "updated_at": iso(), **fields},
         "$setOnInsert": {"started_at": iso()}},
        upsert=True)
    # A block remembered as closed may have no start yet: give it one now,
    # once, so its place on the screen never moves.
    await db.live_previews.update_one({"pid": pid, "started_at": {"$exists": False}}, {"$set": {"started_at": iso()}})
    return {"ok": True}


@api.post("/display/heartbeat")
async def heartbeat(body: Optional[Dict[str, Any]] = None, user=Depends(get_current_user)):
    pid = _pid(user, (body or {}).get("preview_id"))
    await db.live_previews.update_one({"pid": pid}, {"$set": {"updated_at": iso()}})
    return {"ok": True}


@api.delete("/display/preview")
async def clear_preview(preview_id: Optional[str] = None, seq: Optional[int] = None, user=Depends(get_current_user)):
    pid = _pid(user, preview_id)
    if seq is None:
        await db.live_previews.delete_one({"pid": pid})
    else:
        # Closed, but remembered briefly with its `seq`, so a request sent
        # just before closing can't bring the block back. A close older than
        # what the block shows now (it arrived late) is ignored.
        cur = await db.live_previews.find_one({"pid": pid}, {"_id": 0, "seq": 1})
        if cur and (cur.get("seq") or 0) > seq:
            return {"ok": True, "stale": True}
        await db.live_previews.update_one({"pid": pid}, {"$set": {"pid": pid, "admin_id": user["id"], "closed": True,
                                                                  "seq": seq, "updated_at": iso()}}, upsert=True)
    old = (now_utc() - timedelta(minutes=2)).isoformat()
    await db.live_previews.delete_many({"closed": True, "updated_at": {"$lt": old}})
    return {"ok": True}


@api.get("/display/{secret}/state")
async def display_state(secret: str, v: Optional[str] = None):
    s = await db.settings.find_one(
        {"id": "global"}, {"_id": 0, "display_secret": 1, "idle_image": 1})
    if not s or s.get("display_secret") != secret:
        raise HTTPException(404, "Not found")
    cutoff = (now_utc() - timedelta(seconds=PREVIEW_STALE)).isoformat()
    previews = await db.live_previews.find(
        {"updated_at": {"$gte": cutoff}, "closed": {"$ne": True}}, {"_id": 0}
    ).to_list(12)
    for p in previews:
        p["pid"] = p.get("pid") or p["admin_id"]
    # First in, first out: a block keeps its place until its preview closes.
    previews.sort(key=lambda p: (p.get("started_at") or "", p["pid"]))
    # The same thing shown from two places is one block (the first one).
    seen, unique = set(), []
    for p in previews:
        what = (p.get("mode"), p.get("trial_id") if p.get("mode") == "trial" else p.get("session_id"))
        if what not in seen:
            seen.add(what)
            unique.append(p)
    previews = unique[:8]

    # Which finished try-ons each preview shows (ids only; images come later).
    show_all = [p["session_id"] for p in previews if p.get("mode") == "session"]
    session_trials: Dict[str, List[str]] = {}
    if show_all:
        async for tr in db.trials.find(
                {"session_id": {"$in": show_all}, "status": "done"},
                {"_id": 0, "id": 1, "session_id": 1}).sort("created_at", 1):
            session_trials.setdefault(tr["session_id"], []).append(tr["id"])
    for p in previews:
        p["trial_ids"] = (session_trials.get(p["session_id"], []) if p.get("mode") == "session"
                          else [p["trial_id"]] if p.get("trial_id") else [])

    # version changes only when the visible content changes (tiles, their
    # try-ons, idle screen or watermark), so clients skip re-downloading images.
    idle_img = s.get("idle_image") or ""
    slides = await display_media.slides()
    wm_sig = (await current_watermark())[1]
    raw_v = "|".join(f"{p['pid']}:{','.join(p['trial_ids'])}" for p in previews)
    raw_v += "#" + hashlib.md5(idle_img.encode()).hexdigest() + "#" + wm_sig
    raw_v += "#" + ",".join(f"{x['id']}:{x['seconds']}" for x in slides)
    version = hashlib.md5(raw_v.encode()).hexdigest()
    if v and v == version:
        return {"unchanged": True, "version": version}

    wanted = [tid for p in previews for tid in p["trial_ids"]]
    trials = {}
    if wanted:
        docs = await db.trials.find(
            {"id": {"$in": wanted}},
            {"_id": 0, "id": 1, "generated_image": 1, "description": 1, "wm_sig": 1}).to_list(200)
        await refresh_watermarks(docs)
        trials = {d["id"]: d for d in docs if d.get("generated_image")}
    out = []
    for p in previews:
        images = [{"id": tid, "image": trials[tid]["generated_image"],
                   "description": trials[tid].get("description", "")}
                  for tid in p["trial_ids"] if tid in trials]
        if images:
            out.append({"pid": p["pid"], "admin_id": p["admin_id"], "mode": p.get("mode", "trial"),
                        "customer_name": p.get("customer_name", ""),
                        "description": p.get("description", ""),
                        "start_time": p.get("start_time", ""), "images": images})
    return {"previews": out, "idle_image": idle_img, "slides": slides, "version": version}


# ---------- Stats ----------
@api.get("/stats")
async def stats(frm: Optional[str] = None, to: Optional[str] = None, user=Depends(get_current_user)):
    permissions.require(user, "stats_view")
    q = {"status": "closed"}
    rng = ist_range_query(frm, to)
    if rng:
        q["start_time"] = rng
    sessions = await db.sessions.find(q, {"_id": 0, "photo": 0}).to_list(10000)
    purchased = [s for s in sessions if s.get("purchased")]
    return {
        "total_sessions": len(sessions),
        "purchased": len(purchased),
        "not_purchased": len(sessions) - len(purchased),
        "total_earnings": sum(float(s.get("final_paid") or 0) for s in purchased),
        "total_value": sum(float(s.get("total_value") or 0) for s in purchased),
        "total_discount": sum(float(s.get("discount") or 0) for s in purchased),
    }


# ---------- Logs ----------
@api.get("/logs")
async def get_logs(limit: int = 300, user=Depends(get_current_user)):
    permissions.require(user, "logs_view")
    limit = max(1, min(limit, 1000))
    return await db.logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.get("/")
async def root():
    return {"message": "Shop API"}


@app.get("/health")
async def health():
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=2.0)
    except Exception as e:
        logger.error(f"Health check DB ping failed: {e}")
        raise HTTPException(503, "Database unavailable")
    return {"status": "ok"}


app.include_router(api)
app.include_router(messaging.router)
app.include_router(messaging.public_router)
app.include_router(websites.router)
app.include_router(websites.public_router)
app.include_router(display_media.router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])


# Garment knowledge sent to the AI with each try-on. These are the defaults; the
# super admin can edit any item's description in Settings -> Config, and an
# edited description is never overwritten.
DEFAULT_ITEM_DESCRIPTIONS = {
    "Full Sleeve Shirt": (
        "Formal full-sleeve shirt with a pointed collar, front button placket and buttoned "
        "cuffs at the wrists. The hem ends at the hips. Tucked into trousers when worn with "
        "trousers; worn untucked otherwise."),
    "Half Sleeve Shirt": (
        "Casual short-sleeve shirt with a pointed collar and front button placket. The sleeves "
        "end above the elbow. The hem ends at the hips and is worn untucked."),
    "Kurta": (
        "Traditional Indian kurta: a long, straight tunic that reaches the knees, with full "
        "sleeves, a short band (mandarin) collar, a half-length button placket and side slits "
        "at the hem. Always worn untucked. Its full length down to the hem must be visible."),
    "Trousers": (
        "Formal flat-front trousers with a straight leg, belt loops and a pressed front crease, "
        "reaching the ankles."),
    "Pyjama": (
        "Traditional Indian pyjama: loose, straight, relaxed-fit pants with a drawstring waist, "
        "reaching the ankles."),
    "Kurta Pyjama Bottom": (
        "Pyjama made to be worn under a kurta: slim straight fit, ankle length, drawstring "
        "waist. The kurta covers the waist."),
    "Suit Jacket": (
        "Tailored single-breasted suit blazer with notch lapels, two front buttons, full sleeves "
        "and hip length. Worn over the shirt; the shirt collar shows between the lapels."),
    "Koti / Nehru Jacket": (
        "Sleeveless Nehru jacket (koti) with a short stand-up band collar, a straight button "
        "front and hip length. Worn buttoned over the kurta or shirt, whose sleeves stay "
        "visible."),
}

# Descriptions from earlier versions of the seed. Items still using one of these
# (i.e. never edited by the admin) are upgraded to the richer defaults above.
_OLD_SEED_DESCRIPTIONS = {
    "", "A formal full sleeve shirt", "A casual half sleeve shirt",
    "A traditional Indian kurta", "Formal trousers / pants", "Traditional pyjama",
    "Pyjama paired with kurta", "A tailored suit blazer", "Traditional Indian waistcoat (koti)",
}


def _items(*labels):
    return [{"label": lb, "description": DEFAULT_ITEM_DESCRIPTIONS[lb]} for lb in labels]


DEFAULT_CATEGORIES = [
    {"label": "Top Wear", "description": "Upper garments like shirts and kurtas", "order": 1,
     "slot_count": 1, "slots": ["top"],
     "items": _items("Full Sleeve Shirt", "Half Sleeve Shirt", "Kurta")},
    {"label": "Bottom Wear", "description": "Lower garments like trousers and pyjama", "order": 2,
     "slot_count": 1, "slots": ["bottom"],
     "items": _items("Trousers", "Pyjama", "Kurta Pyjama Bottom")},
    {"label": "Top + Bottom", "description": "A full outfit with top and bottom", "order": 3,
     "slot_count": 2, "slots": ["top", "bottom"],
     "items": _items("Full Sleeve Shirt", "Half Sleeve Shirt", "Kurta", "Trousers", "Pyjama")},
    {"label": "Top + Bottom + 3rd", "description": "Top, bottom and a third layer like suit or koti", "order": 4,
     "slot_count": 3, "slots": ["top", "bottom", "third"],
     "items": _items("Full Sleeve Shirt", "Kurta", "Trousers", "Pyjama", "Suit Jacket",
                     "Koti / Nehru Jacket")},
]


async def _upgrade_item_descriptions():
    async for cat in db.categories.find({}, {"_id": 0, "id": 1, "items": 1, "slots": 1, "kind": 1}):
        items, upd = cat.get("items") or [], {}
        for it in items:
            default = DEFAULT_ITEM_DESCRIPTIONS.get(it.get("label"))
            if default and (it.get("description") or "").strip() in _OLD_SEED_DESCRIPTIONS:
                it["description"] = default
                upd["items"] = items
        # Categories added before slots were saved correctly have none, which
        # makes New Trial unusable for them. Default them to a single top slot.
        if not cat.get("slots") and not cat.get("kind"):
            upd.update(slots=["top"], slot_count=1)
        if upd:
            await db.categories.update_one({"id": cat["id"]}, {"$set": upd})


_POSITION_DEFAULT_NAME = {"top": "Top Wear", "bottom": "Bottom Wear", "third": "Layer Wear"}


async def _migrate_category_kinds():
    """Older categories listed slots and mixed items. One-slot ones become single
    categories; multi-slot ones become groups of single categories (created when
    missing, e.g. "Layer Wear" for Suit Jacket and Koti)."""
    cats = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    if not all(c.get("kind") for c in cats):
        await _categories_to_kinds(cats)
    # Fabrics saved with a free-text category before categories were linked.
    cats = await db.categories.find({"kind": "single"}, {"_id": 0}).to_list(500)
    by_label = {c["label"].casefold(): c["id"] for c in cats}
    by_style = {it["label"]: c["id"] for c in cats for it in c.get("items") or []}
    async for f in db.catalog.find({"category_id": {"$exists": False}}, {"_id": 0, "id": 1, "category": 1, "garment_type": 1}):
        cid = by_label.get((f.get("category") or "").casefold()) or by_style.get(f.get("garment_type"), "")
        await db.catalog.update_one({"id": f["id"]}, {"$set": {"category_id": cid}, "$unset": {"category": ""}})


async def _categories_to_kinds(cats):
    singles = {}  # position -> category doc
    for c in cats:
        if c.get("kind") == "single":
            singles.setdefault(c["position"], c)
    for c in cats:
        if not c.get("kind") and len(c.get("slots") or []) <= 1:
            pos = (c.get("slots") or ["top"])[0]
            c.update(kind="single", position=pos, members=[], slots=[pos], slot_count=1)
            await db.categories.update_one({"id": c["id"]}, {"$set": {
                k: c[k] for k in ("kind", "position", "members", "slots", "slot_count")}})
            singles.setdefault(pos, c)
    labels = {c["label"].casefold() for c in cats}
    for c in cats:
        if c.get("kind"):
            continue
        members = []
        for pos in c["slots"]:
            if pos not in singles:
                name = _POSITION_DEFAULT_NAME.get(pos, pos.title())
                while name.casefold() in labels:
                    name += " 2"
                labels.add(name.casefold())
                new = {"id": new_id(), "label": name, "description": "", "kind": "single",
                       "position": pos, "items": [], "members": [], "slots": [pos],
                       "slot_count": 1, "order": len(cats) + len(singles)}
                await db.categories.insert_one(new)
                new.pop("_id", None)
                singles[pos] = new
            members.append(singles[pos]["id"])
        # Styles no single category has yet go to the group's last (outermost) part.
        known = {it["label"] for s in singles.values() for it in s.get("items") or []}
        extra = [it for it in c.get("items") or [] if it.get("label") not in known]
        if extra:
            last = singles[c["slots"][-1]]
            last["items"] = (last.get("items") or []) + extra
            await db.categories.update_one({"id": last["id"]}, {"$set": {"items": last["items"]}})
        await db.categories.update_one({"id": c["id"]}, {"$set": {
            "kind": "group", "position": "", "items": [], "members": members}})


async def _migrate_admin_identity():
    """Usernames are gone: admins sign in with mobile or email. Old accounts
    keep their username as their display name until a mobile is added."""
    try:
        if "username_1" in await db.admins.index_information():
            await db.admins.drop_index("username_1")
    except Exception as e:
        logger.warning("Could not drop the old username index: %s", e)
        return
    async for a in db.admins.find({"username": {"$exists": True}}, {"_id": 0, "id": 1, "username": 1, "name": 1}):
        await db.admins.update_one({"id": a["id"]}, {
            "$set": {"name": a.get("name") or a["username"]}, "$unset": {"username": ""}})


async def _seed_owner():
    """The Owner account from .env: super admin, active, password from .env."""
    su_pass = os.environ["SUPER_ADMIN_PASSWORD"]
    if not OWNER_MOBILE:
        logger.error("SUPER_ADMIN_MOBILE is not a valid Indian mobile number; owner not seeded")
        return
    owner = await db.admins.find_one({"mobile": OWNER_MOBILE})
    legacy = os.environ.get("SUPER_ADMIN_USERNAME", "").strip()
    if not owner and legacy:
        # The owner from before mobile sign-in: give that account the mobile.
        owner = await db.admins.find_one({"name": legacy, "mobile": {"$exists": False}})
    upd = {"mobile": OWNER_MOBILE, "role": "super", "active": True, "permissions": {}}
    if OWNER_EMAIL:
        upd["email"] = OWNER_EMAIL
        # The email belongs to the owner now, not to whoever had it before.
        await db.admins.update_many({"email": OWNER_EMAIL, "mobile": {"$ne": OWNER_MOBILE}},
                                    {"$unset": {"email": ""}})
    if not owner:
        await db.admins.insert_one({"id": new_id(), "name": "", "password_hash": hash_pw(su_pass),
                                    "created_at": iso(), "created_by": "system", **upd})
        return
    if not verify_pw(su_pass, owner["password_hash"]):
        upd["password_hash"] = hash_pw(su_pass)
    await db.admins.update_one({"id": owner["id"]}, {"$set": upd})


async def _seed_database():
    import secrets as _secrets
    await _migrate_admin_identity()
    await _seed_owner()
    # seed categories
    if await db.categories.count_documents({}) == 0:
        for c in DEFAULT_CATEGORIES:
            await db.categories.insert_one({"id": new_id(), **c})
    await _upgrade_item_descriptions()
    await permissions.migrate(db)
    await websites.ensure_seed(db)
    await display_media.migrate(db)
    await _migrate_category_kinds()
    # settings + display secret
    s = await db.settings.find_one({"id": "global"})
    if not s:
        await db.settings.insert_one({
            "id": "global", "display_secret": _secrets.token_urlsafe(16),
            "idle_image": "", "watermark_text": watermark.DEFAULT_TEXT,
            "brand": {}, "brand_logo": "", "brand_logo_v": ""})
    elif "watermark_text" not in s:
        await db.settings.update_one({"id": "global"}, {"$set": {"watermark_text": watermark.DEFAULT_TEXT}})
    elif "watermark_subtext" in s:
        # Older settings had a separate small line; it is now the second line.
        text = f"{s['watermark_text']}\n{s['watermark_subtext'] or ''}".strip()
        await db.settings.update_one({"id": "global"}, {"$set": {"watermark_text": text},
                                                        "$unset": {"watermark_subtext": ""}})
    # TTL on trials (7 days) via expires_at index
    try:
        await db.trials.create_index("created_at")
        await db.trials.create_index("expire_at", expireAfterSeconds=0)
        await db.trials.create_index([("session_id", 1), ("input_hash", 1)])
        await db.live_previews.create_index("updated_at")
        await db.live_previews.create_index("pid")
        await db.customers.create_index("mobile")
        await db.catalog.create_index("id", unique=True)
        await db.catalog.create_index("name_key", unique=True)
        await db.catalog.create_index("code_key")
        await db.login_attempts.create_index("key")
        await db.login_attempts.create_index(
            "last", expireAfterSeconds=LOGIN_LOCK_MINUTES * 60)
        await messaging.ensure_indexes()
        await db.admins.create_index("mobile", unique=True,
                                     partialFilterExpression={"mobile": {"$type": "string"}})
        await db.admins.create_index("email", unique=True,
                                     partialFilterExpression={"email": {"$type": "string"}})
    except Exception as e:
        logger.warning("Index creation failed: %s", e)
    await expire_stale_trials()


async def _seed_with_retry():
    """Retry DB seeding in the background so the server can bind to the port
    immediately even if MongoDB (Atlas) SSL handshake is slow/transient."""
    delay = 2
    for attempt in range(1, 16):
        try:
            await _seed_database()
            logger.info("Database seeding complete (attempt %d)", attempt)
            return
        except Exception as e:
            logger.warning("Seeding attempt %d failed: %s. Retrying in %ss",
                           attempt, e, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)
    logger.error("Database seeding failed after all retries")


@app.on_event("startup")
async def startup():
    # Kick off seeding in background so startup never blocks/crashes on a slow
    # DB connection. This lets FastAPI bind to the port and pass /health probe.
    asyncio.create_task(_seed_with_retry())
    logger.info("Startup complete (seeding running in background)")


@app.on_event("shutdown")
async def shutdown():
    client.close()
