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
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from PIL import Image, ImageOps

import image_service
import watermark

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
    payload = {"sub": user["id"], "username": user["username"], "role": user["role"],
               "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


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
    return user


async def log_action(user, action, details=""):
    await db.logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "admin_username": user["username"],
        "action": action, "details": details, "timestamp": iso(),
    })


# ---------- Models ----------
class LoginIn(BaseModel):
    username: str
    password: str


class AdminIn(BaseModel):
    username: str
    password: str


class SessionIn(BaseModel):
    customer_name: str
    mobile: str
    mobile2: Optional[str] = ""
    photo: Optional[str] = ""
    extra: Dict[str, Any] = {}


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
    type: str
    garments: List[Dict[str, Any]]  # [{slot, garment_type, fabric_b64}]


SLOTS = ("top", "bottom", "third")
MAX_GARMENTS = len(SLOTS)


class CategoryIn(BaseModel):
    label: str
    description: str = ""
    slots: List[str] = ["top"]
    items: List[Dict[str, Any]] = []
    order: int = 0


def _clean_category(body: CategoryIn) -> Dict[str, Any]:
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "Category name is required")
    slots = [s.strip().lower() for s in body.slots if s.strip()]
    if not slots or any(s not in SLOTS for s in slots) or len(set(slots)) != len(slots):
        raise HTTPException(400, "Slots must be one or more of: top, bottom, third (no repeats)")
    items = []
    for it in body.items:
        il = str(it.get("label", "")).strip()
        if il:
            items.append({"label": il, "description": str(it.get("description", "")).strip()})
    return {"label": label, "description": body.description.strip(), "slots": slots,
            "slot_count": len(slots), "items": items, "order": body.order}


class FieldIn(BaseModel):
    label: str
    type: str = "text"
    required: bool = False
    order: int = 0


# ---------- Auth ----------
# Lock a username from one IP address after repeated wrong passwords. Keyed by
# IP + username so a stranger cannot lock the owner out from their own phone.
LOGIN_MAX_FAILS = 5
LOGIN_LOCK_MINUTES = 15


def _client_ip(request: Request) -> str:
    # nginx sets X-Real-IP; the backend port itself is bound to localhost only.
    return request.headers.get("X-Real-IP") or (request.client.host if request.client else "")


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    username = body.username.strip()
    key = f"{_client_ip(request)}|{username.lower()}"
    since = now_utc() - timedelta(minutes=LOGIN_LOCK_MINUTES)
    attempts = await db.login_attempts.find_one({"key": key, "last": {"$gte": since}})
    if attempts and attempts.get("count", 0) >= LOGIN_MAX_FAILS:
        raise HTTPException(429, f"Too many wrong attempts. Try again in {LOGIN_LOCK_MINUTES} minutes.")
    user = await db.admins.find_one({"username": username})
    if not user or not verify_pw(body.password, user["password_hash"]):
        if attempts:
            await db.login_attempts.update_one(
                {"key": key}, {"$inc": {"count": 1}, "$set": {"last": now_utc()}})
        else:
            await db.login_attempts.update_one(
                {"key": key}, {"$set": {"count": 1, "last": now_utc()}}, upsert=True)
        raise HTTPException(401, "Invalid username or password")
    await db.login_attempts.delete_one({"key": key})
    u = {"id": user["id"], "username": user["username"], "role": user["role"]}
    await log_action(u, "login", "Logged in")
    return {"token": make_token(u), "user": u}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ---------- Admin management ----------
@api.get("/admins")
async def list_admins(user=Depends(get_current_user)):
    admins = await db.admins.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return admins


@api.post("/admins")
async def create_admin(body: AdminIn, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin can create admins")
    username = body.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        raise HTTPException(400, "Username must be 3-32 letters, numbers, dot, dash or underscore")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if await db.admins.find_one({"username": username}):
        raise HTTPException(400, "Username already exists")
    doc = {"id": new_id(), "username": username, "password_hash": hash_pw(body.password),
           "role": "admin", "created_at": iso(), "created_by": user["username"]}
    await db.admins.insert_one(doc)
    await log_action(user, "create_admin", f"Created admin {username}")
    return {"id": doc["id"], "username": doc["username"], "role": "admin"}


@api.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin can delete admins")
    target = await db.admins.find_one({"id": admin_id})
    if target and target["role"] == "super":
        raise HTTPException(400, "Cannot delete super admin")
    await db.admins.delete_one({"id": admin_id})
    await log_action(user, "delete_admin", f"Deleted admin {target['username'] if target else admin_id}")
    return {"ok": True}


# ---------- Customers ----------
async def customer_stats(customer_id):
    sessions = await db.sessions.find({"customer_id": customer_id}, {"_id": 0}).to_list(1000)
    purchased = [s for s in sessions if s.get("purchased")]
    total_collected = sum(float(s.get("final_paid") or 0) for s in purchased)
    return {
        "total_sessions": len(sessions),
        "purchased_count": len(purchased),
        "not_purchased_count": len([s for s in sessions if s.get("status") == "closed" and not s.get("purchased")]),
        "total_collected": total_collected,
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
        }},
    ]
    stats = {}
    async for row in db.sessions.aggregate(pipeline):
        stats[row["_id"]] = {
            "total_sessions": row["total_sessions"],
            "purchased_count": row["purchased_count"],
            "not_purchased_count": row["not_purchased_count"],
            "total_collected": row["total_collected"],
        }
    return stats


