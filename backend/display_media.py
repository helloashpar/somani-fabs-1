"""Shop setup > Display screen: what the shop screen shows when no try-on is on
it ("idle screen").

Up to MAX_SLIDES photos and videos, played one after another in a loop:
photos for their chosen number of seconds, videos to their end (a single
video loops by itself). The files are kept in the database in 1 MB pieces
(`display_chunks`), so videos fit under MongoDB's 16 MB document limit and
survive redeploys, and are served with byte ranges so browsers can stream
and loop videos.

The list itself is `settings.display_slides` = [{id, kind, seconds}].
"""
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image

import permissions

MAX_SLIDES = 5
CHUNK = 1024 * 1024
IMAGE_MAX = 10 * 1024 * 1024
VIDEO_MAX = 50 * 1024 * 1024  # nginx allows 60 MB requests
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
SECONDS = (3, 60)
DEFAULT_SECONDS = 8
PENDING = timedelta(hours=6)  # uploaded but not saved yet: kept this long

_db: Callable = lambda: None  # noqa: E731
_auth: Optional[Callable] = None
_log: Optional[Callable] = None

router = APIRouter(prefix="/api/display")


def init(get_db, auth_dependency, log_action):
    global _db, _auth, _log
    _db, _auth, _log = get_db, auth_dependency, log_action


async def current_user(request: Request):
    return await _auth(request)


def _now():
    return datetime.now(timezone.utc)


def media_url(mid: str) -> str:
    return f"/api/display/media/{mid}"


def _sniff(head: bytes, mime: str) -> str:
    """The real kind of a file from its first bytes ("image" / "video" / "")."""
    if mime in VIDEO_TYPES:
        if head[4:8] == b"ftyp" or head[:4] == b"\x1a\x45\xdf\xa3":
            return "video"
        return ""
    if mime in IMAGE_TYPES:
        try:
            Image.open(io.BytesIO(head)).verify()
            return "image"
        except Exception:  # noqa: BLE001 - not an image we can show
            return ""
    return ""


async def _store(data: bytes, mime: str, kind: str) -> Dict[str, Any]:
    db = _db()
    mid = uuid.uuid4().hex
    pieces = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)] or [b""]
    for n, piece in enumerate(pieces):
        await db.display_chunks.insert_one({"media_id": mid, "n": n, "data": piece})
    doc = {"id": mid, "kind": kind, "mime": mime, "size": len(data), "chunks": len(pieces), "created_at": _now().isoformat()}
    await db.display_media.insert_one(dict(doc))
    return doc


async def _delete(mid: str):
    db = _db()
    await db.display_chunks.delete_many({"media_id": mid})
    await db.display_media.delete_one({"id": mid})


def _public(doc: Dict[str, Any], seconds: int = DEFAULT_SECONDS) -> Dict[str, Any]:
    return {"id": doc["id"], "kind": doc["kind"], "seconds": seconds, "url": media_url(doc["id"])}


async def slides() -> List[Dict[str, Any]]:
    """The idle screen's photos and videos, in order, ready to show."""
    s = await _db().settings.find_one({"id": "global"}, {"_id": 0, "display_slides": 1}) or {}
    return [{**x, "url": media_url(x["id"])} for x in (s.get("display_slides") or [])]


# ---------- Admin ----------
@router.post("/media")
async def upload_media(file: UploadFile = File(...), user=Depends(current_user)):
    permissions.require(user, "settings_manage")
    mime = (file.content_type or "").lower()
    if mime not in IMAGE_TYPES | VIDEO_TYPES:
        raise HTTPException(400, "Choose a photo (JPG, PNG, WebP, GIF) or a video (MP4, WebM, MOV)")
    limit = VIDEO_MAX if mime in VIDEO_TYPES else IMAGE_MAX
    buf = bytearray()
    while True:
        piece = await file.read(CHUNK)
        if not piece:
            break
        buf.extend(piece)
        if len(buf) > limit:
            raise HTTPException(400, f"File is too large (max {limit // (1024 * 1024)} MB)")
    data = bytes(buf)
    kind = _sniff(data if mime in IMAGE_TYPES else data[:16], mime)
    if not kind:
        raise HTTPException(400, "This file can't be shown. Choose a different photo or video.")
    doc = await _store(data, mime, kind)
    return _public(doc)


