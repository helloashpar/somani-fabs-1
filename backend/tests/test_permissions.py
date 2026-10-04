"""Admin roles and the staff permission matrix. In-memory database, no network.

Run:  python -m pytest tests/test_permissions.py -n 0
"""
import httpx
import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

import permissions
import server


async def add_admin(db, username, role="admin", perms=None, active=True):
    doc = {"id": f"id-{username}", "username": username, "role": role, "active": active,
           "password_hash": server.hash_pw("password123"), "created_at": server.iso(),
           "permissions": perms if perms is not None else ({} if role == "super" else permissions.staff_defaults())}
    await db.admins.insert_one(doc)
    return {"Authorization": "Bearer " + server.make_token(doc)}


@pytest_asyncio.fixture
async def env(monkeypatch):
    db = AsyncMongoMockClient()["perm_test"]
    monkeypatch.setattr(server, "db", db)
    owner = await add_admin(db, server.OWNER_USERNAME, "super")
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
    assert (await c.post("/api/admins", headers=staff, json={"username": "x1x", "password": "password123"})).status_code == 403
    r = await c.post("/api/admins", headers=owner, json={"username": "neha", "password": "password123", "role": "super"})
    assert r.status_code == 200 and r.json()["role"] == "super" and all(r.json()["permissions"].values())
    r = await c.post("/api/admins", headers=owner, json={"username": "amit", "password": "password123",
                                                         "permissions": {"stats_view": True}})
    perms = r.json()["permissions"]
    assert perms["stats_view"] is True and perms["sessions_manage"] is True and perms["history_edit"] is False
    team = (await c.get("/api/admins", headers=owner)).json()
    assert [a["is_owner"] for a in team if a["username"] == server.OWNER_USERNAME] == [True]


async def test_owner_and_self_are_protected(env):
    c, db, owner, staff = env
    oid = f"id-{server.OWNER_USERNAME}"
    neha = await add_admin(db, "neha", "super")
    for body in ({"role": "admin"}, {"active": False}, {"password": "newpassword1"}):
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
    r = await c.post("/api/auth/login", json={"username": "ravi", "password": "password123"})
    assert r.status_code == 403


async def test_password_reset_by_super_admin(env):
    c, db, owner, staff = env
    assert (await c.put("/api/admins/id-ravi", headers=owner, json={"password": "short"})).status_code == 400
    assert (await c.put("/api/admins/id-ravi", headers=owner, json={"password": "brandnew99"})).status_code == 200
    r = await c.post("/api/auth/login", json={"username": "ravi", "password": "brandnew99"})
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
    owner_doc = await db.admins.find_one({"username": server.OWNER_USERNAME})
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
