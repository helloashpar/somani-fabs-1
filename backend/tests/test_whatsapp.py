"""Unit tests for the WhatsApp features. Meta's Graph API is always mocked and
the database is an in-memory mongomock, so nothing real is ever sent.

Run:  python -m pytest tests/test_whatsapp.py -n 0
Set WA_TEST_MONGO_URL (e.g. mongodb://127.0.0.1:27017) to run against a real
MongoDB instead; a throwaway database is created and dropped.
"""
import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, Request
import httpx
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

import messaging
import whatsapp_service as wa
import whatsapp_templates as tpl


SECRET = "test-app-secret"


def jpeg_uri():
    buf = io.BytesIO()
    Image.new("RGB", (40, 60), (120, 30, 30)).save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


class FakeMeta:
    """Records every Graph call instead of sending it."""

    def __init__(self):
        self.calls = []
        self.fail_code = None
        self.n = 0

    def _id(self):
        self.n += 1
        return f"wamid.{self.n}"

    async def _maybe_fail(self):
        await asyncio.sleep(0)  # let other coroutines interleave
        if self.fail_code:
            raise wa.WhatsAppError("boom", self.fail_code)

    async def send_template(self, phone, name, language, components):
        await self._maybe_fail()
        self.calls.append(("template", phone, name, language, components))
        return self._id()

    async def send_text(self, phone, text):
        await self._maybe_fail()
        self.calls.append(("text", phone, text))
        return self._id()

    async def upload_media(self, data, mime="image/jpeg", filename="look.jpg"):
        assert data[:2] == b"\xff\xd8"  # real JPEG bytes, never a URL
        self.calls.append(("upload", len(data)))
        return "media-1"

    async def send_image(self, phone, media_id, caption=""):
        await self._maybe_fail()
        self.calls.append(("image", phone, media_id, caption))
        return self._id()

    def kinds(self):
        return [c[0] for c in self.calls]


async def fake_auth(request: Request):
    role = request.headers.get("X-Role")
    if not role:
        raise HTTPException(401, "Not authenticated")
    return {"id": "u-" + role, "name": role, "role": role}


@pytest_asyncio.fixture
async def env(monkeypatch):
    real = os.environ.get("WA_TEST_MONGO_URL")
    if real:
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo = AsyncIOMotorClient(real)
        db = mongo["wa_test_" + uuid.uuid4().hex[:8]]
    else:
        db = AsyncMongoMockClient()["wa_test"]
    messaging.init(db, fake_auth)
    await messaging.ensure_indexes()
    meta = FakeMeta()
    for name in ("send_template", "send_text", "upload_media", "send_image"):
        monkeypatch.setattr(wa, name, getattr(meta, name))
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    for k in wa.REQUIRED_ENV:
        monkeypatch.setenv(k, "x")
    monkeypatch.setenv("WHATSAPP_APP_SECRET", SECRET)
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "verify-me")
    await db.shop_settings.insert_one({"shop_id": "default", "shop_profile": {
        "name": "Test Shop", "phone": "+91 90000 00000", "slug": "test-shop",
        "review_url": "https://g.page/r/test", "maps_url": "https://maps.app.goo.gl/test"},
        "whatsapp": {"language": "english"}})
    yield db, meta
    if real:
        await mongo.drop_database(db.name)


async def make_session(db, sid="s1", mobile="9876543210", photo=True, consent=True, status="active", **extra):
    phone = messaging.to_e164(mobile)
    await db.sessions.insert_one({
        "id": sid, "customer_id": "c1", "customer_name": "Ravi", "mobile": mobile,
        "photo": jpeg_uri() if photo else "", "has_photo": photo, "status": status,
        "start_time": messaging.iso(), "wa_phone": phone, **extra})
    if consent is not None:
        await messaging.record_consent(phone, "c1", consent, "staff")
    return phone


async def make_trial(db, tid, sid="s1"):
    await db.trials.insert_one({
        "id": tid, "session_id": sid, "status": "done", "type": "Top + Bottom",
        "garments": [{"slot": "top", "garment_type": "Kurta"}, {"slot": "bottom", "garment_type": "Pyjama"}],
        "generated_image": jpeg_uri(), "clean_image": "CLEAN", "created_at": messaging.iso()})


