"""WhatsApp features of the app ("Countr OS" bot).

How it works in a session:
1. Staff create a session with the customer's photo and tick consent. The
   `session_welcome` utility template goes out at once, with a "Send my looks"
   button.
2. When the customer taps it (or messages us in any way), the 24-hour customer
   service window opens. Inside it plain messages and images are free.
3. Staff tap "Send to WhatsApp" on a try-on. Inside the window it is sent at
   once. Otherwise it is queued and sent automatically, in order, as soon as
   the customer messages us. We never pay for a template per image.
4. On a purchase the `purchase_receipt` template is sent once.

Everything here is a no-op while WhatsApp is not enabled (whatsapp_service.enabled()).
Only whatsapp_service talks to Meta. Every new collection carries `shop_id`.
"""
import asyncio
import base64
import io
import json
import logging
import re
import uuid
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

import permissions
import whatsapp_service as wa
import whatsapp_templates as tpl

logger = logging.getLogger("somani.messaging")

SHOP_ID = "default"
WINDOW = timedelta(hours=24)
IST = timezone(timedelta(hours=5, minutes=30))

# Set by server.py at import time (avoids a circular import).
db = None
_auth: Optional[Callable] = None


def init(database, auth_dependency):
    global db, _auth
    db, _auth = database, auth_dependency


async def current_user(request: Request):
    return await _auth(request)


def require_super(user):
    """WhatsApp / marketing setup (name kept from before permissions existed)."""
    permissions.require(user, "marketing_manage")


router = APIRouter(prefix="/api/whatsapp")
public_router = APIRouter()


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime] = None):
    return (dt or now_utc()).isoformat()


def parse_iso(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def new_id():
    return str(uuid.uuid4())


# Keep references to background sends (asyncio only holds weak references).
_tasks = set()


def spawn(coro):
    async def guarded():
        try:
            await coro
        except Exception:
            logger.exception("WhatsApp background task failed")
    task = asyncio.create_task(guarded())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


# ---------- Shop settings ----------
DEFAULT_PROFILE = {"name": "", "short_name": "", "address": "", "city": "", "phone": "",
                   "maps_url": "", "review_url": "", "slug": ""}
DEFAULT_WA = {
    "language": "hinglish",
    "consent_default": False,
    "welcome": {"on": True},
    "send_looks": {"on": True, "allow_staff": True},
    "receipt": {"on": True},
}


def _merge(defaults: Dict, stored: Dict) -> Dict:
    out = {}
    for k, v in defaults.items():
        s = (stored or {}).get(k)
        out[k] = _merge(v, s) if isinstance(v, dict) else (v if s is None else s)
    return out


async def shop_settings() -> Dict[str, Any]:
    doc = await db.shop_settings.find_one({"shop_id": SHOP_ID}, {"_id": 0}) or {}
    return {"shop_profile": _merge(DEFAULT_PROFILE, doc.get("shop_profile")),
            "whatsapp": _merge(DEFAULT_WA, doc.get("whatsapp")),
            "wa_last_webhook_at": doc.get("wa_last_webhook_at"),
            "wa_number": doc.get("wa_number", "")}


def shop_vars(profile: Dict) -> Dict[str, str]:
    return {"shop_name": profile.get("name") or profile.get("short_name") or "our shop",
            "shop_address": profile.get("address") or profile.get("city") or "-",
            "shop_phone": profile.get("phone") or "-"}


# ---------- Phones, contacts, window ----------
def to_e164(mobile: str, default_cc: str = "91") -> str:
    """'98765 43210' -> '+919876543210'. Empty string if it can't be a phone."""
    raw = (mobile or "").strip()
    d = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        return "+" + d if 8 <= len(d) <= 15 else ""
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) == 10:
        d = default_cc + d
    return "+" + d if 11 <= len(d) <= 15 else ""


async def get_contact(phone: str) -> Optional[Dict]:
    if not phone:
        return None
    return await db.wa_contacts.find_one({"shop_id": SHOP_ID, "phone": phone}, {"_id": 0})


def window_open(contact: Optional[Dict], now: Optional[datetime] = None) -> bool:
    last = parse_iso((contact or {}).get("last_inbound_at"))
    return bool(last) and (now or now_utc()) - last < WINDOW


def consented(contact: Optional[Dict]) -> bool:
    return bool(contact and contact.get("opted_in") and not contact.get("opted_out_at"))


async def record_consent(phone: str, customer_id: str, consent: bool, by: str):
    if not phone:
        return
    now = iso()
    fields = {"customer_id": customer_id, "updated_at": now}
    if consent:
        fields.update(opted_in=True, opted_in_at=now, opted_in_by=by)
    else:
        fields.update(opted_in=False, consent_removed_at=now, consent_removed_by=by)
    await db.wa_contacts.update_one(
        {"shop_id": SHOP_ID, "phone": phone},
        {"$set": fields, "$setOnInsert": {"id": new_id(), "created_at": now,
                                          "last_inbound_at": None, "opted_out_at": None}},
        upsert=True)


