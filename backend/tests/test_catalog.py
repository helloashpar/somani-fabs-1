"""Tests for the fabric catalog and picking catalog fabrics in a try-on.
The database is an in-memory mongomock and OpenAI is never called.

Run:  python -m pytest tests/test_catalog.py -n 0
"""
import asyncio
import base64
import io
import os

for k, v in {"MONGO_URL": "mongodb://127.0.0.1:1", "DB_NAME": "test", "JWT_SECRET": "x",
             "SUPER_ADMIN_PASSWORD": "pw"}.items():
    os.environ.setdefault(k, v)

import httpx
import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

import server

SUPER = {"id": "u1", "name": "su", "role": "super"}
STAFF = {"id": "u2", "name": "staff", "role": "admin"}
TOP = {}  # {"category_id": <Top Wear id>}, set per test


def jpeg_uri(w=1200, h=900, color=(30, 60, 120)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest_asyncio.fixture
async def ctx(monkeypatch):
    db = AsyncMongoMockClient()["catalog_test"]
    monkeypatch.setattr(server, "db", db)
    await db.catalog.create_index("name_key", unique=True)
    # The real seed: old-style categories, then the migration to single/group.
    for cat in server.DEFAULT_CATEGORIES:
        await db.categories.insert_one({"id": server.new_id(), **cat})
    await server._migrate_category_kinds()
    TOP["category_id"] = (await db.categories.find_one({"label": "Top Wear"}))["id"]
    state = {"user": SUPER, "generated": []}
    server.app.dependency_overrides[server.get_current_user] = lambda: state["user"]

    async def fake_run(tid, photo, garments):
        state["generated"].append(garments)
    monkeypatch.setattr(server, "_run_generation", fake_run)
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t/api") as c:
        yield c, db, state
    server.app.dependency_overrides.clear()


async def test_add_list_and_thumb(ctx):
    c, db, _ = ctx
    r = await c.post("/catalog", json={**TOP, "name": "  Royal  Blue Linen ", "code": "sf-102",
                                       "image": jpeg_uri()})
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["name"] == "Royal Blue Linen" and item["code"] == "SF-102"
    assert "image" not in item and "thumb" not in item

    listed = (await c.get("/catalog")).json()
    assert [x["name"] for x in listed] == ["Royal Blue Linen"]
    assert "image" not in listed[0] and "thumb" not in listed[0]

    stored = await db.catalog.find_one({"id": item["id"]})
    img = Image.open(io.BytesIO(base64.b64decode(stored["image"].split(",", 1)[1])))
    assert img.size == (800, 800)  # square-cropped

    t = await c.get(f"/catalog/{item['id']}/thumb")
    assert t.status_code == 200 and t.headers["content-type"] == "image/jpeg"
    assert "immutable" in t.headers["cache-control"]
    assert max(Image.open(io.BytesIO(t.content)).size) == 160
    assert len(t.content) < 10_000


async def test_name_required_unique_and_code_unique(ctx):
    c, _, _ = ctx
    assert (await c.post("/catalog", json={**TOP, "name": " ", "image": jpeg_uri()})).status_code == 400
    assert (await c.post("/catalog", json={**TOP, "name": "Linen"})).status_code == 400  # no photo
    assert (await c.post("/catalog", json={**TOP, "name": "Linen", "code": "A1", "image": jpeg_uri()})).status_code == 200
    r = await c.post("/catalog", json={**TOP, "name": "LINEN", "image": jpeg_uri()})
    assert r.status_code == 400 and "already exists" in r.json()["detail"]
    r = await c.post("/catalog", json={**TOP, "name": "Cotton", "code": "a-1", "image": jpeg_uri()})
    assert r.status_code == 400 and "A-1" in r.json()["detail"]
    # Optional code: many fabrics may have none.
    assert (await c.post("/catalog", json={**TOP, "name": "Cotton", "image": jpeg_uri()})).status_code == 200
    assert (await c.post("/catalog", json={**TOP, "name": "Silk", "image": jpeg_uri()})).status_code == 200


async def test_edit_keeps_photo_and_checks_names(ctx):
    c, db, _ = ctx
    a = (await c.post("/catalog", json={**TOP, "name": "A", "image": jpeg_uri()})).json()
    await c.post("/catalog", json={**TOP, "name": "B", "image": jpeg_uri()})
    before = (await db.catalog.find_one({"id": a["id"]}))["image"]
    r = await c.put(f"/catalog/{a['id']}", json={**TOP, "name": "A", "description": "soft weave"})
    assert r.status_code == 200 and r.json()["description"] == "soft weave"
    assert (await db.catalog.find_one({"id": a["id"]}))["image"] == before
    assert (await c.put(f"/catalog/{a['id']}", json={**TOP, "name": "b"})).status_code == 400


async def test_only_super_admin_manages(ctx):
    c, _, state = ctx
    item = (await c.post("/catalog", json={**TOP, "name": "A", "image": jpeg_uri()})).json()
    state["user"] = STAFF
    assert (await c.post("/catalog", json={**TOP, "name": "B", "image": jpeg_uri()})).status_code == 403
    assert (await c.delete(f"/catalog/{item['id']}")).status_code == 403
    assert len((await c.get("/catalog")).json()) == 1  # staff can still search


async def test_generate_with_catalog_fabric(ctx):
    c, db, state = ctx
    await db.sessions.insert_one({"id": "s1", "status": "active", "photo": jpeg_uri(300, 400)})
    await db.categories.update_one({"label": "Top Wear"}, {"$set": {
        "items": [{"label": "Kurta", "description": "long kurta"}]}})
    item = (await c.post("/catalog", json={**TOP, "name": "Royal Linen", "code": "SF1", "image": jpeg_uri()})).json()
    r = await c.post("/sessions/s1/trials/generate", json={"garments": [
        {"slot": "top", "garment_type": "Kurta", "catalog_id": item["id"]},
        {"slot": "bottom", "garment_type": "Pyjama", "fabric_b64": jpeg_uri(200, 200)}]})
    assert r.status_code == 200, r.text
    trial = r.json()
    assert trial["type"] == "Royal Linen (SF1) + Pyjama"
    assert len(trial["fabric_thumb"]) < 20_000  # a thumbnail, not the full swatch
    await asyncio.sleep(0.05)  # generation runs as a background task
    sent = state["generated"][0]
    assert sent[0]["description"] == "long kurta"
    assert sent[0]["fabric_b64"] == (await db.catalog.find_one({"id": item["id"]}))["image"]
    assert sent[1]["description"]  # default description for Pyjama

    r = await c.post("/sessions/s1/trials/generate", json={"garments": [
        {"slot": "top", "garment_type": "Kurta", "catalog_id": "missing"}]})
    assert r.status_code == 400


async def cats_by_label(c):
    return {x["label"]: x for x in (await c.get("/config/categories")).json()}


async def test_seed_migrates_to_categories_and_groups(ctx):
    c, _, _ = ctx
    cats = await cats_by_label(c)
    top, bottom, layer = cats["Top Wear"], cats["Bottom Wear"], cats["Layer Wear"]
    assert (top["kind"], top["position"], bottom["position"], layer["position"]) == ("single", "top", "bottom", "third")
    assert {i["label"] for i in layer["items"]} == {"Suit Jacket", "Koti / Nehru Jacket"}
    two, three = cats["Top + Bottom"], cats["Top + Bottom + 3rd"]
    assert two["kind"] == "group" and two["members"] == [top["id"], bottom["id"]] and two["items"] == []
    assert three["members"] == [top["id"], bottom["id"], layer["id"]]
    assert three["slots"] == ["top", "bottom", "third"]


async def test_category_and_group_rules(ctx):
    c, _, _ = ctx
    cats = await cats_by_label(c)
    top, bottom = cats["Top Wear"]["id"], cats["Bottom Wear"]["id"]
    # Names are unique.
    r = await c.post("/config/categories", json={"label": "top wear", "position": "top"})
    assert r.status_code == 400 and "already exists" in r.json()["detail"]
    # One category per body part inside a group.
    shirts = (await c.post("/config/categories", json={"label": "Shirts", "position": "top",
                                                      "items": [{"label": "Linen Shirt"}]})).json()
    r = await c.post("/config/categories", json={"label": "Odd", "kind": "group", "members": [top, shirts["id"]]})
    assert r.status_code == 400 and "upper body" in r.json()["detail"]
    # Groups hold single categories only; an empty group may be filled later.
    grp = (await c.post("/config/categories", json={"label": "Shirt + Pant", "kind": "group"})).json()
    assert grp["members"] == [] and grp["slots"] == []
    r = await c.put(f"/config/categories/{grp['id']}", json={"label": "Shirt + Pant", "kind": "group",
                                                           "members": [shirts["id"], bottom]})
    assert r.status_code == 200
    r = await c.post("/config/categories", json={"label": "Nested", "kind": "group", "members": [grp["id"]]})
    assert r.status_code == 400
    # Moving Shirts to the lower body would clash with Bottom Wear in the group.
    r = await c.put(f"/config/categories/{shirts['id']}", json={"label": "Shirts", "position": "bottom"})
    assert r.status_code == 400
    # Kind is fixed after creation.
    r = await c.put(f"/config/categories/{shirts['id']}", json={"label": "Shirts", "kind": "group"})
    assert r.status_code == 400
    # A category used by a group or a fabric cannot be deleted.
    r = await c.delete(f"/config/categories/{shirts['id']}")
    assert r.status_code == 400 and "Shirt + Pant" in r.json()["detail"]
    await c.put(f"/config/categories/{grp['id']}", json={"label": "Shirt + Pant", "kind": "group", "members": [bottom]})
    await c.post("/catalog", json={"name": "Linen", "category_id": shirts["id"], "image": jpeg_uri()})
    r = await c.delete(f"/config/categories/{shirts['id']}")
    assert r.status_code == 400 and "fabric" in r.json()["detail"]


async def test_fabric_category_and_style_must_exist(ctx):
    c, _, _ = ctx
    cats = await cats_by_label(c)
    r = await c.post("/catalog", json={"name": "A", "image": jpeg_uri()})
    assert r.status_code == 400  # no category
    r = await c.post("/catalog", json={"name": "A", "category_id": cats["Top + Bottom"]["id"], "image": jpeg_uri()})
    assert r.status_code == 400  # groups are not fabric categories
    r = await c.post("/catalog", json={**TOP, "name": "A", "garment_type": "Trousers", "image": jpeg_uri()})
    assert r.status_code == 400 and "not a style" in r.json()["detail"]
    r = await c.post("/catalog", json={**TOP, "name": "A", "garment_type": "kurta", "image": jpeg_uri()})
    assert r.status_code == 200 and r.json()["garment_type"] == "Kurta" and r.json()["category"] == "Top Wear"
    # The list follows category renames.
    top = cats["Top Wear"]
    await c.put(f"/config/categories/{top['id']}", json={**top, "label": "Uppers"})
    assert (await c.get("/catalog")).json()[0]["category"] == "Uppers"