def inbound(phone, text="", payload="", mid="in.1"):
    m = {"from": phone.lstrip("+"), "id": mid, "timestamp": "0"}
    if payload:
        m.update(type="button", button={"text": text, "payload": payload})
    else:
        m.update(type="text", text={"body": text})
    return {"object": "whatsapp_business_account", "entry": [{"changes": [{
        "field": "messages", "value": {"contacts": [{"wa_id": m["from"], "profile": {"name": "Ravi"}}],
                                       "messages": [m]}}]}]}


STAFF = {"role": "admin", "id": "u1", "name": "staff", "permissions": __import__("permissions").staff_defaults()}


# ---------- pure helpers ----------
def test_phone_normalisation():
    assert messaging.to_e164("98765 43210") == "+919876543210"
    assert messaging.to_e164("09876543210") == "+919876543210"
    assert messaging.to_e164("+44 7700 900123") == "+447700900123"
    assert messaging.to_e164("12345") == ""


def test_window_calculation():
    now = messaging.now_utc()
    assert not messaging.window_open(None)
    assert not messaging.window_open({"last_inbound_at": None})
    assert messaging.window_open({"last_inbound_at": messaging.iso(now - timedelta(hours=23, minutes=59))}, now)
    assert not messaging.window_open({"last_inbound_at": messaging.iso(now - timedelta(hours=24, seconds=1))}, now)


def test_signature_check(monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", SECRET)
    body = b'{"a":1}'
    good = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert wa.verify_signature(body, good)
    assert not wa.verify_signature(body + b" ", good)
    assert not wa.verify_signature(body, "sha256=deadbeef")
    assert not wa.verify_signature(body, "")
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "")
    assert not wa.verify_signature(body, good)


def test_inr_format():
    assert messaging.inr(125000.5) == "1,25,000.50"
    assert messaging.inr(4500) == "4,500"
    assert messaging.inr(0) == "0"
    assert messaging.inr(999) == "999"


def test_disabled_without_env(monkeypatch):
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_TOKEN", "")
    assert not wa.enabled()
    monkeypatch.setenv("WHATSAPP_ENABLED", "false")
    assert not wa.enabled()


@pytest.mark.parametrize("lang", tpl.LANGUAGES)
def test_templates_render_in_every_language(lang):
    for name, spec in tpl.TEMPLATES.items():
        r = tpl.render(name, lang, tpl.SAMPLE_VARS)
        assert "{{" not in r["body"], (name, lang)
        assert r["footer"] == "Powered by Countr OS"
        body = tpl.body(name, lang)
        # Meta rejects bodies that start or end with a variable.
        assert not body.startswith("{{") and not body.rstrip().endswith("}}"), (name, lang)
        assert all(len(b["text"]) <= 25 for b in r["buttons"]), (name, lang)
        sub = tpl.submission(name, lang, "https://app.example.com", "h")
        assert sub["parameter_format"] == "NAMED"
        named = sub["components"][1 if spec["header"] else 0]["example"]["body_text_named_params"]
        assert {p["param_name"] for p in named} == set(tpl.variables(body))
    for key in tpl.FREE_FORM:
        assert "{{" not in tpl.free_text(key, lang, tpl.SAMPLE_VARS)


def test_no_shop_specific_text_in_templates():
    text = json.dumps([tpl.TEMPLATES, tpl.FREE_FORM], ensure_ascii=False).lower()
    for word in ("somani", "kuchaman", "सोमानी"):
        assert word not in text


def test_hinglish_naming():
    assert tpl.meta_name("session_welcome", "hinglish") == "session_welcome_hinglish"
    assert tpl.meta_language("hinglish") == "en"
    assert tpl.meta_language("hindi") == "hi"


def test_url_button_uses_fixed_base_and_slug_suffix():
    sub = tpl.submission("review_request", "english", "https://app.example.com/")
    btn = sub["components"][-1]["buttons"][0]
    assert btn["url"] == "https://app.example.com/r/{{1}}"
    comps = tpl.send_components("review_request", "english", tpl.SAMPLE_VARS, slug="myshop")
    assert comps[-1]["parameters"][0]["text"] == "myshop/review"


