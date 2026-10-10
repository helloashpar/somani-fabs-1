"""Admin roles and the staff permission matrix. In-memory database, no network.

Run:  python -m pytest tests/test_permissions.py -n 0
"""
import httpx
import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

import permissions
import server


MOBILES = {"ravi": "9800000001", "neha": "9800000002", "old": "9800000003"}


async def add_admin(db, name, role="admin", perms=None, active=True, mobile=None):
    doc = {"id": f"id-{name}", "name": name, "mobile": mobile or MOBILES[name], "role": role, "active": active,
           "password_hash": server.hash_pw("password123"), "created_at": server.iso(),
           "permissions": perms if perms is not None else ({} if role == "super" else permissions.staff_defaults())}
    await db.admins.insert_one(doc)
    return {"Authorization": "Bearer " + server.make_token(doc)}


@pytest_asyncio.fixture
async def env(monkeypatch):
    db = AsyncMongoMockClient()["perm_test"]
    monkeypatch.setattr(server, "db", db)
    owner = await add_admin(db, "owner", "super", mobile=server.OWNER_MOBILE)
    staff = await add_admin(db, "ravi")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://t") as c:
        yield c, db, owner, staff


def test_registry_is_consistent():
    keys = [p.key for p in permissions.PERMISSIONS]
    assert len(keys) == len(set(keys))
    assert all(p.group in {"sessions", "customers", "history", "reports", "setup"} for p in permissions.PERMISSIONS)
    # Market-standard staff defaults: counter work on, money / data / setup off.
    d = permissions.staff_defaults()
    assert d["sessions_manage"] and d["trials_create"] and d["history_view"]
    assert not (d["history_edit"] or d["history_delete"] or d["customers_export"] or d["stats_view"] or d["catalog_manage"])


def test_super_has_everything_and_unknown_keys_dropped():
    assert all(permissions.effective({"role": "super"}).values())
    assert permissions.clean({"history_edit": 1, "made.up": True})["history_edit"] is True
    assert "made.up" not in permissions.clean({"made.up": True})


async def test_staff_cannot_edit_or_delete_history(env):
    c, db, owner, staff = env
    await db.sessions.insert_one({"id": "s1", "customer_id": "c1", "status": "closed", "start_time": server.iso()})
    body = {"purchased": True, "total_value": 100, "discount": 0, "final_paid": 100}
    assert (await c.patch("/api/sessions/s1", json=body, headers=staff)).status_code == 403
    assert (await c.delete("/api/sessions/s1", headers=staff)).status_code == 403
    assert (await c.get("/api/sessions/history", headers=staff)).status_code == 200
    assert (await c.patch("/api/sessions/s1", json=body, headers=owner)).status_code == 200


async def test_granted_permission_works_at_once(env):
    c, db, owner, staff = env
    assert (await c.get("/api/stats", headers=staff)).status_code == 403
    r = await c.put("/api/admins/id-ravi", headers=owner, json={"permissions": {**permissions.staff_defaults(), "stats_view": True}})
    assert r.status_code == 200 and r.json()["permissions"]["stats_view"] is True
    assert (await c.get("/api/stats", headers=staff)).status_code == 200


async def test_only_super_admins_manage_the_team(env):
    c, db, owner, staff = env
    assert (await c.get("/api/admins", headers=staff)).status_code == 403
    assert (await c.post("/api/admins", headers=staff, json={"mobile": "9811111111", "password": "password123"})).status_code == 403
    r = await c.post("/api/admins", headers=owner, json={"name": "Neha", "mobile": "+91 98111 11112", "password": "password123", "role": "super"})
    assert r.status_code == 200 and r.json()["role"] == "super" and all(r.json()["permissions"].values())
    r = await c.post("/api/admins", headers=owner, json={"mobile": "9811111113", "password": "password123",
                                                         "permissions": {"stats_view": True}})
    perms = r.json()["permissions"]
    assert perms["stats_view"] is True and perms["sessions_manage"] is True and perms["history_edit"] is False
    team = (await c.get("/api/admins", headers=owner)).json()
    assert [a["is_owner"] for a in team if a["mobile"] == server.OWNER_MOBILE] == [True]
    assert [a["mobile"] for a in team if a["name"] == "Neha"] == ["9811111112"]