EMPTY_STATS = {"total_sessions": 0, "purchased_count": 0,
               "not_purchased_count": 0, "total_collected": 0}


@api.get("/customers/search")
async def search_customers(q: str, user=Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 2:
        return []
    # Escape so characters like "(" or "+" are searched literally, not as regex.
    rx = {"$regex": re.escape(q[:50]), "$options": "i"}
    res = await db.customers.find(
        {"$or": [{"mobile": rx}, {"mobile2": rx}, {"name": rx}]},
        {"_id": 0}
    ).limit(8).to_list(8)
    return res


@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
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
    customers = await db.customers.find({}, {"_id": 0, "photo": 0, "thumb": 0}).to_list(5000)
    stats = await bulk_customer_stats()
    rows = []
    for c in customers:
        st = stats.get(c["id"], dict(EMPTY_STATS))
        row = {
            "Name": c.get("name"), "Primary Mobile": c.get("mobile"),
            "Secondary Mobile": c.get("mobile2", ""), "Created At": c.get("created_at"),
            "Total Sessions": st["total_sessions"], "Purchased": st["purchased_count"],
            "Not Purchased": st["not_purchased_count"], "Total Collected": st["total_collected"],
        }
        for k, v in (c.get("extra") or {}).items():
            row[k] = v
        rows.append(row)
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    await log_action(user, "export_customers", f"Exported {len(rows)} customers")
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=somani_customers.xlsx"})


@api.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    c["stats"] = await customer_stats(customer_id)
    c["sessions"] = await db.sessions.find(
        {"customer_id": customer_id}, {"_id": 0, "photo": 0}
    ).sort("start_time", -1).to_list(1000)
    return c


# ---------- Sessions ----------
@api.post("/sessions")
async def create_session(body: SessionIn, user=Depends(get_current_user)):
    body.customer_name = body.customer_name.strip()
    body.mobile = body.mobile.strip()
    body.mobile2 = (body.mobile2 or "").strip()
    if not body.customer_name or not body.mobile:
        raise HTTPException(400, "Name and mobile are required")
    # The photo is optional. Without one the session is a "customer entry"
    # (visit + purchase log only, no try-on) until a photo is added later.
    photo = body.photo or ""
    if photo and not is_image_data(photo):
        raise HTTPException(400, "The photo is not a valid image")
    thumb = make_thumb(photo) if photo else ""
    cust_fields = {"name": body.customer_name, "mobile2": body.mobile2, "extra": body.extra}
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
        "admin_id": user["id"], "admin_username": user["username"]}
    await db.sessions.insert_one(doc)
    await log_action(user, "create_session", f"{body.customer_name} ({body.mobile})")
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
    return s


@api.post("/sessions/{sid}/photo")
async def change_photo(sid: str, body: Dict[str, str], user=Depends(get_current_user)):
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
    return {"ok": True}


@api.post("/sessions/{sid}/end")
async def end_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    upd = {"status": "closed", "end_time": iso(), **_session_amounts(body)}
    r = await db.sessions.update_one({"id": sid, "status": "active"}, {"$set": upd})
    if r.matched_count == 0:
        if await db.sessions.find_one({"id": sid}):
            raise HTTPException(400, "Session is already closed")
        raise HTTPException(404, "Session not found")
    await log_action(user, "end_session", f"Session {sid} purchased={upd['purchased']} paid={upd['final_paid']}")
    return {"ok": True}