async def consent_map(mobiles: List[str]) -> Dict[str, Dict]:
    """mobile -> {opted_in, opted_out} for prefilling the consent box."""
    phones = {m: to_e164(m) for m in mobiles if m}
    out = {}
    async for c in db.wa_contacts.find({"shop_id": SHOP_ID, "phone": {"$in": list(phones.values())}},
                                       {"_id": 0, "phone": 1, "opted_in": 1, "opted_out_at": 1}):
        for m, p in phones.items():
            if p == c["phone"]:
                out[m] = {"opted_in": bool(c.get("opted_in")), "opted_out": bool(c.get("opted_out_at"))}
    return out


# ---------- Sending + message log ----------
async def _send(row: Dict, action: Callable) -> Dict:
    """Log an outbound message, send it, record the result.

    A row with an `idempotency_key` that already exists is skipped: that is how
    automated messages are sent at most once even with two backend workers.
    """
    now = iso()
    row = {"id": new_id(), "shop_id": SHOP_ID, "direction": "out", "status": "sending",
           "error": "", "created_at": now, "updated_at": now, **row}
    if not row.get("idempotency_key"):
        row.pop("idempotency_key", None)
    try:
        await db.wa_messages.insert_one(row)
    except DuplicateKeyError:
        return {"ok": False, "skipped": True, "error": "Already sent"}
    try:
        mid = await action()
    except Exception as e:
        err = wa.friendly_error(e)
        logger.warning("WhatsApp send (%s) to %s failed: %s", row.get("purpose"), row.get("phone"), e)
        await db.wa_messages.update_one({"id": row["id"]}, {"$set": {
            "status": "failed", "error": err, "error_code": getattr(e, "code", None), "updated_at": iso()}})
        return {"ok": False, "error": err, "id": row["id"]}
    await db.wa_messages.update_one({"id": row["id"]}, {"$set": {
        "status": "sent", "wa_message_id": mid, "updated_at": iso()}})
    return {"ok": True, "id": row["id"], "wa_message_id": mid}


async def send_template_message(phone: str, name: str, values: Dict, purpose: str, *,
                                key: str = "", session_id: str = "", customer_id: str = "",
                                media_id: Optional[str] = None, payload: str = "") -> Dict:
    s = await shop_settings()
    lang = s["whatsapp"]["language"]
    values = {**shop_vars(s["shop_profile"]), **values}
    shown = tpl.render(name, lang, values)
    comps = tpl.send_components(name, lang, values, slug=s["shop_profile"]["slug"],
                                media_id=media_id, payload=payload)
    return await _send(
        {"kind": "template", "purpose": purpose, "template": shown["meta_name"],
         "category": shown["category"], "body": shown["body"], "phone": phone,
         "session_id": session_id, "customer_id": customer_id, "idempotency_key": key},
        lambda: wa.send_template(phone, shown["meta_name"], shown["language"], comps))


async def send_free_text(phone: str, key: str, purpose: str, values: Dict = None, *,
                         session_id: str = "", customer_id: str = "", idempotency_key: str = "") -> Dict:
    s = await shop_settings()
    text = tpl.free_text(key, s["whatsapp"]["language"],
                         {**shop_vars(s["shop_profile"]), **(values or {})})
    return await _send(
        {"kind": "text", "purpose": purpose, "category": "SERVICE", "body": text, "phone": phone,
         "session_id": session_id, "customer_id": customer_id, "idempotency_key": idempotency_key},
        lambda: wa.send_text(phone, text))


# ---------- Welcome ----------
async def send_welcome(sid: str, manual: bool = False) -> Dict:
    """Welcome template for a try-on session (sent once, unless resent by hand)."""
    if not wa.enabled():
        return {"ok": False, "error": "WhatsApp is not connected"}
    s = await db.sessions.find_one({"id": sid}, {"_id": 0, "photo": 0})
    if not s or not s.get("has_photo"):
        # Customer-entry sessions (no photo) get no welcome.
        return {"ok": False, "error": "Add the customer's photo first"}
    settings = await shop_settings()
    if not manual and not settings["whatsapp"]["welcome"]["on"]:
        return {"ok": False, "error": "Welcome message is switched off"}
    phone = s.get("wa_phone")
    contact = await get_contact(phone)
    if not consented(contact):
        return {"ok": False, "error": "Customer has not agreed to WhatsApp messages"}
    key = "" if manual else f"welcome:{sid}"
    if window_open(contact):
        # Customer already chatting with us: a free message does the job.
        return await send_free_text(phone, "welcome_open", "welcome",
                                    {"customer_name": s["customer_name"]}, session_id=sid,
                                    customer_id=s["customer_id"], idempotency_key=key)
    return await send_template_message(
        phone, "session_welcome", {"customer_name": s["customer_name"]}, "welcome",
        key=key, session_id=sid, customer_id=s["customer_id"], payload=f"LOOKS:{sid}")