async def test_owner_and_self_are_protected(env):
    c, db, owner, staff = env
    oid = "id-owner"
    neha = await add_admin(db, "neha", "super")
    for body in ({"role": "admin"}, {"active": False}, {"password": "newpassword1"}, {"mobile": "9822222222"}):
        assert (await c.put(f"/api/admins/{oid}", headers=neha, json=body)).status_code == 400
    assert (await c.delete(f"/api/admins/{oid}", headers=neha)).status_code == 400
    assert (await c.put("/api/admins/id-neha", headers=neha, json={"role": "admin"})).status_code == 400
    assert (await c.delete("/api/admins/id-neha", headers=neha)).status_code == 400
    # One super admin can manage another.
    assert (await c.put("/api/admins/id-neha", headers=owner, json={"role": "admin"})).status_code == 200


async def test_turned_off_account_is_locked_out(env):
    c, db, owner, staff = env
    assert (await c.put("/api/admins/id-ravi", headers=owner, json={"active": False})).status_code == 200
    assert (await c.get("/api/auth/me", headers=staff)).status_code == 401
    r = await c.post("/api/auth/login", json={"login": "9800000001", "password": "password123"})
    assert r.status_code == 403


async def test_password_reset_by_super_admin(env):
    c, db, owner, staff = env
    assert (await c.put("/api/admins/id-ravi", headers=owner, json={"password": "short"})).status_code == 400
    assert (await c.put("/api/admins/id-ravi", headers=owner, json={"password": "brandnew99"})).status_code == 200
    r = await c.post("/api/auth/login", json={"login": "+91 98000 00001", "password": "brandnew99"})
    assert r.status_code == 200 and r.json()["user"]["permissions"]["sessions_manage"] is True


async def test_migrate_fills_only_missing_permissions(env, monkeypatch):
    c, db, owner, staff = env
    await add_admin(db, "old", perms={"history_edit": True})  # older account: one answer only
    new = permissions.Permission("future_feature", "sessions", True, False)
    monkeypatch.setattr(permissions, "PERMISSIONS", permissions.PERMISSIONS + [new])
    monkeypatch.setattr(permissions, "KEYS", permissions.KEYS + [new.key])
    monkeypatch.setitem(permissions._BY_KEY, new.key, new)
    await permissions.migrate(db)
    old = await db.admins.find_one({"id": "id-old"})
    assert old["permissions"]["history_edit"] is True             # kept
    assert old["permissions"]["sessions_manage"] is True           # existing default
    assert old["permissions"]["future_feature"] is False           # `existing`, not `staff`
    owner_doc = await db.admins.find_one({"mobile": server.OWNER_MOBILE})
    assert owner_doc["permissions"] == {}                          # super admins untouched


async def test_required_session_fields(env):
    c, db, owner, staff = env
    await db.session_fields.insert_one({"id": "f1", "label": "Occupation", "type": "text", "required": True})
    body = {"customer_name": "Asha", "mobile": "9000077777", "extra": {}}
    r = await c.post("/api/sessions", headers=staff, json=body)
    assert r.status_code == 400 and "Occupation" in r.json()["detail"]
    r = await c.post("/api/sessions", headers=staff, json={**body, "extra": {"Occupation": "Teacher"}})
    assert r.status_code == 200
    assert (await c.patch("/api/config/fields/f1", headers=staff, json={"required": False})).status_code == 403
    assert (await c.patch("/api/config/fields/f1", headers=owner, json={"required": False})).status_code == 200


def test_every_permission_has_labels_in_all_languages():
    """A new permission must be named in the app (perm_<key>) in all three languages."""
    import re
    from pathlib import Path
    i18n = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n.js").read_text(encoding="utf-8")
    for key in permissions.KEYS:
        assert len(re.findall(rf"\bperm_{key}:", i18n)) == 3, f"perm_{key} missing in a language"
    for group in {p.group for p in permissions.PERMISSIONS}:
        assert len(re.findall(rf"\bpg_{group}:", i18n)) == 3, f"pg_{group} missing in a language"


async def test_shop_language_is_global(env):
    c, db, owner, staff = env
    await db.settings.insert_one({"id": "global"})
    assert (await c.get("/api/auth/me", headers=staff)).json()["app_language"] == "hinglish"
    assert (await c.put("/api/settings", headers=staff, json={"app_language": "english"})).status_code == 403
    assert (await c.put("/api/settings", headers=owner, json={"app_language": "klingon"})).status_code == 400
    assert (await c.put("/api/settings", headers=owner, json={"app_language": "english"})).status_code == 200
    assert (await c.get("/api/auth/me", headers=staff)).json()["app_language"] == "english"