@api.patch("/sessions/{sid}")
async def edit_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    upd = _session_amounts(body)
    r = await db.sessions.update_one({"id": sid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    await log_action(user, "edit_session", f"Session {sid} purchased={upd['purchased']} paid={upd['final_paid']}")
    return {"ok": True}


@api.delete("/sessions/{sid}")
async def delete_session(sid: str, user=Depends(get_current_user)):
    await db.trials.delete_many({"session_id": sid})
    await db.sessions.delete_one({"id": sid})
    await db.live_previews.delete_many({"session_id": sid})
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
    cat = await db.categories.find_one({"label": body.type}, {"_id": 0})
    item_desc = {it.get("label"): it.get("description", "") for it in (cat or {}).get("items", [])}
    out, seen = [], set()
    for g in body.garments:
        slot = str(g.get("slot", "")).strip().lower()
        gtype = str(g.get("garment_type", "")).strip()
        fabric = g.get("fabric_b64")
        if slot not in SLOTS or slot in seen:
            raise HTTPException(400, "Each garment needs a different slot: top, bottom or third")
        if not gtype:
            raise HTTPException(400, "Choose a garment type for every fabric")
        if not is_image_data(fabric):
            raise HTTPException(400, "Every garment needs a fabric photo")
        seen.add(slot)
        desc = item_desc.get(gtype) or DEFAULT_ITEM_DESCRIPTIONS.get(gtype, "")
        out.append({"slot": slot, "garment_type": gtype, "description": desc, "fabric_b64": fabric})
    return out


@api.post("/sessions/{sid}/trials/generate")
async def generate_trial(sid: str, body: GenerateIn, user=Depends(get_current_user)):
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
    doc = {
        "id": tid, "session_id": sid, "type": body.type,
        "garments": [{k: g[k] for k in ("slot", "garment_type", "fabric_b64")} for g in garments],
        "fabric_thumb": garments[0]["fabric_b64"], "generated_image": "",
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


@api.delete("/trials/{tid}")
async def delete_trial(tid: str, user=Depends(get_current_user)):
    tr = await db.trials.find_one({"id": tid}, {"_id": 0, "session_id": 1, "description": 1})
    if not tr:
        raise HTTPException(404, "Trial not found")
    await db.trials.delete_one({"id": tid})
    await log_action(user, "delete_trial", f"Session {tr['session_id']}: {tr.get('description', '')}")
    return {"ok": True}


# ---------- Config: trial categories & session fields ----------
@api.get("/config/categories")
async def get_categories(user=Depends(get_current_user)):
    cats = await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return cats


@api.post("/config/categories")
async def add_category(body: CategoryIn, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    doc = {"id": new_id(), **_clean_category(body)}
    await db.categories.insert_one(doc)
    await log_action(user, "add_category", doc["label"])
    doc.pop("_id", None)
    return doc


@api.put("/config/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    clean = _clean_category(body)
    r = await db.categories.update_one({"id": cid}, {"$set": clean})
    if r.matched_count == 0:
        raise HTTPException(404, "Category not found")
    await log_action(user, "update_category", clean["label"])
    return {"ok": True}


@api.delete("/config/categories/{cid}")
async def delete_category(cid: str, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    await db.categories.delete_one({"id": cid})
    await log_action(user, "delete_category", cid)
    return {"ok": True}


@api.get("/config/fields")
async def get_fields(user=Depends(get_current_user)):
    return await db.session_fields.find({}, {"_id": 0}).sort("order", 1).to_list(100)


@api.post("/config/fields")
async def add_field(body: FieldIn, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
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


@api.delete("/config/fields/{fid}")
async def delete_field(fid: str, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    f = await db.session_fields.find_one({"id": fid}, {"_id": 0, "label": 1})
    await db.session_fields.delete_one({"id": fid})
    await log_action(user, "delete_field", f["label"] if f else fid)
    return {"ok": True}


# ---------- Settings (idle image, display secret) ----------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s or {}


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
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    fields = _watermark_settings(body)
    cfg = watermark.normalize({k: fields.get(v) for k, v in _WM_KEYS.items()})
    latest = await db.trials.find_one(
        {"status": "done"}, {"_id": 0, "clean_image": 1, "generated_image": 1}, sort=[("created_at", -1)])
    src = (latest or {}).get("clean_image") or ""
    base = await asyncio.to_thread(watermark.preview_base, src)
    return {"image": await asyncio.to_thread(watermark.apply, base, cfg)}


@api.put("/settings")
async def update_settings(body: Dict[str, Any], user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
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
    if not upd:
        raise HTTPException(400, "Nothing to update")
    await db.settings.update_one({"id": "global"}, {"$set": upd})
    await log_action(user, "update_settings", ", ".join(
        f"{k}={upd[k]!r}" if k.startswith("watermark") else k for k in upd))
    return {"ok": True}


# ---------- Live Display ----------
# Each admin shows one thing on the shop screen at a time: a single try-on
# (`trial_id`) or every finished try-on of a session ("show all", `session_id`).
# The screen splits equally between admins, ordered by `started_at` (first in,
# first out); heartbeats only touch `updated_at`, so tiles never swap places.
@api.post("/display/preview")
async def set_preview(body: Dict[str, str], user=Depends(get_current_user)):
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
    await db.live_previews.update_one(
        {"admin_id": user["id"]},
        {"$set": {
            "admin_id": user["id"], "admin_username": user["username"], "session_id": sid,
            "customer_name": session.get("customer_name", ""),
            "start_time": session.get("start_time", ""), "updated_at": iso(), **fields},
         "$setOnInsert": {"started_at": iso()}},
        upsert=True)
    return {"ok": True}


@api.post("/display/heartbeat")
async def heartbeat(user=Depends(get_current_user)):
    await db.live_previews.update_one({"admin_id": user["id"]}, {"$set": {"updated_at": iso()}})
    return {"ok": True}


@api.delete("/display/preview")
async def clear_preview(user=Depends(get_current_user)):
    await db.live_previews.delete_one({"admin_id": user["id"]})
    return {"ok": True}


@api.get("/display/{secret}/state")
async def display_state(secret: str, v: Optional[str] = None):
    s = await db.settings.find_one(
        {"id": "global"}, {"_id": 0, "display_secret": 1, "idle_image": 1})
    if not s or s.get("display_secret") != secret:
        raise HTTPException(404, "Not found")
    cutoff = (now_utc() - timedelta(seconds=12)).isoformat()
    previews = await db.live_previews.find(
        {"updated_at": {"$gte": cutoff}}, {"_id": 0}
    ).to_list(8)
    # First in, first out: a tile keeps its place until that admin closes it.
    previews.sort(key=lambda p: (p.get("started_at") or p.get("updated_at") or "", p["admin_id"]))

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
    # try-ons, idle image or watermark), so clients skip re-downloading images.
    idle_img = s.get("idle_image") or ""
    wm_sig = (await current_watermark())[1]
    raw_v = "|".join(f"{p['admin_id']}:{','.join(p['trial_ids'])}" for p in previews)
    raw_v += "#" + hashlib.md5(idle_img.encode()).hexdigest() + "#" + wm_sig
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
            out.append({"admin_id": p["admin_id"], "mode": p.get("mode", "trial"),
                        "customer_name": p.get("customer_name", ""),
                        "description": p.get("description", ""),
                        "start_time": p.get("start_time", ""), "images": images})
    return {"previews": out, "idle_image": idle_img, "version": version}


# ---------- Stats ----------
@api.get("/stats")
async def stats(frm: Optional[str] = None, to: Optional[str] = None, user=Depends(get_current_user)):
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
    limit = max(1, min(limit, 1000))
    return await db.logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.get("/")
async def root():
    return {"message": "Somani Fabs API"}


@app.get("/health")
async def health():
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=2.0)
    except Exception as e:
        logger.error(f"Health check DB ping failed: {e}")
        raise HTTPException(503, "Database unavailable")
    return {"status": "ok"}


app.include_router(api)
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
    async for cat in db.categories.find({}, {"_id": 0, "id": 1, "items": 1, "slots": 1}):
        items, upd = cat.get("items") or [], {}
        for it in items:
            default = DEFAULT_ITEM_DESCRIPTIONS.get(it.get("label"))
            if default and (it.get("description") or "").strip() in _OLD_SEED_DESCRIPTIONS:
                it["description"] = default
                upd["items"] = items
        # Categories added before slots were saved correctly have none, which
        # makes New Trial unusable for them. Default them to a single top slot.
        if not cat.get("slots"):
            upd.update(slots=["top"], slot_count=1)
        if upd:
            await db.categories.update_one({"id": cat["id"]}, {"$set": upd})


async def _seed_database():
    import secrets as _secrets
    # seed super admin
    su_user = os.environ["SUPER_ADMIN_USERNAME"]
    su_pass = os.environ["SUPER_ADMIN_PASSWORD"]
    existing = await db.admins.find_one({"username": su_user})
    if not existing:
        await db.admins.insert_one({
            "id": new_id(), "username": su_user, "password_hash": hash_pw(su_pass),
            "role": "super", "created_at": iso(), "created_by": "system"})
    elif not verify_pw(su_pass, existing["password_hash"]):
        await db.admins.update_one({"username": su_user},
                                   {"$set": {"password_hash": hash_pw(su_pass)}})
    # seed categories
    if await db.categories.count_documents({}) == 0:
        for c in DEFAULT_CATEGORIES:
            await db.categories.insert_one({"id": new_id(), **c})
    await _upgrade_item_descriptions()
    # settings + display secret
    s = await db.settings.find_one({"id": "global"})
    if not s:
        await db.settings.insert_one({
            "id": "global", "display_secret": _secrets.token_urlsafe(16),
            "idle_image": "", "watermark_text": watermark.DEFAULT_TEXT})
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
        await db.customers.create_index("mobile")
        await db.login_attempts.create_index("key")
        await db.login_attempts.create_index(
            "last", expireAfterSeconds=LOGIN_LOCK_MINUTES * 60)
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