def on_session_created(session: Dict):
    if wa.enabled() and session.get("has_photo") and session.get("wa_phone"):
        spawn(send_welcome(session["id"]))


def on_photo_added(sid: str):
    # An entry session that just became a try-on session gets its welcome now.
    # The idempotency key stops a second welcome when the photo is changed again.
    if wa.enabled():
        spawn(send_welcome(sid))


# ---------- Receipt ----------
def inr(value) -> str:
    """Indian digit grouping: 125000.5 -> '1,25,000.50'."""
    v = round(float(value or 0), 2)
    whole = int(v)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = ",".join(re.findall(r"\d{1,2}", head[::-1]))[::-1]
        s = f"{head},{tail}"
    if round(v - whole, 2):
        s += f"{v - whole:.2f}"[1:]
    return s


def ist_date(value) -> str:
    dt = parse_iso(value) or now_utc()
    return dt.astimezone(IST).strftime("%d %b %Y")


async def send_receipt(sid: str, manual: bool = False) -> Dict:
    if not wa.enabled():
        return {"ok": False, "error": "WhatsApp is not connected"}
    s = await db.sessions.find_one({"id": sid}, {"_id": 0, "photo": 0, "thumb": 0})
    if not s or s.get("status") != "closed" or not s.get("purchased"):
        return {"ok": False, "error": "Only purchased sessions get a receipt"}
    settings = await shop_settings()
    if not manual and not settings["whatsapp"]["receipt"]["on"]:
        return {"ok": False, "error": "Purchase receipt is switched off"}
    phone = s.get("wa_phone") or to_e164(s.get("mobile"))
    if not consented(await get_contact(phone)):
        return {"ok": False, "error": "Customer has not agreed to WhatsApp messages"}
    values = {"customer_name": s["customer_name"], "date": ist_date(s.get("end_time")),
              "total": inr(s.get("total_value")), "discount": inr(s.get("discount")),
              "paid": inr(s.get("final_paid"))}
    return await send_template_message(
        phone, "purchase_receipt", values, "receipt", key="" if manual else f"receipt:{sid}",
        session_id=sid, customer_id=s["customer_id"])


def on_session_ended(sid: str, purchased: bool):
    if wa.enabled() and purchased:
        spawn(send_receipt(sid))


async def on_session_deleted(sid: str):
    await db.wa_scheduled.update_many({"session_id": sid, "status": "pending"},
                                      {"$set": {"status": "cancelled", "updated_at": iso()}})


# ---------- Try-on looks ----------
SENT_STATES = ("sending", "sent", "delivered", "read")
_TRIAL_FIELDS = {"_id": 0, "garments.fabric_b64": 0, "clean_image": 0, "fabric_thumb": 0}


async def _assign_look_no(trial: Dict) -> int:
    """Sequential look number per session, given the first time a look is sent."""
    if trial.get("look_no"):
        return trial["look_no"]
    s = await db.sessions.find_one_and_update(
        {"id": trial["session_id"]}, {"$inc": {"wa_look_seq": 1}},
        projection={"wa_look_seq": 1}, return_document=ReturnDocument.AFTER)
    await db.trials.update_one({"id": trial["id"], "look_no": None}, {"$set": {"look_no": s["wa_look_seq"]}})
    t = await db.trials.find_one({"id": trial["id"]}, {"_id": 0, "look_no": 1})
    return t["look_no"]


def _caption(trial: Dict, lang: str, profile: Dict) -> str:
    garments = [g.get("garment_type") for g in trial.get("garments") or [] if g.get("garment_type")]
    title = " + ".join(garments) or trial.get("type") or "Try-on"
    return tpl.free_text("look_caption", lang, {
        **shop_vars(profile), "look_no": trial.get("look_no") or "",
        "title": title, "details": trial.get("type") or ""})


def _image_bytes(data_uri: str) -> bytes:
    return base64.b64decode(data_uri.split(",", 1)[1] if data_uri.startswith("data:") else data_uri)


