"""Shop setup > Display screen: idle-screen photos and videos.
In-memory database, no network.

Run:  python -m pytest tests/test_display_media.py -n 0
"""
import base64
import io

import httpx
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from PIL import Image

import display_media
import permissions
import server


async def add_admin(db, name, role, mobile):
    doc = {"id": f"id-{name}", "name": name, "mobile": mobile, "role": role, "active": True,
           "password_hash": server.hash_pw("password123"), "created_at": server.iso(),
           "permissions": {} if role == "super" else permissions.staff_defaults()}
    await db.admins.insert_one(doc)
    return {"Authorization": "Bearer " + server.make_token(doc)}


def png(color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), color).save(buf, format="PNG")
    return buf.getvalue()


# A tiny "video": an MP4 header followed by filler, bigger than one stored piece.
VIDEO = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * (5000)


@pytest_asyncio.fixture
async def env(monkeypatch):
    db = AsyncMongoMockClient()["display_test"]
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(display_media, "CHUNK", 1000)
    await db.settings.insert_one({"id": "global", "display_secret": "sec", "idle_image": ""})
    owner = await add_admin(db, "owner", "super", server.OWNER_MOBILE)
    staff = await add_admin(db, "ravi", "admin", "9800000001")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://t") as c:
        yield c, db, owner, staff


async def up(c, headers, name, data, mime):
    return await c.post("/api/display/media", headers=headers, files={"file": (name, data, mime)})


async def test_upload_check_and_save_slides(env):
    c, db, owner, staff = env
    assert (await up(c, staff, "a.png", png(), "image/png")).status_code == 403
    assert (await up(c, owner, "a.txt", b"hello", "text/plain")).status_code == 400
    assert (await up(c, owner, "fake.png", b"not an image at all", "image/png")).status_code == 400
    assert (await up(c, owner, "fake.mp4", b"x" * 100, "video/mp4")).status_code == 400

    img = (await up(c, owner, "a.png", png(), "image/png")).json()
    vid = (await up(c, owner, "v.mp4", VIDEO, "video/mp4")).json()
    assert img["kind"] == "image" and vid["kind"] == "video"
    assert await db.display_chunks.count_documents({"media_id": vid["id"]}) == -(-len(VIDEO) // 1000)

    r = await c.put("/api/display/slides", headers=owner, json={"slides": [{"id": vid["id"]}, {"id": img["id"], "seconds": 999}]})
    assert r.status_code == 200, r.text
    assert [(x["kind"], x["seconds"]) for x in r.json()["slides"]] == [("video", 8), ("image", 60)]
    too_many = [{"id": img["id"]}] * 6
    assert (await c.put("/api/display/slides", headers=owner, json={"slides": too_many})).status_code == 400
    assert (await c.put("/api/display/slides", headers=owner, json={"slides": [{"id": "nope"}]})).status_code == 400

    # The shop screen gets them, and its version changes with them.
    st = (await c.get("/api/display/sec/state")).json()
    assert [x["id"] for x in st["slides"]] == [vid["id"], img["id"]]
    v1 = st["version"]
    await c.put("/api/display/slides", headers=owner, json={"slides": [{"id": img["id"]}], "removed": [vid["id"]]})
    st2 = (await c.get("/api/display/sec/state", params={"v": v1})).json()
    assert st2.get("unchanged") is not True and len(st2["slides"]) == 1
    # A removed file is deleted with its pieces.
    assert await db.display_media.count_documents({"id": vid["id"]}) == 0
    assert await db.display_chunks.count_documents({"media_id": vid["id"]}) == 0


async def test_media_served_whole_and_in_ranges(env):
    c, _, owner, _ = env
    vid = (await up(c, owner, "v.mp4", VIDEO, "video/mp4")).json()
    whole = await c.get(vid["url"])
    assert whole.status_code == 200 and whole.content == VIDEO and whole.headers["accept-ranges"] == "bytes"
    part = await c.get(vid["url"], headers={"Range": "bytes=990-2010"})
    assert part.status_code == 206 and part.content == VIDEO[990:2011]
    assert part.headers["content-range"] == f"bytes 990-2010/{len(VIDEO)}"
    tail = await c.get(vid["url"], headers={"Range": "bytes=-50"})
    assert tail.content == VIDEO[-50:]
    assert (await c.get(vid["url"], headers={"Range": f"bytes={len(VIDEO) + 5}-"})).status_code == 416
    assert (await c.get("/api/display/media/nope")).status_code == 404


async def test_old_idle_image_becomes_first_slide(env):
    c, db, owner, _ = env
    uri = "data:image/png;base64," + base64.b64encode(png()).decode()
    await db.settings.update_one({"id": "global"}, {"$set": {"idle_image": uri}})
    await display_media.migrate(db)
    s = await db.settings.find_one({"id": "global"})
    assert s["idle_image"] == "" and len(s["display_slides"]) == 1
    got = await c.get(display_media.media_url(s["display_slides"][0]["id"]))
    assert got.content == png()
    await display_media.migrate(db)  # runs every start: nothing more happens
    assert await db.display_media.count_documents({}) == 1