@router.get("/slides")
async def get_slides(user=Depends(current_user)):
    permissions.require(user, "settings_manage")
    return {"slides": await slides(), "max": MAX_SLIDES}


@router.put("/slides")
async def set_slides(body: Dict[str, Any], user=Depends(current_user)):
    permissions.require(user, "settings_manage")
    items = body.get("slides")
    if not isinstance(items, list) or len(items) > MAX_SLIDES:
        raise HTTPException(400, f"Up to {MAX_SLIDES} photos and videos")
    db = _db()
    out, seen = [], set()
    for it in items:
        mid = str((it or {}).get("id") or "")
        if mid in seen:
            raise HTTPException(400, "The same file is in the list twice")
        doc = await db.display_media.find_one({"id": mid}, {"_id": 0})
        if not doc:
            raise HTTPException(400, "A photo or video is missing. Add it again.")
        try:
            sec = int((it or {}).get("seconds") or DEFAULT_SECONDS)
        except (TypeError, ValueError):
            sec = DEFAULT_SECONDS
        seen.add(mid)
        out.append({"id": mid, "kind": doc["kind"], "seconds": max(SECONDS[0], min(SECONDS[1], sec))})
    await db.settings.update_one({"id": "global"}, {"$set": {"display_slides": out, "idle_image": ""}}, upsert=True)
    # Files no longer used (and uploads never saved, after a while) are removed.
    cutoff = (_now() - PENDING).isoformat()
    async for m in db.display_media.find({"id": {"$nin": list(seen)}}, {"_id": 0, "id": 1, "created_at": 1}):
        if m.get("created_at", "") < cutoff or m["id"] in (body.get("removed") or []):
            await _delete(m["id"])
    await _log(user, "update_settings", f"display_slides={len(out)}")
    return {"slides": await slides(), "max": MAX_SLIDES}


# ---------- Public (the shop screen has no sign-in) ----------
_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


@router.get("/media/{mid}")
async def get_media(mid: str, request: Request):
    db = _db()
    doc = await db.display_media.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    size = doc["size"]
    start, end, status = 0, max(size - 1, 0), 200
    m = _RANGE.match(request.headers.get("range", "").strip())
    if m and size:
        a, b = m.groups()
        if a:
            start, end = int(a), min(int(b), size - 1) if b else size - 1
        elif b:  # last N bytes
            start, end = max(size - int(b), 0), size - 1
        if start > end or start >= size:
            raise HTTPException(416, "Range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
        status = 206

    async def body():
        cursor = db.display_chunks.find({"media_id": mid, "n": {"$gte": start // CHUNK, "$lte": end // CHUNK}}).sort("n", 1)
        async for c in cursor:
            data = bytes(c["data"])
            first = c["n"] * CHUNK
            yield data[max(start - first, 0):min(end - first + 1, len(data))]

    headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1 if size else 0),
               "Cache-Control": "public, max-age=31536000, immutable"}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(body(), status_code=status, media_type=doc["mime"], headers=headers)


# ---------- Start-up ----------
async def migrate(db):
    """An idle image saved by older versions (a data URI in settings) becomes
    the first slide."""
    import base64
    await db.display_chunks.create_index([("media_id", 1), ("n", 1)])
    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "idle_image": 1, "display_slides": 1}) or {}
    idle = s.get("idle_image") or ""
    if not idle or s.get("display_slides"):
        return
    m = re.match(r"data:(image/[\w.+-]+);base64,(.+)$", idle, re.S)
    if not m:
        return
    mime = m.group(1).lower()
    doc = await _store(base64.b64decode(m.group(2)), mime if mime in IMAGE_TYPES else "image/jpeg", "image")
    await db.settings.update_one({"id": "global"}, {"$set": {
        "display_slides": [{"id": doc["id"], "kind": "image", "seconds": DEFAULT_SECONDS}], "idle_image": ""}})