# ---------- consent gating + welcome ----------
async def test_welcome_sent_with_photo_and_consent(env):
    db, meta = env
    await make_session(db)
    r = await messaging.send_welcome("s1")
    assert r["ok"]
    assert meta.calls[0][:3] == ("template", "+919876543210", "session_welcome")
    assert meta.calls[0][4][-1]["parameters"][0]["payload"] == "LOOKS:s1"


async def test_no_welcome_without_consent(env):
    db, meta = env
    await make_session(db, consent=False)
    assert not (await messaging.send_welcome("s1"))["ok"]
    await make_session(db, sid="s2", mobile="9876500000", consent=None)
    assert not (await messaging.send_welcome("s2"))["ok"]
    assert meta.calls == []


async def test_no_welcome_for_entry_session_without_photo(env):
    db, meta = env
    await make_session(db, photo=False)
    assert not (await messaging.send_welcome("s1"))["ok"]
    assert meta.calls == []


async def test_welcome_is_free_text_when_window_open(env):
    db, meta = env
    phone = await make_session(db)
    await db.wa_contacts.update_one({"phone": phone}, {"$set": {"last_inbound_at": messaging.iso()}})
    await messaging.send_welcome("s1")
    assert meta.kinds() == ["text"]


async def test_nothing_sent_when_disabled(env, monkeypatch):
    db, meta = env
    await make_session(db)
    monkeypatch.setenv("WHATSAPP_ENABLED", "false")
    assert not (await messaging.send_welcome("s1"))["ok"]
    assert meta.calls == []


# ---------- idempotency ----------
async def test_two_workers_send_welcome_once(env):
    db, meta = env
    await make_session(db)
    results = await asyncio.gather(messaging.send_welcome("s1"), messaging.send_welcome("s1"))
    assert sorted(r.get("ok") for r in results) == [False, True]
    assert meta.kinds() == ["template"]
    # A later photo change does not re-send either.
    await messaging.send_welcome("s1")
    assert meta.kinds() == ["template"]


async def test_manual_resend_is_allowed(env):
    db, meta = env
    await make_session(db)
    await messaging.send_welcome("s1")
    await messaging.send_welcome("s1", manual=True)
    assert meta.kinds() == ["template", "template"]


# ---------- looks: queue then flush ----------
async def test_looks_queue_then_flush_in_order_on_inbound(env):
    db, meta = env
    phone = await make_session(db)
    for tid in ("t1", "t2", "t3"):
        await make_trial(db, tid)
    for tid in ("t2", "t1", "t3"):  # staff tap in this order
        r = await messaging.send_look(tid, STAFF)
        assert r["wa_status"] == "queued"
    assert meta.calls == []
    nos = {t["id"]: t["look_no"] async for t in db.trials.find({}, {"id": 1, "look_no": 1})}
    assert nos == {"t2": 1, "t1": 2, "t3": 3}

    await messaging.handle_webhook(inbound(phone, "Send my looks", payload="LOOKS:s1"))
    assert meta.kinds() == ["text", "upload", "image", "upload", "image", "upload", "image"]
    captions = [c[3] for c in meta.calls if c[0] == "image"]
    assert [c.split("—")[0].strip() for c in captions] == ["Look #1", "Look #2", "Look #3"]
    assert "Kurta + Pyjama" in captions[0] and "Test Shop" in captions[0]
    statuses = {t["wa_status"] async for t in db.trials.find({}, {"wa_status": 1})}
    assert statuses == {"sent"}


async def test_look_sent_at_once_when_window_open_and_not_twice(env):
    db, meta = env
    phone = await make_session(db)
    await db.wa_contacts.update_one({"phone": phone}, {"$set": {"last_inbound_at": messaging.iso()}})
    await make_trial(db, "t1")
    r1, r2 = await asyncio.gather(messaging.send_look("t1", STAFF), messaging.send_look("t1", STAFF))
    assert meta.kinds().count("image") == 1
    assert {r1["wa_status"], r2["wa_status"]} <= {"sent", "sending"}


async def test_look_needs_consent(env):
    db, meta = env
    await make_session(db, consent=False)
    await make_trial(db, "t1")
    with pytest.raises(HTTPException) as e:
        await messaging.send_look("t1", STAFF)
    assert e.value.status_code == 400