async def _deliver_look(tid: str, phone: str) -> str:
    """Upload and send one look (window must be open). Returns the new wa_status."""
    claimed = await db.trials.update_one(
        {"id": tid, "wa_status": {"$nin": list(SENT_STATES)}},
        {"$set": {"wa_status": "sending", "wa_queued": False}})
    trial = await db.trials.find_one({"id": tid}, {"_id": 0, "clean_image": 0, "garments.fabric_b64": 0})
    if not claimed.modified_count or not trial:  # already being sent by another request or worker
        return (trial or {}).get("wa_status", "")
    s = await shop_settings()
    caption = _caption(trial, s["whatsapp"]["language"], s["shop_profile"])
    image = trial["generated_image"]  # the watermarked copy, never the clean one

    async def action():
        media_id = await wa.upload_media(_image_bytes(image))
        return await wa.send_image(phone, media_id, caption)

    res = await _send({"kind": "image", "purpose": "look", "category": "SERVICE", "body": caption,
                       "phone": phone, "session_id": trial["session_id"], "trial_id": tid}, action)
    if res["ok"]:
        await db.trials.update_one({"id": tid}, {"$set": {
            "wa_status": "sent", "wa_sent_at": iso(), "wa_message_id": res["wa_message_id"], "wa_error": ""}})
        return "sent"
    await db.trials.update_one({"id": tid}, {"$set": {"wa_status": "failed", "wa_error": res["error"]}})
    return "failed"


async def flush_queue(phone: str) -> int:
    """Send every queued look for this phone, oldest look number first."""
    contact = await get_contact(phone)
    if not wa.enabled() or not consented(contact) or not window_open(contact):
        return 0
    sids = [s["id"] async for s in db.sessions.find({"wa_phone": phone}, {"_id": 0, "id": 1})]
    if not sids:
        return 0
    queued = await db.trials.find({"session_id": {"$in": sids}, "wa_status": "queued"},
                                  {"_id": 0, "id": 1}).sort([("look_no", 1), ("created_at", 1)]).to_list(200)
    sent = 0
    for t in queued:
        if await _deliver_look(t["id"], phone) == "sent":
            sent += 1
    return sent


async def _look_permission(user) -> Dict:
    s = await shop_settings()
    looks = s["whatsapp"]["send_looks"]
    allowed = (wa.enabled() and looks["on"] and permissions.can(user, "whatsapp_send")
               and (permissions.is_super(user) or looks["allow_staff"]))
    return {"allowed": allowed, "settings": s}


async def send_look(tid: str, user) -> Dict:
    perm = await _look_permission(user)
    if not perm["allowed"]:
        raise HTTPException(403, "Sending looks on WhatsApp is not allowed")
    trial = await db.trials.find_one({"id": tid}, _TRIAL_FIELDS | {"generated_image": 0})
    if not trial:
        raise HTTPException(404, "Try-on not found (it may have expired)")
    if trial.get("status") != "done":
        raise HTTPException(400, "This try-on is not ready yet")
    s = await db.sessions.find_one({"id": trial["session_id"]}, {"_id": 0, "wa_phone": 1})
    phone = (s or {}).get("wa_phone")
    contact = await get_contact(phone)
    if not consented(contact):
        raise HTTPException(400, "Customer has not agreed to WhatsApp messages")
    if trial.get("wa_status") in SENT_STATES:
        return {"wa_status": trial["wa_status"], "look_no": trial.get("look_no")}
    look_no = await _assign_look_no(trial)
    if window_open(contact):
        status = await _deliver_look(tid, phone)
    else:
        # Wait for the customer to tap the welcome message; never pay per image.
        await db.trials.update_one(
            {"id": tid, "wa_status": {"$nin": list(SENT_STATES)}},
            {"$set": {"wa_status": "queued", "wa_queued": True, "wa_queued_at": iso(), "wa_error": ""}})
        # The customer may have replied while we were queueing.
        await flush_queue(phone)
        status = (await db.trials.find_one({"id": tid}, {"_id": 0, "wa_status": 1}))["wa_status"]
    t = await db.trials.find_one({"id": tid}, {"_id": 0, "wa_error": 1})
    return {"wa_status": status, "look_no": look_no, "wa_error": (t or {}).get("wa_error", "")}


# ---------- Webhook ----------
STOP_WORDS = {"stop", "unsubscribe", "stop all", "band", "band karo", "बंद", "बंद करो", "रोकें", "रोको"}
START_WORDS = {"start", "subscribe", "shuru", "शुरू", "चालू"}


def _norm(text: str) -> str:
    return re.sub(r"[^\w\sऀ-ॿ-]", "", (text or "").strip().lower()).strip()


_QR_TEXTS = {_norm(v) for v in tpl.FREE_FORM["qr_prefill"].values()}
_ORDER = {"sending": 0, "sent": 1, "delivered": 2, "read": 3}


