"""The shop's own details: Shop setup > General.

Name, logo, contact details, address, story and website options. The public
site (header, hero, story, visit, footer), the admin app (wordmark, login,
browser tab), the shop screen and exports all read them from here, so a change
shows everywhere. Every field has a default (today's values), so an empty
field falls back instead of leaving a gap. `*_hi` fields are the Hindi version
shown on the public site; when empty the English one is used.
"""
import base64
import hashlib
import io
import re
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException
from PIL import Image, ImageOps

# key -> (default, max length). Text fields only; see LISTS / FLAGS below.
TEXT: Dict[str, Tuple[str, int]] = {
    # Identity
    "shop_name": ("Somani Fabs", 60),
    "shop_name_hi": ("सोमानी फेब्स", 60),
    "tagline": ("", 80),
    "tagline_hi": ("", 80),
    "legal_name": ("Shivnarayan Shivbhagwan Somani", 100),
    "legal_name_hi": ("शिवनारायण शिवभगवान सोमानी", 100),
    "founded_year": ("1962", 4),
    "accent_color": ("#880D1E", 7),
    # About
    "description": ("Suiting, shirting, kurta, dhoti and jacket fabric from 100+ brands, "
                    "including Raymond, Siyaram's, Donear and Ramraj.", 300),
    "description_hi": ("रेमंड, सियाराम्स, डोनियर और रामराज समेत 100+ ब्रांड का सूटिंग, शर्टिंग, "
                       "कुर्ता, धोती और जैकेट का कपड़ा।", 300),
    "brands_count": ("100+", 10),
    "founder": ("Shivnarayan Somani, founder", 100),
    "founder_hi": ("शिवनारायण सोमानी, संस्थापक", 100),
    "story_body": ("Shivnarayan Somani opened the shop in 1962. Today the family still serves every "
                   "customer the way he did: good cloth, an honest price and a promise we keep.", 600),
    "story_body_hi": ("शिवनारायण सोमानी जी ने 1962 में यह दुकान खोली। आज भी परिवार हर ग्राहक की सेवा "
                      "वैसे ही करता है: अच्छा कपड़ा, ईमानदार दाम और निभाया हुआ वादा।", 600),
    # Location
    "locality": ("Gol Pyau", 60),
    "locality_hi": ("गोल प्याऊ", 60),
    "city": ("Kuchaman City", 60),
    "city_hi": ("कुचामन सिटी", 60),
    "address_line1": ("Gol Pyau, opposite Maheshwari Bhawan", 120),
    "address_line1_hi": ("गोल प्याऊ, माहेश्वरी भवन के सामने", 120),
    "address_line2": ("Kuchaman City, Rajasthan 341508", 120),
    "address_line2_hi": ("कुचामन सिटी, राजस्थान 341508", 120),
    "directions_url": ("https://share.google/HySsDUkhfkwuHanY8", 300),
    "hours": ("", 100),
    "hours_hi": ("", 100),
    # Contact
    "whatsapp": ("", 20),
    "email": ("", 120),
    # Social
    "instagram": ("", 300),
    "facebook": ("", 300),
    "youtube": ("", 300),
    "website": ("", 300),
    # Website
    "footer_note": ("", 200),
    "footer_note_hi": ("", 200),
    "seo_description": ("Somani Fabs, Kuchaman City. Suiting, shirting, kurta-pyjama, dhoti and jacket "
                        "fabric from Raymond, Siyaram's, Donear and Ramraj since 1962.", 300),
}
LISTS: Dict[str, Tuple[List[str], int]] = {
    "phones": (["+91 94144 22558", "+91 74109 90092"], 4),
}
FLAGS: Dict[str, bool] = {
    "show_staff_login": True,
    "show_brands": True,
    "show_promise": True,
}

URL_FIELDS = ("directions_url", "instagram", "facebook", "youtube", "website")
# Fields that may not be left empty: the defaults are used instead of a gap.
REQUIRED = ("shop_name",)

LOGO_PX = 512
LOGO_MAX_UPLOAD = 8_000_000  # chars of data URI (~6 MB image)


def _bad(field: str, why: str):
    raise HTTPException(400, f"{field.replace('_', ' ').capitalize()}: {why}")


def _phone(value: str) -> str:
    v = " ".join(str(value or "").split())
    digits = re.sub(r"\D", "", v)
    if not 6 <= len(digits) <= 15 or re.search(r"[^\d+\-() ]", v):
        _bad("phone", f'"{v}" is not a phone number')
    return v


def clean(body: Dict[str, Any]) -> Dict[str, Any]:
    """Validated fields present in `body` (settings in the General form)."""
    out: Dict[str, Any] = {}
    for key, (_, limit) in TEXT.items():
        if key not in body:
            continue
        v = " ".join(str(body[key] or "").split()) if key not in ("story_body", "story_body_hi") \
            else str(body[key] or "").strip()
        if len(v) > limit:
            _bad(key, f"at most {limit} characters")
        if key in REQUIRED and not v:
            _bad(key, "is required")
        if v and key in URL_FIELDS and not re.match(r"https?://\S+$", v):
            _bad(key, "must be a full link starting with https://")
        if v and key == "founded_year" and not re.fullmatch(r"(1[5-9]|20)\d\d", v):
            _bad(key, "enter a year like 1962")
        if v and key == "accent_color":
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
                _bad(key, "choose a colour like #880D1E")
            v = v.upper()
        if v and key == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            _bad(key, "enter a valid email address")
        if v and key == "whatsapp":
            digits = re.sub(r"\D", "", v).lstrip("0")
            if len(digits) == 10:
                digits = "91" + digits
            if not 11 <= len(digits) <= 15:
                _bad(key, "enter a mobile number like +91 94144 22558")
            v = "+" + digits
        out[key] = v
    for key, (_, limit) in LISTS.items():
        if key not in body:
            continue
        raw = body[key] if isinstance(body[key], list) else str(body[key] or "").split(",")
        items = [_phone(x) for x in raw if str(x or "").strip()]
        if len(items) > limit:
            _bad(key, f"at most {limit}")
        out[key] = items
    for key in FLAGS:
        if key in body:
            out[key] = bool(body[key])
    return out


def merged(stored: Dict[str, Any]) -> Dict[str, Any]:
    """Every field, with the default wherever nothing is saved."""
    stored = stored or {}
    out: Dict[str, Any] = {}
    for key, (default, _) in TEXT.items():
        out[key] = stored.get(key) or default
    for key, (default, _) in LISTS.items():
        out[key] = stored[key] if key in stored else list(default)
    for key, default in FLAGS.items():
        out[key] = stored.get(key, default)
    return out


def logo_image(data_uri: str) -> str:
    """Logo as a square-fitting PNG of at most LOGO_PX, transparency kept."""
    if not (isinstance(data_uri, str) and data_uri.startswith("data:image/")) or len(data_uri) > LOGO_MAX_UPLOAD:
        raise HTTPException(400, "Logo must be an image (PNG, JPEG or WebP) under 6 MB")
    try:
        raw = base64.b64decode(data_uri.split(",", 1)[1])
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
        img = img.convert("RGBA")
    except Exception:
        raise HTTPException(400, "That logo could not be read. Try a PNG or JPEG.")
    img.thumbnail((LOGO_PX, LOGO_PX), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def logo_version(data_uri: str) -> str:
    return hashlib.md5(data_uri.encode()).hexdigest()[:10] if data_uri else ""


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_") or "shop"
