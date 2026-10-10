"""Shop setup > Website: the shop's public one-page websites.

A shop keeps up to MAX_SITES websites and picks one to show on its address
(the "live" one); the others are drafts it can edit, preview and switch to at
any time.

Two kinds:
- classic: the shop's original hand-made landing page (pages/Landing.js). It is
  locked: it cannot be edited, duplicated into the builder or deleted.
- builder: made with the website builder. Its `config` is plain data (theme
  tokens + an ordered list of sections, each with a layout variant and its
  text and images) drawn by the frontend's design system (frontend/src/site).
  Nothing is generated per visit or per edit, so every change costs the same:
  nothing.

The shop's facts (name, logo, address, hours, phones, links) are never stored
in a website: sections read them from Shop setup > General when drawn.

Every save keeps the previous version (up to HISTORY), so an owner can go back.
"""
import asyncio
import base64
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from PIL import Image, ImageOps

import permissions

MAX_SITES = 3
HISTORY = 15
CLASSIC_ID = "classic"
CONFIG_MAX_BYTES = 250_000
IMAGE_MAX_UPLOAD = 14_000_000  # chars of data URI (~10 MB image)
IMAGE_PX = 1800
MAX_IMAGES = 300

_SLUG = re.compile(r"[a-z][a-z0-9_-]{0,39}$")
_KEY = re.compile(r"[a-z][a-z0-9_]{0,39}$")

# Set by server.py (avoids a circular import). `_db` is a function so tests
# that swap server.db are followed.
_db: Callable = lambda: None  # noqa: E731
_auth: Optional[Callable] = None
_log: Optional[Callable] = None

router = APIRouter(prefix="/api/websites")
public_router = APIRouter(prefix="/api/public")


def init(get_db, auth_dependency, log_action):
    global _db, _auth, _log
    _db, _auth, _log = get_db, auth_dependency, log_action


async def current_user(request: Request):
    return await _auth(request)


def _require(user):
    permissions.require(user, "settings_manage")


def iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Validation ----------
def _bad(why: str):
    raise HTTPException(400, why)


def _text(v: Any, limit: int, what: str) -> str:
    if v is None:
        return ""
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        _bad(f"{what}: must be text")
    s = str(v)
    if len(s) > limit:
        _bad(f"{what}: at most {limit} characters")
    if s.startswith("data:"):
        _bad(f"{what}: upload images first")
    return s