async def test_staff_permission_toggle(env):
    db, meta = env
    await make_session(db)
    await make_trial(db, "t1")
    await db.shop_settings.update_one({"shop_id": "default"},
                                      {"$set": {"whatsapp.send_looks": {"on": True, "allow_staff": False}}})
    with pytest.raises(HTTPException) as e:
        await messaging.send_look("t1", STAFF)
    assert e.value.status_code == 403
    r = await messaging.send_look("t1", {"role": "super", "id": "s", "name": "boss"})
    assert r["wa_status"] == "queued"


async def test_failed_look_can_be_retried(env):
    db, meta = env
    phone = await make_session(db)
    await db.wa_contacts.update_one({"phone": phone}, {"$set": {"last_inbound_at": messaging.iso()}})
    await make_trial(db, "t1")
    meta.fail_code = 131026
    r = await messaging.send_look("t1", STAFF)
    assert r["wa_status"] == "failed" and "WhatsApp" in r["wa_error"]
    meta.fail_code = None
    assert (await messaging.send_look("t1", STAFF))["wa_status"] == "sent"


# ---------- STOP / START ----------
async def test_stop_and_start(env):
    db, meta = env
    phone = await make_session(db)
    await make_trial(db, "t1")
    await messaging.handle_webhook(inbound(phone, "STOP", mid="in.1"))
    c = await messaging.get_contact(phone)
    assert c["opted_out_at"] and not c["opted_in"]
    assert meta.kinds() == ["text"] and "unsubscribed" in meta.calls[0][2]
    with pytest.raises(HTTPException):
        await messaging.send_look("t1", STAFF)
    assert not (await messaging.send_welcome("s1"))["ok"]
    # Further texts get no reply while opted out.
    await messaging.handle_webhook(inbound(phone, "hello?", mid="in.2"))
    assert meta.kinds() == ["text"]
    await messaging.handle_webhook(inbound(phone, "Start", mid="in.3"))
    c = await messaging.get_contact(phone)
    assert not c["opted_out_at"] and c["opted_in"]
    assert meta.kinds() == ["text", "text"]


async def test_hindi_stop_word(env):
    db, meta = env
    phone = await make_session(db)
    await messaging.handle_webhook(inbound(phone, "बंद करो"))
    assert (await messaging.get_contact(phone))["opted_out_at"]


# ---------- webhook ----------
async def test_duplicate_webhook_processed_once(env):
    db, meta = env
    phone = await make_session(db)
    payload = inbound(phone, "Send my looks", payload="LOOKS:s1")
    await messaging.handle_webhook(payload)
    await messaging.handle_webhook(payload)
    assert meta.kinds() == ["text"]
    assert await db.wa_messages.count_documents({"direction": "in"}) == 1


async def test_auto_reply_once_per_day(env):
    db, meta = env
    phone = await make_session(db)
    await messaging.handle_webhook(inbound(phone, "what is the price?", mid="a"))
    await messaging.handle_webhook(inbound(phone, "hello", mid="b"))
    assert meta.kinds() == ["text"] and "+91 90000 00000" in meta.calls[0][2]


async def test_qr_message_opts_in_and_flushes(env):
    db, meta = env
    phone = await make_session(db, consent=None)
    await db.wa_contacts.insert_one({"shop_id": "default", "phone": phone, "opted_in": False,
                                     "opted_out_at": None, "last_inbound_at": None})
    await messaging.handle_webhook(inbound(phone, tpl.FREE_FORM["qr_prefill"]["hinglish"]))
    assert (await messaging.get_contact(phone))["opted_in"]
    assert meta.kinds() == ["text"]


async def test_status_callbacks_update_trial_tick(env):
    db, meta = env
    phone = await make_session(db)
    await db.wa_contacts.update_one({"phone": phone}, {"$set": {"last_inbound_at": messaging.iso()}})
    await make_trial(db, "t1")
    await messaging.send_look("t1", STAFF)
    mid = (await db.trials.find_one({"id": "t1"}))["wa_message_id"]

    def st(status, **extra):
        return {"entry": [{"changes": [{"field": "messages", "value": {"statuses": [
            {"id": mid, "status": status, **extra}]}}]}]}
    await messaging.handle_webhook(st("read", pricing={"category": "service", "billable": False}))
    await messaging.handle_webhook(st("delivered"))  # late, must not go backwards
    assert (await db.trials.find_one({"id": "t1"}))["wa_status"] == "read"
    row = await db.wa_messages.find_one({"wa_message_id": mid})
    assert row["billed_category"] == "SERVICE"