async def _status_update(st: Dict):
    row = await db.wa_messages.find_one({"wa_message_id": st.get("id"), "direction": "out"},
                                        {"_id": 0, "id": 1, "status": 1, "trial_id": 1})
    if not row:
        return
    new = st.get("status")
    upd: Dict[str, Any] = {"updated_at": iso()}
    pricing = st.get("pricing") or {}
    if pricing:
        upd.update(billable=pricing.get("billable"), billed_category=(pricing.get("category") or "").upper())
    if new == "failed":
        err = (st.get("errors") or [{}])[0]
        code = err.get("code")
        upd.update(status="failed", error_code=code,
                   error=wa.friendly_error(wa.WhatsAppError(err.get("title") or "Message failed", code)))
    elif new in _ORDER and _ORDER[new] > _ORDER.get(row.get("status"), -1):
        upd["status"] = new
    await db.wa_messages.update_one({"id": row["id"]}, {"$set": upd})
    if row.get("trial_id") and "status" in upd:
        tupd = {"wa_status": upd["status"]}
        if upd["status"] == "failed":
            tupd["wa_error"] = upd["error"]
        await db.trials.update_one({"id": row["trial_id"]}, {"$set": tupd})


async def _inbound(m: Dict, names: Dict[str, str]):
    phone = "+" + str(m.get("from", "")).lstrip("+")
    mtype = m.get("type", "")
    text, payload, media_id = "", "", ""
    if mtype == "text":
        text = (m.get("text") or {}).get("body", "")
    elif mtype == "button":
        text, payload = m["button"].get("text", ""), m["button"].get("payload", "")
    elif mtype == "interactive":
        reply = m["interactive"].get("button_reply") or m["interactive"].get("list_reply") or {}
        text, payload = reply.get("title", ""), reply.get("id", "")
    elif mtype in ("image", "video", "document", "audio", "sticker"):
        media = m.get(mtype) or {}
        text, media_id = media.get("caption", ""), media.get("id", "")
    now = iso()
    latest = await db.sessions.find_one({"wa_phone": phone}, {"_id": 0, "customer_id": 1},
                                        sort=[("start_time", -1)])
    customer_id = (latest or {}).get("customer_id", "")
    try:
        await db.wa_messages.insert_one({
            "id": new_id(), "shop_id": SHOP_ID, "direction": "in", "kind": mtype, "purpose": "inbound",
            "status": "received", "wa_message_id": m.get("id"), "phone": phone, "body": text,
            "payload": payload, "media_id": media_id, "profile_name": names.get(m.get("from"), ""),
            "customer_id": customer_id, "created_at": now, "updated_at": now})
    except DuplicateKeyError:
        return  # Meta retried a webhook we already handled
    contact = await db.wa_contacts.find_one_and_update(
        {"shop_id": SHOP_ID, "phone": phone},
        {"$set": {"last_inbound_at": now, "updated_at": now},
         "$setOnInsert": {"id": new_id(), "created_at": now, "customer_id": customer_id,
                          "opted_in": False, "opted_out_at": None}},
        upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)

    word = _norm(text)
    if word in STOP_WORDS:
        await db.wa_contacts.update_one({"shop_id": SHOP_ID, "phone": phone},
                                        {"$set": {"opted_out_at": now, "opted_in": False}})
        await send_free_text(phone, "stop_confirm", "stop_confirm", customer_id=customer_id)
        return
    if word in START_WORDS:
        await db.wa_contacts.update_one({"shop_id": SHOP_ID, "phone": phone}, {"$set": {
            "opted_out_at": None, "opted_in": True, "opted_in_at": now, "opted_in_by": "customer"}})
        await send_free_text(phone, "start_confirm", "start_confirm", customer_id=customer_id)
        await flush_queue(phone)
        return
    if contact.get("opted_out_at"):
        return

    replied = False
    if payload.startswith("LOOKS") or word in _QR_TEXTS:
        if not contact.get("opted_in"):
            # The customer asked for their looks themselves (e.g. the backup QR).
            await db.wa_contacts.update_one({"shop_id": SHOP_ID, "phone": phone}, {"$set": {
                "opted_in": True, "opted_in_at": now, "opted_in_by": "customer"}})
        await send_free_text(phone, "welcome_ack", "welcome_ack", customer_id=customer_id)
        replied = True
    flushed = await flush_queue(phone)
    if replied or flushed or mtype != "text":
        return
    # Any other text: one polite auto-reply per 24 hours. No chat inbox.
    cutoff = iso(now_utc() - WINDOW)
    claimed = await db.wa_contacts.update_one(
        {"shop_id": SHOP_ID, "phone": phone,
         "$or": [{"last_auto_reply_at": None}, {"last_auto_reply_at": {"$lt": cutoff}}]},
        {"$set": {"last_auto_reply_at": now}})
    if claimed.modified_count:
        await send_free_text(phone, "auto_reply", "auto_reply", customer_id=customer_id)