def _value(v: Any, what: str, depth: int = 0) -> Any:
    """Section content: text, yes/no, numbers, or lists of small objects."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v
    if isinstance(v, str) or v is None:
        return _text(v, 2000, what)
    if isinstance(v, list) and depth == 0:
        if len(v) > 24:
            _bad(f"{what}: at most 24 items")
        out = []
        for i, item in enumerate(v):
            if isinstance(item, dict):
                out.append({_key(k, what): _value(x, f"{what} {i + 1}", 1) for k, x in item.items()})
            else:
                out.append(_value(item, f"{what} {i + 1}", 1))
        return out
    _bad(f"{what}: not valid")


def _key(k: str, what: str) -> str:
    if not isinstance(k, str) or not _KEY.match(k):
        _bad(f"{what}: bad field name")
    return k


def clean_config(cfg: Any) -> Dict[str, Any]:
    """Shape and size checks. Which section types, variants and theme values
    exist is the frontend's design system's business; unknown ones are
    skipped when drawn, so they can never break a page."""
    if not isinstance(cfg, dict):
        _bad("Website: not valid")
    theme = cfg.get("theme") or {}
    settings = cfg.get("settings") or {}
    sections = cfg.get("sections") or []
    if not isinstance(theme, dict) or not isinstance(settings, dict) or not isinstance(sections, list):
        _bad("Website: not valid")
    if len(sections) > 40:
        _bad("A website can have at most 40 sections")
    out_sections, ids = [], set()
    for i, s in enumerate(sections):
        if not isinstance(s, dict):
            _bad("Section: not valid")
        sid = _text(s.get("id"), 40, "Section id")
        typ = _text(s.get("type"), 40, "Section type")
        var = _text(s.get("variant"), 40, "Section layout")
        if not (_SLUG.match(sid) and _SLUG.match(typ) and _SLUG.match(var)) or sid in ids:
            _bad(f"Section {i + 1}: not valid")
        ids.add(sid)
        content = s.get("content") or {}
        style = s.get("style") or {}
        if not isinstance(content, dict) or not isinstance(style, dict):
            _bad(f"Section {i + 1}: not valid")
        out_sections.append({
            "id": sid, "type": typ, "variant": var, "hidden": bool(s.get("hidden")),
            "content": {_key(k, "Section"): _value(v, k.replace("_", " ")) for k, v in content.items()},
            "style": {_key(k, "Style"): _text(v, 40, "Style") for k, v in style.items()},
        })
    out = {
        "theme": {_key(k, "Theme"): _text(v, 60, "Theme") for k, v in theme.items()},
        "settings": {_key(k, "Setting"): _value(v, k.replace("_", " "), 1) for k, v in settings.items()},
        "sections": out_sections,
    }
    if len(json.dumps(out, ensure_ascii=False).encode()) > CONFIG_MAX_BYTES:
        _bad("This website is too large. Remove some sections or items.")
    return out


def _name(v: Any) -> str:
    name = " ".join(str(v or "").split())
    if not name:
        _bad("Give the website a name")
    if len(name) > 40:
        _bad("Website name: at most 40 characters")
    return name


# ---------- Storage ----------
def _summary(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: doc.get(k) for k in ("id", "name", "kind", "locked", "config", "created_at", "updated_at",
                                    "updated_by", "origin")} | {"versions": len(doc.get("history") or [])}


async def _settings() -> Dict[str, Any]:
    return await _db().settings.find_one({"id": "global"}, {"_id": 0, "live_website_id": 1}) or {}


async def live_id() -> str:
    """The live site's id: the chosen one if it still exists, else the
    classic site, else the oldest."""
    db = _db()
    chosen = (await _settings()).get("live_website_id")
    if chosen and await db.websites.find_one({"id": chosen}, {"_id": 1}):
        return chosen
    if await db.websites.find_one({"id": CLASSIC_ID}, {"_id": 1}):
        return CLASSIC_ID
    first = await db.websites.find({}, {"_id": 0, "id": 1}).sort("created_at", 1).to_list(1)
    return first[0]["id"] if first else ""


async def _get(site_id: str) -> Dict[str, Any]:
    doc = await _db().websites.find_one({"id": site_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Website not found")
    return doc


def _editable(doc: Dict[str, Any]):
    if doc.get("locked") or doc.get("kind") != "builder":
        raise HTTPException(403, "This website is locked and cannot be changed")


async def ensure_seed(db):
    """The shop's original landing page becomes its classic, live website."""
    if await db.websites.count_documents({}) == 0:
        await db.websites.insert_one({
            "id": CLASSIC_ID, "name": "Classic website", "kind": "classic", "locked": True,
            "config": None, "history": [], "created_at": iso(), "updated_at": iso(), "updated_by": "system"})
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "live_website_id": 1}) or {}
    if not s.get("live_website_id"):
        await db.settings.update_one({"id": "global"}, {"$set": {"live_website_id": CLASSIC_ID}}, upsert=True)
    await db.websites.create_index("id", unique=True)


# ---------- Admin ----------
@router.get("")
async def list_sites(user=Depends(current_user)):
    _require(user)
    docs = await _db().websites.find({}, {"_id": 0}).sort("created_at", 1).to_list(MAX_SITES + 5)
    return {"sites": [_summary(d) for d in docs], "live_id": await live_id(), "limit": MAX_SITES}


@router.post("")
async def create_site(body: Dict[str, Any], user=Depends(current_user)):
    _require(user)
    db = _db()
    if await db.websites.count_documents({}) >= MAX_SITES:
        _bad(f"You can keep up to {MAX_SITES} websites. Delete one to make a new one.")
    doc = {"id": uuid.uuid4().hex[:12], "name": _name(body.get("name")), "kind": "builder", "locked": False,
           "config": clean_config(body.get("config")), "history": [],
           "origin": _text(body.get("origin"), 40, "Origin"),
           "created_at": iso(), "updated_at": iso(), "updated_by": user["name"]}
    await db.websites.insert_one(dict(doc))
    await _log(user, "website_create", doc["name"])
    return _summary(doc)


@router.get("/{site_id}")
async def get_site(site_id: str, user=Depends(current_user)):
    _require(user)
    return _summary(await _get(site_id))


