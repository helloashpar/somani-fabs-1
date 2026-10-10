"""The shop screen during try-ons: every open preview (any admin, any device)
gets its own block, in a fixed place; moving between looks changes only the
picture; closed previews go at once; the same thing is never shown twice.
In-memory database, no network.

Run:  python -m pytest tests/test_live_display.py -n 0
"""
import httpx
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

import permissions
import server


async def add_admin(db, name, role, mobile):
    doc = {"id": f"id-{name}", "name": name, "mobile": mobile, "role": role, "active": True,
           "password_hash": server.hash_pw("password123"), "created_at": server.iso(),
           "permissions": {} if role == "super" else permissions.staff_defaults()}
    await db.admins.insert_one(doc)
    return {"Authorization": "Bearer " + server.make_token(doc)}


@pytest_asyncio.fixture
async def env(monkeypatch):
    db = AsyncMongoMockClient()["live_test"]
    monkeypatch.setattr(server, "db", db)
    await db.settings.insert_one({"id": "global", "display_secret": "sec", "idle_image": ""})
    sig = (await server.current_watermark())[1]
    for sid, name in (("s1", "Asha"), ("s2", "Ravi")):
        await db.sessions.insert_one({"id": sid, "customer_name": name, "start_time": server.iso(), "status": "active"})
    for i, sid in enumerate(["s1", "s1", "s1", "s2"]):
        await db.trials.insert_one({"id": f"t{i}", "session_id": sid, "status": "done", "description": f"Look {i}",
                                    "generated_image": f"data:image/png;base64,IMG{i}", "wm_sig": sig,
                                    "created_at": f"2026-01-01T00:00:0{i}"})
    a = await add_admin(db, "anil", "super", server.OWNER_MOBILE)
    b = await add_admin(db, "bina", "admin", "9800000001")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://t") as c:
        yield c, db, a, b


async def screen(c):
    return (await c.get("/api/display/sec/state")).json()["previews"]


def shows(previews):
    return [[im["id"] for im in p["images"]] for p in previews]


async def test_each_preview_gets_its_own_block_in_a_fixed_place(env):
    c, _, a, b = env
    # Anil shows all looks of Asha; Bina shows one look of Ravi on her phone
    # and another of Asha on her laptop.
    await c.post("/api/display/preview", headers=a, json={"session_id": "s1", "preview_id": "a1", "seq": 1})
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t3", "preview_id": "phone", "seq": 1})
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t1", "preview_id": "laptop", "seq": 1})
    assert shows(await screen(c)) == [["t0", "t1", "t2"], ["t3"], ["t1"]]

    # Bina's laptop moves to the next look: same block, new picture.
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t2", "preview_id": "laptop", "seq": 2})
    assert shows(await screen(c)) == [["t0", "t1", "t2"], ["t3"], ["t2"]]
    # A late, older request can't undo it.
    r = await c.post("/api/display/preview", headers=b, json={"trial_id": "t0", "preview_id": "laptop", "seq": 1})
    assert r.json().get("stale") is True
    assert shows(await screen(c)) == [["t0", "t1", "t2"], ["t3"], ["t2"]]

    # Her phone closes: its block goes at once; the others keep their order.
    await c.delete("/api/display/preview", headers=b, params={"preview_id": "phone", "seq": 5})
    assert shows(await screen(c)) == [["t0", "t1", "t2"], ["t2"]]
    # A "still here" request sent just before closing doesn't bring it back.
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t3", "preview_id": "phone", "seq": 1})
    assert shows(await screen(c)) == [["t0", "t1", "t2"], ["t2"]]
    # Opened again later (newer number): back on screen.
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t3", "preview_id": "phone", "seq": 6})
    assert len(await screen(c)) == 3


async def test_same_thing_is_shown_once(env):
    c, _, a, b = env
    await c.post("/api/display/preview", headers=a, json={"trial_id": "t1", "preview_id": "x", "seq": 1})
    await c.post("/api/display/preview", headers=b, json={"trial_id": "t1", "preview_id": "y", "seq": 1})
    await c.post("/api/display/preview", headers=b, json={"session_id": "s2", "preview_id": "z", "seq": 1})
    await c.post("/api/display/preview", headers=a, json={"session_id": "s2", "preview_id": "w", "seq": 1})
    assert shows(await screen(c)) == [["t1"], ["t3"]]
    # When the first one closes, the other showing the same look takes over.
    await c.delete("/api/display/preview", headers=a, params={"preview_id": "x", "seq": 2})
    after = await screen(c)
    assert shows(after) == [["t1"], ["t3"]] and after[0]["pid"] == "id-bina:y"


async def test_previews_not_seen_for_a_while_drop_off(env):
    c, db, a, _ = env
    await c.post("/api/display/preview", headers=a, json={"trial_id": "t0", "preview_id": "p", "seq": 1})
    assert len(await screen(c)) == 1
    await db.live_previews.update_many({}, {"$set": {"updated_at": "2000-01-01T00:00:00+00:00"}})
    assert await screen(c) == []
    # Older app versions (no preview id) still work, one block per admin.
    await c.post("/api/display/preview", headers=a, json={"trial_id": "t0"})
    assert len(await screen(c)) == 1
    await c.delete("/api/display/preview", headers=a)
    assert await screen(c) == []


async def test_a_late_close_does_not_hide_a_newer_preview(env):
    c, _, a, _ = env
    await c.post("/api/display/preview", headers=a, json={"trial_id": "t0", "preview_id": "p", "seq": 3})
    r = await c.delete("/api/display/preview", headers=a, params={"preview_id": "p", "seq": 2})
    assert r.json().get("stale") is True and len(await screen(c)) == 1


async def test_place_is_kept_when_closed_before_first_shown(env):
    c, _, a, b = env
    # The app may say "closed" before its first "show" lands (React runs
    # effects twice in development).
    await c.delete("/api/display/preview", headers=a, params={"preview_id": "early", "seq": 2})
    await c.post("/api/display/preview", headers=a, json={"trial_id": "t0", "preview_id": "early", "seq": 3})
    await c.post("/api/display/preview", headers=b, json={"session_id": "s2", "preview_id": "later", "seq": 1})
    for seq in (4, 5, 6):  # keeps beating / moving between looks
        await c.post("/api/display/preview", headers=a, json={"trial_id": f"t{seq - 4}", "preview_id": "early", "seq": seq})
        assert [p["pid"] for p in await screen(c)] == ["id-anil:early", "id-bina:later"]
