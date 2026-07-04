from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import hashlib
import logging
import io
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

import gemini_service

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
    photo: str
    extra: Dict[str, Any] = {}


class EndSessionIn(BaseModel):
    purchased: bool
    total_value: Optional[float] = 0
    discount: Optional[float] = 0
    final_paid: Optional[float] = 0


class GenerateIn(BaseModel):
    type: str
    garments: List[Dict[str, Any]]  # [{slot, garment_type, fabric_b64}]


class CategoryIn(BaseModel):
    label: str
    description: str = ""
    items: List[Dict[str, Any]] = []
    order: int = 0


class FieldIn(BaseModel):
    label: str
    type: str = "text"
    required: bool = False
    order: int = 0


# ---------- Auth ----------
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.admins.find_one({"username": body.username})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
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
    if await db.admins.find_one({"username": body.username}):
        raise HTTPException(400, "Username already exists")
    doc = {"id": new_id(), "username": body.username, "password_hash": hash_pw(body.password),
           "role": "admin", "created_at": iso(), "created_by": user["username"]}
    await db.admins.insert_one(doc)
    await log_action(user, "create_admin", f"Created admin {body.username}")
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
    if not q or len(q) < 2:
        return []
    rx = {"$regex": q, "$options": "i"}
    res = await db.customers.find(
        {"$or": [{"mobile": rx}, {"mobile2": rx}, {"name": rx}]},
        {"_id": 0}
    ).limit(8).to_list(8)
    return res


@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
    res = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    stats = await bulk_customer_stats()
    for c in res:
        c["stats"] = stats.get(c["id"], dict(EMPTY_STATS))
    return res