@router.put("/{site_id}")
async def update_site(site_id: str, body: Dict[str, Any], user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    _editable(doc)
    upd: Dict[str, Any] = {"updated_at": iso(), "updated_by": user["name"]}
    if "name" in body:
        upd["name"] = _name(body["name"])
    change: Dict[str, Any] = {"$set": upd}
    if "config" in body:
        cfg = clean_config(body["config"])
        if cfg != doc.get("config"):
            upd["config"] = cfg
            change["$push"] = {"history": {"$each": [{"at": doc["updated_at"], "by": doc.get("updated_by", ""),
                                                      "config": doc.get("config")}],
                                           "$slice": -HISTORY}}
    await _db().websites.update_one({"id": site_id}, change)
    return _summary(await _get(site_id))


@router.get("/{site_id}/history")
async def site_history(site_id: str, user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    items = doc.get("history") or []
    return [{"index": i, "at": h.get("at"), "by": h.get("by"), "sections": len((h.get("config") or {}).get("sections") or [])}
            for i, h in reversed(list(enumerate(items)))]


@router.post("/{site_id}/restore/{index}")
async def restore_version(site_id: str, index: int, user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    _editable(doc)
    items = doc.get("history") or []
    if not 0 <= index < len(items):
        raise HTTPException(404, "That version is no longer kept")
    return await update_site(site_id, {"config": items[index]["config"]}, user)


@router.post("/{site_id}/duplicate")
async def duplicate_site(site_id: str, user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    _editable(doc)
    name = f"{doc['name']} copy"[:40]
    return await create_site({"name": name, "config": doc["config"], "origin": "copy"}, user)


@router.post("/{site_id}/publish")
async def publish_site(site_id: str, user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    await _db().settings.update_one({"id": "global"}, {"$set": {"live_website_id": site_id}}, upsert=True)
    await _log(user, "website_publish", doc["name"])
    return {"live_id": site_id}


@router.delete("/{site_id}")
async def delete_site(site_id: str, user=Depends(current_user)):
    _require(user)
    doc = await _get(site_id)
    if doc.get("locked"):
        raise HTTPException(403, "This website is locked and cannot be deleted")
    if await live_id() == site_id:
        _bad("This website is live. Make another one live first.")
    await _db().websites.delete_one({"id": site_id})
    await _log(user, "website_delete", doc["name"])
    return {"ok": True}


def _site_image(data_uri: str) -> Tuple[bytes, str]:
    """A photo for a website, at most IMAGE_PX on the long side. Photos become
    JPEG; images with transparency stay PNG."""
    if not (isinstance(data_uri, str) and data_uri.startswith("data:image/")) or len(data_uri) > IMAGE_MAX_UPLOAD:
        _bad("Choose a PNG, JPEG or WebP image under 10 MB")
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(data_uri.split(",", 1)[1]))))
    except Exception:
        _bad("That image could not be read. Try a PNG or JPEG.")
    img.thumbnail((IMAGE_PX, IMAGE_PX), Image.LANCZOS)
    buf = io.BytesIO()
    alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if alpha:
        img.convert("RGBA").save(buf, format="PNG", optimize=True)
        return buf.getvalue(), "image/png"
    img.convert("RGB").save(buf, format="JPEG", quality=84, optimize=True, progressive=True)
    return buf.getvalue(), "image/jpeg"


@router.post("/images")
async def upload_image(body: Dict[str, Any], user=Depends(current_user)):
    _require(user)
    db = _db()
    if await db.site_images.count_documents({}) >= MAX_IMAGES:
        _bad("Image limit reached")
    raw, mime = await asyncio.to_thread(_site_image, body.get("image"))
    iid = uuid.uuid4().hex
    await db.site_images.insert_one({"id": iid, "mime": mime, "data": base64.b64encode(raw).decode(),
                                     "created_at": iso(), "by": user["name"]})
    return {"url": f"/api/public/site-images/{iid}"}


# ---------- Public ----------
@public_router.get("/website")
async def public_website():
    """The live website: what the shop's address shows. No sign-in needed."""
    sid = await live_id()
    doc = await _db().websites.find_one({"id": sid}, {"_id": 0, "history": 0}) if sid else None
    if not doc:
        return {"id": "", "kind": "classic", "config": None}
    return {"id": doc["id"], "kind": doc["kind"], "config": doc.get("config")}


@public_router.get("/site-images/{iid}")
async def site_image(iid: str):
    doc = await _db().site_images.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No image")
    # Image ids never change content, so browsers may keep them for a year.
    return Response(content=base64.b64decode(doc["data"]), media_type=doc["mime"],
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