# ---------- receipt ----------
async def test_receipt_once_on_purchase(env):
    db, meta = env
    await make_session(db, status="closed", purchased=True, total_value=4500, discount=500,
                       final_paid=4000, end_time=messaging.iso())
    await messaging.send_receipt("s1")
    await messaging.send_receipt("s1")
    assert meta.kinds() == ["template"]
    params = {p["parameter_name"]: p["text"] for p in meta.calls[0][4][0]["parameters"]}
    assert params["paid"] == "4,000" and params["shop_name"] == "Test Shop"
    await messaging.send_receipt("s1", manual=True)  # "Resend receipt" button
    assert meta.kinds() == ["template", "template"]


async def test_no_receipt_when_not_purchased(env):
    db, meta = env
    await make_session(db, status="closed", purchased=False)
    assert not (await messaging.send_receipt("s1"))["ok"]
    assert meta.calls == []


# ---------- HTTP: webhook + super-only endpoints ----------
@pytest_asyncio.fixture
async def client(env):
    app = FastAPI()
    app.include_router(messaging.router)
    app.include_router(messaging.public_router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c, env


SUPER_ONLY = [("GET", "/api/whatsapp/config", None), ("PUT", "/api/whatsapp/config", {"whatsapp": {}}),
              ("GET", "/api/whatsapp/status", None), ("POST", "/api/whatsapp/test", {"to": "9876543210"}),
              ("GET", "/api/whatsapp/templates", None), ("GET", "/api/whatsapp/messages", None),
              ("GET", "/api/whatsapp/optouts", None), ("GET", "/api/whatsapp/qr", None)]


@pytest.mark.parametrize("method,path,body", SUPER_ONLY)
async def test_config_endpoints_are_super_only(client, method, path, body):
    c, _ = client
    r = await c.request(method, path, json=body, headers={"X-Role": "admin"})
    assert r.status_code == 403, path
    assert (await c.request(method, path, json=body)).status_code == 401


async def test_super_can_update_config(client):
    c, (db, _) = client
    h = {"X-Role": "super"}
    r = await c.put("/api/whatsapp/config", headers=h, json={
        "shop_profile": {"name": "New", "slug": "new-shop", "review_url": "https://g.page/x"},
        "whatsapp": {"language": "hindi", "send_looks": {"allow_staff": False}}})
    assert r.status_code == 200, r.text
    cfg = (await c.get("/api/whatsapp/config", headers=h)).json()
    assert cfg["whatsapp"]["language"] == "hindi"
    assert cfg["whatsapp"]["send_looks"] == {"on": True, "allow_staff": False}
    assert cfg["shop_profile"]["slug"] == "new-shop"
    bad = await c.put("/api/whatsapp/config", headers=h, json={"shop_profile": {"review_url": "http://x"}})
    assert bad.status_code == 400
    preview = (await c.get("/api/whatsapp/templates", headers=h)).json()
    assert preview["language"] == "hindi" and "New" in preview["templates"][0]["body"]


async def test_webhook_rejects_bad_signature_and_accepts_good(client):
    c, (db, meta) = client
    body = json.dumps({"entry": []}).encode()
    assert (await c.post("/api/whatsapp/webhook", content=body,
                         headers={"X-Hub-Signature-256": "sha256=bad"})).status_code == 403
    sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert (await c.post("/api/whatsapp/webhook", content=body,
                         headers={"X-Hub-Signature-256": sig})).status_code == 200


async def test_webhook_verify_handshake(client):
    c, _ = client
    ok = await c.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me",
                                                "hub.challenge": "123"})
    assert ok.status_code == 200 and ok.text == "123"
    assert (await c.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "no",
                                                         "hub.challenge": "1"})).status_code == 403


async def test_short_links_redirect(client):
    c, _ = client
    r = await c.get("/r/test-shop/review", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "https://g.page/r/test"
    assert (await c.get("/r/test-shop/map", follow_redirects=False)).headers["location"].startswith("https://maps")
    assert (await c.get("/r/unknown/review", follow_redirects=False)).status_code == 404