@api.get("/customers/export")
async def export_customers(user=Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0, "photo": 0}).to_list(5000)
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
    customer = await db.customers.find_one({"mobile": body.mobile})
    if customer:
        await db.customers.update_one({"id": customer["id"]}, {"$set": {
            "name": body.customer_name, "mobile2": body.mobile2,
            "photo": body.photo, "extra": body.extra}})
        customer_id = customer["id"]
    else:
        customer_id = new_id()
        await db.customers.insert_one({
            "id": customer_id, "name": body.customer_name, "mobile": body.mobile,
            "mobile2": body.mobile2, "photo": body.photo, "extra": body.extra,
            "created_at": iso()})
    sid = new_id()
    doc = {
        "id": sid, "customer_id": customer_id, "customer_name": body.customer_name,
        "mobile": body.mobile, "mobile2": body.mobile2, "photo": body.photo,
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
    return res


@api.get("/sessions/today")
async def today_sessions(date: Optional[str] = None, user=Depends(get_current_user)):
    # date in YYYY-MM-DD (IST). default today IST
    ist = timezone(timedelta(hours=5, minutes=30))
    if date:
        day = datetime.fromisoformat(date).replace(tzinfo=ist)
    else:
        day = datetime.now(ist)
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    res = await db.sessions.find({
        "start_time": {"$gte": start.astimezone(timezone.utc).isoformat(),
                       "$lt": end.astimezone(timezone.utc).isoformat()}
    }, {"_id": 0, "photo": 0}).sort("start_time", -1).to_list(500)
    return res


@api.get("/sessions/history")
async def session_history(frm: Optional[str] = None, to: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if frm or to:
        rng = {}
        if frm:
            rng["$gte"] = frm
        if to:
            rng["$lte"] = to
        q["start_time"] = rng
    res = await db.sessions.find(q, {"_id": 0, "photo": 0}).sort("start_time", -1).to_list(5000)
    return res


@api.get("/sessions/{sid}")
async def get_session(sid: str, user=Depends(get_current_user)):
    s = await db.sessions.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    s["trials"] = await db.trials.find(
        {"session_id": sid}, {"_id": 0, "garments.fabric_b64": 0}
    ).sort("created_at", 1).to_list(1000)
    return s


@api.post("/sessions/{sid}/photo")
async def change_photo(sid: str, body: Dict[str, str], user=Depends(get_current_user)):
    s = await db.sessions.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Session not found")
    await db.sessions.update_one({"id": sid}, {"$set": {"photo": body["photo"]}})
    await db.customers.update_one({"id": s["customer_id"]}, {"$set": {"photo": body["photo"]}})
    await log_action(user, "change_photo", f"Session {sid}")
    return {"ok": True}


@api.post("/sessions/{sid}/end")
async def end_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    upd = {"status": "closed", "end_time": iso(), "purchased": body.purchased,
           "total_value": body.total_value or 0, "discount": body.discount or 0,
           "final_paid": body.final_paid or 0}
    r = await db.sessions.update_one({"id": sid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    await log_action(user, "end_session", f"Session {sid} purchased={body.purchased} paid={body.final_paid}")
    return {"ok": True}


@api.patch("/sessions/{sid}")
async def edit_session(sid: str, body: EndSessionIn, user=Depends(get_current_user)):
    upd = {"purchased": body.purchased, "total_value": body.total_value or 0,
           "discount": body.discount or 0, "final_paid": body.final_paid or 0}
    await db.sessions.update_one({"id": sid}, {"$set": upd})
    await log_action(user, "edit_session", f"Session {sid} edited")
    return {"ok": True}


@api.delete("/sessions/{sid}")
async def delete_session(sid: str, user=Depends(get_current_user)):
    await db.trials.delete_many({"session_id": sid})
    await db.sessions.delete_one({"id": sid})
    await db.live_previews.delete_many({"session_id": sid})
    await log_action(user, "delete_session", f"Session {sid}")
    return {"ok": True}


# ---------- Trials ----------
@api.post("/sessions/{sid}/trials/generate")
async def generate_trial(sid: str, body: GenerateIn, user=Depends(get_current_user)):
    s = await db.sessions.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Session not found")
    try:
        image = await gemini_service.generate_tryon(s["photo"], body.garments)
    except Exception as e:
        logger.error(f"Gemini error: {e}")
        raise HTTPException(502, f"Image generation failed: {str(e)[:200]}")
    desc_parts = [f"{g.get('slot', '')}: {g.get('garment_type', '')}" for g in body.garments]
    description = " + ".join([d for d in desc_parts if d.strip(": ")])
    tid = new_id()
    fabric_thumb = body.garments[0]["fabric_b64"] if body.garments else ""
    doc = {
        "id": tid, "session_id": sid, "type": body.type,
        "garments": [{"slot": g.get("slot"), "garment_type": g.get("garment_type"),
                      "fabric_b64": g.get("fabric_b64")} for g in body.garments],
        "fabric_thumb": fabric_thumb, "generated_image": image, "description": description,
        "created_at": iso(), "expire_at": now_utc() + timedelta(days=7)}
    await db.trials.insert_one(doc)
    await log_action(user, "generate_trial", f"Session {sid}: {description}")
    doc.pop("_id", None)
    return doc


@api.delete("/trials/{tid}")
async def delete_trial(tid: str, user=Depends(get_current_user)):
    await db.trials.delete_one({"id": tid})
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
    doc = {"id": new_id(), **body.model_dump()}
    await db.categories.insert_one(doc)
    await log_action(user, "add_category", body.label)
    doc.pop("_id", None)
    return doc


@api.put("/config/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    await db.categories.update_one({"id": cid}, {"$set": body.model_dump()})
    await log_action(user, "update_category", body.label)
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
    doc = {"id": new_id(), **body.model_dump()}
    await db.session_fields.insert_one(doc)
    await log_action(user, "add_field", body.label)
    doc.pop("_id", None)
    return doc


@api.delete("/config/fields/{fid}")
async def delete_field(fid: str, user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    await db.session_fields.delete_one({"id": fid})
    return {"ok": True}


# ---------- Settings (idle image, display secret) ----------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    return s or {}


@api.put("/settings")
async def update_settings(body: Dict[str, Any], user=Depends(get_current_user)):
    if user["role"] != "super":
        raise HTTPException(403, "Only super admin")
    body.pop("display_secret", None)
    await db.settings.update_one({"id": "global"}, {"$set": body})
    await log_action(user, "update_settings", "")
    return {"ok": True}


# ---------- Live Display ----------
@api.post("/display/preview")
async def set_preview(body: Dict[str, str], user=Depends(get_current_user)):
    trial = await db.trials.find_one({"id": body["trial_id"]}, {"_id": 0})
    if not trial:
        raise HTTPException(404, "Trial not found")
    session = await db.sessions.find_one({"id": trial["session_id"]}, {"_id": 0, "photo": 0})
    await db.live_previews.update_one(
        {"admin_id": user["id"]},
        {"$set": {
            "admin_id": user["id"], "admin_username": user["username"],
            "trial_id": trial["id"], "session_id": trial["session_id"],
            "description": trial["description"],
            "customer_name": session["customer_name"] if session else "",
            "start_time": session["start_time"] if session else "",
            "updated_at": iso()}},
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
    ).sort("updated_at", 1).to_list(8)
    # version reflects which trials are live + idle image; changes only when the
    # visible content changes. Lets clients skip re-downloading base64 images.
    raw_v = "|".join(str(p.get("trial_id")) for p in previews)
    raw_v += "#" + (s.get("idle_image") or "")[:32]
    version = hashlib.md5(raw_v.encode()).hexdigest()
    if v and v == version:
        return {"unchanged": True, "version": version}
    for p in previews:
        trial = await db.trials.find_one(
            {"id": p.get("trial_id")}, {"_id": 0, "generated_image": 1})
        p["image"] = trial["generated_image"] if trial else ""
    previews = [p for p in previews if p.get("image")]
    return {"previews": previews, "idle_image": s.get("idle_image", ""), "version": version}


# ---------- Stats ----------
@api.get("/stats")
async def stats(frm: Optional[str] = None, to: Optional[str] = None, user=Depends(get_current_user)):
    q = {"status": "closed"}
    if frm or to:
        rng = {}
        if frm:
            rng["$gte"] = frm
        if to:
            rng["$lte"] = to
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
    return await db.logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


@api.get("/")
async def root():
    return {"message": "Somani Fabs API"}


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])


DEFAULT_CATEGORIES = [
    {"label": "Top Wear", "description": "Upper garments like shirts and kurtas", "order": 1,
     "slot_count": 1, "slots": ["top"],
     "items": [
         {"label": "Full Sleeve Shirt", "description": "A formal full sleeve shirt"},
         {"label": "Half Sleeve Shirt", "description": "A casual half sleeve shirt"},
         {"label": "Kurta", "description": "A traditional Indian kurta"},
     ]},
    {"label": "Bottom Wear", "description": "Lower garments like trousers and pyjama", "order": 2,
     "slot_count": 1, "slots": ["bottom"],
     "items": [
         {"label": "Trousers", "description": "Formal trousers / pants"},
         {"label": "Pyjama", "description": "Traditional pyjama"},
         {"label": "Kurta Pyjama Bottom", "description": "Pyjama paired with kurta"},
     ]},
    {"label": "Top + Bottom", "description": "A full outfit with top and bottom", "order": 3,
     "slot_count": 2, "slots": ["top", "bottom"],
     "items": [
         {"label": "Full Sleeve Shirt", "description": "A formal full sleeve shirt"},
         {"label": "Half Sleeve Shirt", "description": "A casual half sleeve shirt"},
         {"label": "Kurta", "description": "A traditional Indian kurta"},
         {"label": "Trousers", "description": "Formal trousers / pants"},
         {"label": "Pyjama", "description": "Traditional pyjama"},
     ]},
    {"label": "Top + Bottom + 3rd", "description": "Top, bottom and a third layer like suit or koti", "order": 4,
     "slot_count": 3, "slots": ["top", "bottom", "third"],
     "items": [
         {"label": "Full Sleeve Shirt", "description": "A formal full sleeve shirt"},
         {"label": "Kurta", "description": "A traditional Indian kurta"},
         {"label": "Trousers", "description": "Formal trousers / pants"},
         {"label": "Pyjama", "description": "Traditional pyjama"},
         {"label": "Suit Jacket", "description": "A tailored suit blazer"},
         {"label": "Koti / Nehru Jacket", "description": "Traditional Indian waistcoat (koti)"},
     ]},
]


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
    # settings + display secret
    s = await db.settings.find_one({"id": "global"})
    if not s:
        await db.settings.insert_one({
            "id": "global", "display_secret": _secrets.token_urlsafe(16),
            "idle_image": ""})
    # TTL on trials (7 days) via expires_at index
    try:
        await db.trials.create_index("created_at")
        await db.trials.create_index("expire_at", expireAfterSeconds=0)
        await db.live_previews.create_index("updated_at")
        await db.customers.create_index("mobile")
    except Exception:
        pass


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