async def handle_webhook(payload: Dict):
    await db.shop_settings.update_one({"shop_id": SHOP_ID}, {"$set": {"wa_last_webhook_at": iso()}},
                                      upsert=True)
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "messages":
                continue
            value = change.get("value") or {}
            names = {c.get("wa_id"): (c.get("profile") or {}).get("name", "")
                     for c in value.get("contacts") or []}
            for m in value.get("messages") or []:
                try:
                    await _inbound(m, names)
                except Exception:
                    logger.exception("Inbound WhatsApp message failed")
            for st in value.get("statuses") or []:
                try:
                    await _status_update(st)
                except Exception:
                    logger.exception("WhatsApp status update failed")


@router.get("/webhook")
async def webhook_verify(request: Request):
    q = request.query_params
    token = wa._env("WHATSAPP_VERIFY_TOKEN")
    if q.get("hub.mode") == "subscribe" and token and q.get("hub.verify_token") == token:
        return PlainTextResponse(q.get("hub.challenge", ""))
    raise HTTPException(403, "Verification failed")


@router.post("/webhook")
async def webhook_receive(request: Request):
    raw = await request.body()
    if not wa.verify_signature(raw, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(403, "Bad signature")
    if not wa.enabled():
        return {"ok": True}
    try:
        payload = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Bad JSON")
    # Answer Meta at once; the work happens in the background.
    spawn(handle_webhook(payload))
    return {"ok": True}


# ---------- Staff endpoints ----------
@router.get("/client-config")
async def client_config(user=Depends(current_user)):
    perm = await _look_permission(user)
    w = perm["settings"]["whatsapp"]
    return {"enabled": wa.enabled(), "consent_default": bool(w["consent_default"]),
            "can_send_looks": perm["allowed"]}


@router.get("/sessions/{sid}")
async def session_info(sid: str, user=Depends(current_user)):
    s = await db.sessions.find_one({"id": sid}, {"_id": 0, "wa_phone": 1, "has_photo": 1, "mobile": 1})
    if not s:
        raise HTTPException(404, "Session not found")
    perm = await _look_permission(user)
    contact = await get_contact(s.get("wa_phone"))
    trials = {}
    async for t in db.trials.find({"session_id": sid}, {"_id": 0, "id": 1, "wa_status": 1, "look_no": 1,
                                                        "starred": 1, "wa_error": 1}):
        trials[t["id"]] = t
    welcome = await db.wa_messages.find_one({"session_id": sid, "purpose": "welcome"},
                                            {"_id": 0, "status": 1, "error": 1}, sort=[("created_at", -1)])
    receipt = await db.wa_messages.find_one({"session_id": sid, "purpose": "receipt"},
                                            {"_id": 0, "status": 1, "error": 1}, sort=[("created_at", -1)])
    return {"enabled": wa.enabled(), "phone": s.get("wa_phone") or "",
            "consent": consented(contact), "opted_out": bool((contact or {}).get("opted_out_at")),
            "window_open": window_open(contact), "can_send_looks": perm["allowed"],
            "welcome": welcome, "receipt": receipt, "trials": trials}


@router.post("/sessions/{sid}/consent")
async def set_consent(sid: str, body: Dict[str, Any], user=Depends(current_user)):
    permissions.require(user, "sessions_manage")
    s = await db.sessions.find_one({"id": sid}, {"_id": 0, "wa_phone": 1, "customer_id": 1})
    if not s or not s.get("wa_phone"):
        raise HTTPException(400, "This mobile number cannot get WhatsApp messages")
    consent = bool(body.get("consent"))
    await record_consent(s["wa_phone"], s["customer_id"], consent, user["username"])
    await db.sessions.update_one({"id": sid}, {"$set": {"wa_consent": consent}})
    if consent:
        spawn(send_welcome(sid))
    return {"ok": True}


@router.post("/trials/{tid}/send")
async def send_look_endpoint(tid: str, user=Depends(current_user)):
    return await send_look(tid, user)


@router.post("/sessions/{sid}/send-all")
async def send_all(sid: str, user=Depends(current_user)):
    trials = await db.trials.find(
        {"session_id": sid, "status": "done", "wa_status": {"$nin": list(SENT_STATES) + ["queued"]}},
        {"_id": 0, "id": 1}).sort("created_at", 1).to_list(200)
    out = {"sent": 0, "queued": 0, "failed": 0}
    for t in trials:
        r = await send_look(t["id"], user)
        key = "sent" if r["wa_status"] in SENT_STATES else r["wa_status"]
        out[key] = out.get(key, 0) + 1
    return out


@router.post("/sessions/{sid}/invite")
async def resend_invite(sid: str, user=Depends(current_user)):
    permissions.require(user, "whatsapp_send")
    r = await send_welcome(sid, manual=True)
    if not r.get("ok"):
        raise HTTPException(400, r.get("error") or "Could not send")
    return r


@router.post("/sessions/{sid}/receipt")
async def resend_receipt(sid: str, user=Depends(current_user)):
    permissions.require(user, "whatsapp_send")
    r = await send_receipt(sid, manual=True)
    if not r.get("ok"):
        raise HTTPException(400, r.get("error") or "Could not send")
    return r


# ---------- Super admin: Marketing tab ----------
_URL = re.compile(r"^https://\S+$")


def _clean_config(body: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    upd = {}
    if "shop_profile" in body:
        p = {k: str((body["shop_profile"] or {}).get(k, current["shop_profile"][k]) or "").strip()[:300]
             for k in DEFAULT_PROFILE}
        p["slug"] = p["slug"].lower()
        if p["slug"] and not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,39}", p["slug"]):
            raise HTTPException(400, "Slug: 2-40 small letters, numbers or dashes")
        for k in ("maps_url", "review_url"):
            if p[k] and not _URL.match(p[k]):
                raise HTTPException(400, "Links must start with https://")
        upd["shop_profile"] = p
    if "whatsapp" in body:
        w = _merge(current["whatsapp"], body["whatsapp"] or {})
        if w["language"] not in tpl.LANGUAGES:
            raise HTTPException(400, "Language must be english, hindi or hinglish")
        w["consent_default"] = bool(w["consent_default"])
        for k in ("welcome", "receipt"):
            w[k]["on"] = bool(w[k]["on"])
        w["send_looks"] = {"on": bool(w["send_looks"]["on"]), "allow_staff": bool(w["send_looks"]["allow_staff"])}
        upd["whatsapp"] = w
    if not upd:
        raise HTTPException(400, "Nothing to update")
    return upd


@router.get("/config")
async def get_config(user=Depends(current_user)):
    require_super(user)
    s = await shop_settings()
    return {**s, "enabled": wa.enabled(), "missing_env": wa.missing_env(),
            "flag_on": wa._env("WHATSAPP_ENABLED").lower() == "true",
            "public_base_url": wa.public_base_url(), "languages": list(tpl.LANGUAGES)}


@router.put("/config")
async def put_config(body: Dict[str, Any], user=Depends(current_user)):
    require_super(user)
    upd = _clean_config(body, await shop_settings())
    await db.shop_settings.update_one({"shop_id": SHOP_ID}, {"$set": upd}, upsert=True)
    return {"ok": True}


async def _business_number(refresh: bool = False) -> str:
    s = await shop_settings()
    if s["wa_number"] and not refresh:
        return s["wa_number"]
    info = await wa.get_phone_number()
    number = re.sub(r"\D", "", info.get("display_phone_number", ""))
    await db.shop_settings.update_one({"shop_id": SHOP_ID}, {"$set": {"wa_number": number}}, upsert=True)
    return number


@router.get("/status")
async def status(user=Depends(current_user)):
    """Live health check against Meta (same checks as scripts/whatsapp_setup.py)."""
    require_super(user)
    s = await shop_settings()
    out: Dict[str, Any] = {"enabled": wa.enabled(), "missing_env": wa.missing_env(),
                           "last_webhook_at": s["wa_last_webhook_at"], "phone": None,
                           "templates": [], "error": ""}
    if wa.missing_env():
        return out
    try:
        out["phone"] = await wa.get_phone_number()
        await _business_number(refresh=True)
        meta = {(t["name"], t["language"]): t for t in await wa.list_templates()}
        for name, spec in tpl.TEMPLATES.items():
            for lang in tpl.LANGUAGES:
                m = meta.get((tpl.meta_name(name, lang), tpl.meta_language(lang)), {})
                out["templates"].append({
                    "name": name, "language": lang, "meta_name": tpl.meta_name(name, lang),
                    "requested_category": spec["category"], "phase": spec["phase"],
                    "status": m.get("status", "NOT SUBMITTED"), "category": m.get("category", ""),
                    "rejected_reason": m.get("rejected_reason", "")})
    except Exception as e:
        out["error"] = wa.friendly_error(e)
    return out


@router.post("/test")
async def send_test(body: Dict[str, str], user=Depends(current_user)):
    """Send Meta's built-in `hello_world` template to check the connection."""
    require_super(user)
    if not wa.enabled():
        raise HTTPException(400, "WhatsApp is not connected")
    phone = to_e164(body.get("to", ""))
    if not phone:
        raise HTTPException(400, "Enter a valid mobile number")
    r = await _send({"kind": "template", "purpose": "test", "template": "hello_world",
                     "category": "UTILITY", "body": "hello_world (test)", "phone": phone},
                    lambda: wa.send_template(phone, "hello_world", "en_US", []))
    if not r["ok"]:
        raise HTTPException(400, r["error"])
    return r


@router.get("/templates")
async def template_preview(lang: Optional[str] = None, user=Depends(current_user)):
    require_super(user)
    s = await shop_settings()
    lang = tpl.check_language(lang or s["whatsapp"]["language"])
    values = {**tpl.SAMPLE_VARS, **{k: v for k, v in shop_vars(s["shop_profile"]).items() if v != "-"}}
    base = wa.public_base_url() or "https://<your-domain>"
    slug = s["shop_profile"]["slug"] or "<slug>"
    out = []
    for name, spec in tpl.TEMPLATES.items():
        r = tpl.render(name, lang, values)
        links = [b.get("link") for b in (tpl._spec(name)["buttons"] or [])]
        for b, link in zip(r["buttons"], links):
            if link:
                b["url"] = f"{base}/r/{slug}/{link}"
        out.append(r)
    free = [{"name": k, "body": tpl.free_text(k, lang, values)} for k in tpl.FREE_FORM]
    return {"language": lang, "templates": out, "free_form": free}


@router.get("/messages")
async def message_log(direction: str = "", purpose: str = "", status: str = "",
                      frm: str = "", to: str = "", user=Depends(current_user)):
    require_super(user)
    q: Dict[str, Any] = {"shop_id": SHOP_ID}
    if direction:
        q["direction"] = direction
    if purpose:
        q["purpose"] = purpose
    if status:
        q["status"] = status
    rng = {}
    try:
        if frm:
            rng["$gte"] = iso(datetime.fromisoformat(frm[:10]).replace(tzinfo=IST))
        if to:
            rng["$lt"] = iso(datetime.fromisoformat(to[:10]).replace(tzinfo=IST) + timedelta(days=1))
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if rng:
        q["created_at"] = rng
    rows = await db.wa_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    # This month's outbound messages per charging category (Meta reports the
    # real category in status callbacks; until then we use the requested one).
    month = datetime.now(IST).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    counts: Dict[str, int] = {}
    async for r in db.wa_messages.find(
            {"shop_id": SHOP_ID, "direction": "out", "status": {"$ne": "failed"},
             "created_at": {"$gte": iso(month)}},
            {"_id": 0, "category": 1, "billed_category": 1}):
        cat = r.get("billed_category") or r.get("category") or "OTHER"
        counts[cat] = counts.get(cat, 0) + 1
    return {"messages": rows, "month_counts": counts}


@router.get("/optouts")
async def optouts(user=Depends(current_user)):
    require_super(user)
    rows = await db.wa_contacts.find({"shop_id": SHOP_ID, "opted_out_at": {"$ne": None}},
                                     {"_id": 0}).sort("opted_out_at", -1).to_list(1000)
    ids = [r.get("customer_id") for r in rows if r.get("customer_id")]
    names = {c["id"]: c.get("name", "") async for c in
             db.customers.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1})}
    for r in rows:
        r["name"] = names.get(r.get("customer_id"), "")
    return rows


