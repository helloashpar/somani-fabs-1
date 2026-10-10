"""Shop setup > Website: up to 3 websites, one live, classic one locked.
In-memory database, no network.

Run:  python -m pytest tests/test_websites.py -n 0
"""
import base64
import io

import httpx
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

import permissions
import server
import websites


async def add_admin(db, name, role, mobile):
    doc = {"id": f"id-{name}", "name": name, "mobile": mobile, "role": role, "active": True,
           "password_hash": server.hash_pw("password123"), "created_at": server.iso(),
           "permissions": {} if role == "super" else permissions.staff_defaults()}
    await db.admins.insert_one(doc)
    return {"Authorization": "Bearer " + server.make_token(doc)}


@pytest_asyncio.fixture
async def env(monkeypatch):
    db = AsyncMongoMockClient()["site_test"]
    monkeypatch.setattr(server, "db", db)
    await db.settings.insert_one({"id": "global", "display_secret": "s"})
    await websites.ensure_seed(db)
    owner = await add_admin(db, "owner", "super", server.OWNER_MOBILE)
    staff = await add_admin(db, "ravi", "admin", "9800000001")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://t") as c:
        yield c, db, owner, staff


CONFIG = {
    "theme": {"palette": "marigold", "font": "editorial", "radius": "soft"},
    "settings": {"whatsapp_button": True},
    "sections": [
        {"id": "hero", "type": "hero", "variant": "split", "content": {"title": "Hello", "title_hi": "नमस्ते"}},
        {"id": "faq", "type": "faq", "variant": "accordion",
         "content": {"items": [{"q": "Open on Sunday?", "a": "Yes"}]}},
    ],
}


async def test_classic_site_is_seeded_live_and_locked(env):
    c, db, owner, staff = env
    assert (await c.get("/api/websites", headers=staff)).status_code == 403
    r = (await c.get("/api/websites", headers=owner)).json()
    assert r["live_id"] == "classic" and r["limit"] == 3
    assert [s["kind"] for s in r["sites"]] == ["classic"] and r["sites"][0]["locked"]
    assert (await c.get("/api/public/website")).json() == {"id": "classic", "kind": "classic", "config": None}
    assert (await c.put("/api/websites/classic", headers=owner, json={"name": "X"})).status_code == 403
    assert (await c.delete("/api/websites/classic", headers=owner)).status_code == 403
    assert (await c.post("/api/websites/classic/duplicate", headers=owner)).status_code == 403
    await websites.ensure_seed(db)  # runs every start: no second classic site
    assert await db.websites.count_documents({}) == 1


async def test_create_edit_publish_and_limit(env):
    c, db, owner, _ = env
    r = await c.post("/api/websites", headers=owner, json={"name": "Festive", "config": CONFIG, "origin": "quiz"})
    assert r.status_code == 200, r.text
    site = r.json()
    assert site["kind"] == "builder" and site["config"]["sections"][1]["content"]["items"][0]["q"] == "Open on Sunday?"
    sid = site["id"]
    # Edits keep the previous version.
    cfg2 = {**CONFIG, "theme": {**CONFIG["theme"], "palette": "peacock"}}
    r = await c.put(f"/api/websites/{sid}", headers=owner, json={"config": cfg2, "name": "Festive 2"})
    assert r.json()["name"] == "Festive 2" and r.json()["versions"] == 1
    hist = (await c.get(f"/api/websites/{sid}/history", headers=owner)).json()
    assert len(hist) == 1 and hist[0]["sections"] == 2
    r = await c.post(f"/api/websites/{sid}/restore/0", headers=owner)
    assert r.json()["config"]["theme"]["palette"] == "marigold" and r.json()["versions"] == 2
    # Going live.
    assert (await c.post(f"/api/websites/{sid}/publish", headers=owner)).json() == {"live_id": sid}
    pub = (await c.get("/api/public/website")).json()
    assert pub["kind"] == "builder" and pub["config"]["theme"]["palette"] == "marigold" and "history" not in pub
    assert (await c.delete(f"/api/websites/{sid}", headers=owner)).status_code == 400  # live
    # Three at most.
    assert (await c.post(f"/api/websites/{sid}/duplicate", headers=owner)).json()["name"] == "Festive 2 copy"
    assert (await c.post("/api/websites", headers=owner, json={"name": "4th", "config": CONFIG})).status_code == 400
    # Deleting a draft frees a place; the live one falls back to classic if it goes.
    await c.post("/api/websites/classic/publish", headers=owner)
    assert (await c.delete(f"/api/websites/{sid}", headers=owner)).status_code == 200
    assert (await c.get("/api/public/website")).json()["kind"] == "classic"


async def test_config_is_checked(env):
    c, _, owner, _ = env
    bad_configs = [
        "nope",
        {"sections": [{"id": "a", "type": "hero", "variant": "split"}, {"id": "a", "type": "faq", "variant": "x"}]},
        {"sections": [{"id": "Bad Id", "type": "hero", "variant": "split"}]},
        {"sections": [{"id": "a", "type": "hero", "variant": "split", "content": {"img": "data:image/png;base64,xx"}}]},
        {"sections": [{"id": "a", "type": "hero", "variant": "split", "content": {"t": "x" * 2001}}]},
        {"sections": [{"id": "a", "type": "hero", "variant": "split", "content": {"items": [{"a": [1]}]}}]},
        {"theme": {"palette": {"x": 1}}},
    ]
    for cfg in bad_configs:
        r = await c.post("/api/websites", headers=owner, json={"name": "X", "config": cfg})
        assert r.status_code == 400, cfg
    assert (await c.post("/api/websites", headers=owner, json={"name": " ", "config": CONFIG})).status_code == 400


async def test_site_images_upload_and_serve(env):
    c, _, owner, staff = env
    buf = io.BytesIO()
    Image.new("RGB", (3000, 1500), (10, 120, 90)).save(buf, format="JPEG")
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    assert (await c.post("/api/websites/images", headers=staff, json={"image": uri})).status_code == 403
    assert (await c.post("/api/websites/images", headers=owner, json={"image": "data:image/png;base64,xx"})).status_code == 400
    r = await c.post("/api/websites/images", headers=owner, json={"image": uri})
    assert r.status_code == 200, r.text
    img = await c.get(r.json()["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(img.content)).size == (1800, 900)