async def test_login_with_mobile_in_any_format_or_email(env):
    c, db, owner, staff = env
    await db.admins.update_one({"id": "id-ravi"}, {"$set": {"email": "ravi@shop.in"}})
    for login in ("9800000001", "+91 98000 00001", "+919800000001", "919800000001", "09800000001",
                  "0091-98000-00001", " RAVI@Shop.in "):
        r = await c.post("/api/auth/login", json={"login": login, "password": "password123"})
        assert r.status_code == 200, login
        assert r.json()["user"]["name"] == "ravi"
    for login in ("ravi", "98000", "someone@shop.in"):
        r = await c.post("/api/auth/login", json={"login": login, "password": "password123"})
        assert r.status_code == 401, login


async def test_admin_mobile_required_email_optional_and_unique(env):
    c, db, owner, staff = env
    base = {"password": "password123"}
    assert (await c.post("/api/admins", headers=owner, json={**base, "mobile": ""})).status_code == 400
    assert (await c.post("/api/admins", headers=owner, json={**base, "mobile": "12345"})).status_code == 400
    assert (await c.post("/api/admins", headers=owner, json={**base, "mobile": "9833333333", "email": "nope"})).status_code == 400
    r = await c.post("/api/admins", headers=owner, json={**base, "mobile": "9833333333", "email": "A@B.co"})
    assert r.status_code == 200 and r.json()["email"] == "a@b.co" and r.json()["name"] == "+91 98333 33333"
    # Same mobile (typed differently) or same email: refused.
    assert (await c.post("/api/admins", headers=owner, json={**base, "mobile": "+91 98333-33333"})).status_code == 400
    assert (await c.post("/api/admins", headers=owner, json={**base, "mobile": "9844444444", "email": "a@b.co"})).status_code == 400
    # Email can be removed, mobile changed.
    aid = r.json()["id"]
    r = await c.put(f"/api/admins/{aid}", headers=owner, json={"email": "", "mobile": "9855555555", "name": "Amit"})
    assert r.status_code == 200 and r.json()["email"] == "" and r.json()["mobile"] == "9855555555"
    assert "email" not in await db.admins.find_one({"id": aid})


async def test_migration_turns_usernames_into_names(env, monkeypatch):
    c, db, owner, staff = env
    await db.admins.delete_many({})
    await db.admins.insert_one({"id": "legacy-owner", "username": "boss", "role": "super",
                                "password_hash": server.hash_pw("old"), "created_at": server.iso()})
    await db.admins.insert_one({"id": "legacy-staff", "username": "ravi", "role": "admin",
                                "password_hash": server.hash_pw("x"), "created_at": server.iso()})
    monkeypatch.setenv("SUPER_ADMIN_USERNAME", "boss")
    await server._migrate_admin_identity()
    await server._seed_owner()
    boss = await db.admins.find_one({"id": "legacy-owner"})
    assert boss["mobile"] == server.OWNER_MOBILE and boss["email"] == server.OWNER_EMAIL and boss["name"] == "boss"
    assert "username" not in boss and server.verify_pw(server.os.environ["SUPER_ADMIN_PASSWORD"], boss["password_hash"])
    ravi = await db.admins.find_one({"id": "legacy-staff"})
    assert ravi["name"] == "ravi" and "username" not in ravi and "mobile" not in ravi
    assert await db.admins.count_documents({}) == 2


async def test_customer_name_can_be_corrected(env):
    c, db, owner, staff = env
    await db.customers.insert_one({"id": "c1", "name": "Rames", "mobile": "9000011111"})
    await db.sessions.insert_one({"id": "s1", "customer_id": "c1", "customer_name": "Rames", "status": "active",
                                  "start_time": server.iso()})
    await db.live_previews.insert_one({"admin_id": "a", "session_id": "s1", "customer_name": "Rames"})
    assert (await c.put("/api/customers/c1", headers=staff, json={"name": "  "})).status_code == 400
    r = await c.put("/api/customers/c1", headers=staff, json={"name": " Ramesh  Kumar "})
    assert r.status_code == 200 and r.json()["name"] == "Ramesh Kumar"
    assert (await db.customers.find_one({"id": "c1"}))["name"] == "Ramesh Kumar"
    assert (await db.sessions.find_one({"id": "s1"}))["customer_name"] == "Ramesh Kumar"
    assert (await db.live_previews.find_one({"session_id": "s1"}))["customer_name"] == "Ramesh Kumar"
    no_edit = await add_admin(db, "old", perms={**permissions.staff_defaults(), "customers_edit": False})
    assert (await c.put("/api/customers/c1", headers=no_edit, json={"name": "X"})).status_code == 403