def _qr_png(text: str) -> str:
    img = qrcode.make(text, box_size=12, border=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@router.get("/qr")
async def shop_qr(user=Depends(current_user)):
    """Backup QR for the counter: opens a chat with the shop, text prefilled."""
    require_super(user)
    if wa.missing_env():
        raise HTTPException(400, "WhatsApp is not connected")
    try:
        number = await _business_number()
    except Exception as e:
        raise HTTPException(400, wa.friendly_error(e))
    s = await shop_settings()
    text = tpl.free_text("qr_prefill", s["whatsapp"]["language"], {})
    url = f"https://wa.me/{number}?text={quote(text)}"
    return {"url": url, "image": _qr_png(url)}


# ---------- Public review / map redirects ----------
@public_router.get("/r/{slug}/{kind}")
async def short_link(slug: str, kind: str):
    """Template buttons need one fixed base URL, so they point here and we
    redirect to the shop's own Google review / Maps link."""
    doc = await db.shop_settings.find_one({"shop_profile.slug": slug.lower()}, {"_id": 0, "shop_profile": 1})
    profile = (doc or {}).get("shop_profile") or {}
    target = {"review": profile.get("review_url"), "map": profile.get("maps_url")}.get(kind)
    if not target:
        raise HTTPException(404, "Not found")
    return RedirectResponse(target, status_code=302)


async def ensure_indexes():
    await db.wa_contacts.create_index([("shop_id", 1), ("phone", 1)], unique=True)
    await db.wa_contacts.create_index("last_inbound_at")
    await db.wa_messages.create_index("idempotency_key", unique=True, sparse=True)
    await db.wa_messages.create_index("wa_message_id", unique=True, sparse=True)
    await db.wa_messages.create_index([("shop_id", 1), ("created_at", -1)])
    await db.wa_messages.create_index("session_id")
    await db.wa_scheduled.create_index([("due_at", 1), ("status", 1)])
    await db.shop_settings.create_index("shop_id", unique=True)
    await db.sessions.create_index("wa_phone")
    await db.trials.create_index([("session_id", 1), ("wa_status", 1)])