async def test_general_settings_are_public_and_validated(env):
    c, db, owner, staff = env
    await db.settings.insert_one({"id": "global", "display_secret": "s"})
    r = await c.get("/api/public/brand")
    assert r.status_code == 200 and r.json()["shop_name"] == "Somani Fabs" and r.json()["logo"] == ""
    assert (await c.put("/api/settings/brand", headers=staff, json={"shop_name": "X"})).status_code == 403
    for bad in ({"shop_name": ""}, {"pincode": "!!"}, {"emails": ["nope"]}, {"map_embed_url": "https://evil.com/x"},
                {"hours": {"mon": {"open": "25:00", "close": "20:00"}}},
                {"instagram": "instagram.com/x"}, {"phones": ["abc"]}, {"logo": "data:image/png;base64,xx"}):
        assert (await c.put("/api/settings/brand", headers=owner, json=bad)).status_code == 400, bad
    import base64, io
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGBA", (1200, 600), (200, 0, 0, 128)).save(buf, format="PNG")
    logo = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    r = await c.put("/api/settings/brand", headers=owner, json={
        "shop_name": "Pareek Textiles", "shop_name_hi": "पारीक टेक्सटाइल्स", "phones": ["+91 98000 00009"],
        "whatsapp": "98000 00009", "instagram": "https://instagram.com/pareek", "logo": logo,
        "emails": ["a@b.in"], "address_street": "Station Road", "pincode": "302001",
        "map_embed_url": '<iframe src="https://www.google.com/maps/embed?pb=!1m18" width="600"></iframe>',
        "hours": {d: {"open": "10:00", "close": "20:30", "closed": d == "sun"} for d in
                  ("mon", "tue", "wed", "thu", "fri", "sat", "sun")},
        "accent_color": "#1a2b3c"})  # website content: not a General field, ignored
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["shop_name"] == "Pareek Textiles" and b["shop_name_hi"] == "पारीक टेक्सटाइल्स" and b["whatsapp"] == "+919800000009"
    assert b["phones"] == ["+91 98000 00009"] and b["city"] == "Kuchaman City"  # untouched fields keep defaults
    assert b["address"] == "Station Road, Kuchaman City, Rajasthan 302001, India"
    assert b["map_embed_url"] == "https://www.google.com/maps/embed?pb=!1m18"
    assert b["hours"]["sun"]["closed"] and b["hours"]["mon"]["open"] == "10:00"
    assert b["classic"]["accent_color"] == "#880D1E"
    assert b["logo"].startswith("/api/public/logo?v=")
    img = await c.get(b["logo"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert max(Image.open(io.BytesIO(img.content)).size) == 512
    assert "brand_logo" not in (await c.get("/api/settings", headers=staff)).json()
    r = await c.put("/api/settings/brand", headers=owner, json={"logo": ""})
    assert r.json()["logo"] == "" and (await c.get("/api/public/logo")).status_code == 404


async def test_general_reads_and_upgrades_older_saved_fields(env):
    c, db, owner, _ = env
    await db.settings.insert_one({"id": "global", "brand": {
        "shop_name": "Old", "address_line1": "Gandhi Chowk", "address_line2": "Nagaur, Rajasthan 341001",
        "hours": "Mon-Sat 10-9", "email": "old@shop.in", "directions_url": "https://maps.app.goo.gl/old",
        "tagline": "Since forever"}})
    b = (await c.get("/api/public/brand")).json()
    assert b["address_street"] == "Gandhi Chowk" and b["pincode"] == "341001" and b["state"] == "Rajasthan"
    assert b["hours_note"] == "Mon-Sat 10-9" and b["hours"] == {} and b["emails"] == ["old@shop.in"]
    assert b["maps_url"] == "https://maps.app.goo.gl/old" and b["classic"]["tagline"] == "Since forever"
    r = await c.put("/api/settings/brand", headers=owner, json={"shop_name": "Old Shop"})
    assert r.status_code == 200, r.text
    stored = (await db.settings.find_one({"id": "global"}))["brand"]
    assert "address_line1" not in stored and "email" not in stored and stored["emails"] == ["old@shop.in"]
    assert stored["hours"] == {} and stored["hours_note"] == "Mon-Sat 10-9" and stored["tagline"] == "Since forever"
    # A cleared field stays cleared instead of falling back to the default.
    r = await c.put("/api/settings/brand", headers=owner, json={"legal_name": "", "shop_name_hi": ""})
    assert r.json()["legal_name"] == "" and r.json()["shop_name_hi"] == ""
