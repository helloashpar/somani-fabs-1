"""The shop's own details: Shop setup > General.

General holds only the basic facts about the shop: logo, names, address,
opening hours, map and review links, phone numbers, WhatsApp, emails and
social links. It is the one source of truth for them: the websites (Shop setup
> Website), WhatsApp messages, the admin app (wordmark, login, browser tab),
the shop screen and exports all read them from here, so a change shows
everywhere.

Text that visitors read can also be given in another language. A translation
is stored next to the field with the language code as a suffix
(`shop_name_hi`); when it is empty the main text is used. LANGS lists the
languages offered.

Everything the classic website shows beyond these facts (tagline, story,
founder, colour, ...) is website content, not shop details. It lives in
CLASSIC, is not edited from General and is returned under `classic`.
"""
import base64
import hashlib
import io
import re
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException
from PIL import Image, ImageOps

# Languages a field can be translated into (code -> name in that language).
LANGS: Dict[str, str] = {"hi": "हिंदी"}

# key -> (default, max length). Keys in TRANSLATABLE also accept `<key>_<lang>`.
TEXT: Dict[str, Tuple[str, int]] = {
    # Identity
    "shop_name": ("Somani Fabs", 60),
    "short_name": ("", 30),
    "legal_name": ("Shivnarayan Shivbhagwan Somani", 100),
    # Address: one line each, shown joined in the standard Indian order
    # (street, city, state PIN, country).
    "address_street": ("Gol Pyau, opposite Maheshwari Bhawan", 160),
    "city": ("Kuchaman City", 60),
    "state": ("Rajasthan", 60),
    "pincode": ("341508", 10),
    "country": ("India", 60),
    # Hours: a short extra line such as "Closed on Diwali"; the week is in HOURS.
    "hours_note": ("", 100),
    # Map and reviews
    "maps_url": ("https://share.google/HySsDUkhfkwuHanY8", 300),
    "map_embed_url": ("", 600),
    "reviews_url": ("", 300),
    # Contact
    "whatsapp": ("", 20),
    # Social
    "instagram": ("", 300),
    "facebook": ("", 300),
    "youtube": ("", 300),
    "x": ("", 300),
    "linkedin": ("", 300),
    "website": ("", 300),
}
TRANSLATABLE = ("shop_name", "short_name", "legal_name", "address_street", "city", "state", "country", "hours_note")
DEFAULT_TRANSLATIONS: Dict[str, str] = {
    "shop_name_hi": "सोमानी फेब्स",
    "legal_name_hi": "शिवनारायण शिवभगवान सोमानी",
    "address_street_hi": "गोल प्याऊ, माहेश्वरी भवन के सामने",
    "city_hi": "कुचामन सिटी",
    "state_hi": "राजस्थान",
    "country_hi": "भारत",
}
LISTS: Dict[str, Tuple[List[str], int]] = {
    "phones": (["+91 94144 22558", "+91 74109 90092"], 4),
    "emails": ([], 3),
}
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

URL_FIELDS = ("maps_url", "map_embed_url", "reviews_url", "instagram", "facebook", "youtube", "x", "linkedin", "website")
# Fields that may not be left empty: the defaults are used instead of a gap.
REQUIRED = ("shop_name",)

# Content of the classic website (the shop's original landing page). Not shop
# details, so General does not edit it; kept so that site looks as before.
CLASSIC_TEXT: Dict[str, str] = {
    "tagline": "", "tagline_hi": "",
    "founded_year": "1962",
    "accent_color": "#880D1E",
    "description": "Suiting, shirting, kurta, dhoti and jacket fabric from 100+ brands, "
                   "including Raymond, Siyaram's, Donear and Ramraj.",
    "description_hi": "रेमंड, सियाराम्स, डोनियर और रामराज समेत 100+ ब्रांड का सूटिंग, शर्टिंग, "
                      "कुर्ता, धोती और जैकेट का कपड़ा।",
    "brands_count": "100+",
    "founder": "Shivnarayan Somani, founder",
    "founder_hi": "शिवनारायण सोमानी, संस्थापक",
    "story_body": "Shivnarayan Somani opened the shop in 1962. Today the family still serves every "
                  "customer the way he did: good cloth, an honest price and a promise we keep.",
    "story_body_hi": "शिवनारायण सोमानी जी ने 1962 में यह दुकान खोली। आज भी परिवार हर ग्राहक की सेवा "
                     "वैसे ही करता है: अच्छा कपड़ा, ईमानदार दाम और निभाया हुआ वादा।",
    "locality": "Gol Pyau", "locality_hi": "गोल प्याऊ",
    "footer_note": "", "footer_note_hi": "",
    "seo_description": "Somani Fabs, Kuchaman City. Suiting, shirting, kurta-pyjama, dhoti and jacket "
                       "fabric from Raymond, Siyaram's, Donear and Ramraj since 1962.",
}
CLASSIC_FLAGS: Dict[str, bool] = {"show_staff_login": True, "show_brands": True, "show_promise": True}

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


def _email(value: str) -> str:
    v = str(value or "").strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v) or len(v) > 120:
        _bad("email", f'"{v}" is not a valid email address')
    return v


def _text_keys() -> Dict[str, int]:
    """Every editable text key (with translations) -> max length."""
    keys = {k: limit for k, (_, limit) in TEXT.items()}
    for k in TRANSLATABLE:
        for lang in LANGS:
            keys[f"{k}_{lang}"] = TEXT[k][1]
    return keys


def _clean_hours(raw: Any) -> Dict[str, Dict[str, Any]]:
    """{} (not set) or every day as {closed, open "HH:MM", close "HH:MM"}."""
    if not raw:
        return {}
    if not isinstance(raw, dict):
        _bad("hours", "send one entry per day")
    out = {}
    for day in DAYS:
        d = raw.get(day) or {}
        if not isinstance(d, dict):
            _bad("hours", f"{day} is not valid")
        closed = bool(d.get("closed"))
        times = {}
        for k in ("open", "close"):
            v = str(d.get(k) or "").strip()
            if not closed and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                _bad("hours", f"enter {day} {k} time like 10:00")
            times[k] = v
        out[day] = {"closed": closed, **times}
    return out


def clean(body: Dict[str, Any]) -> Dict[str, Any]:
    """Validated fields present in `body` (settings in the General form)."""
    out: Dict[str, Any] = {}
    for key, limit in _text_keys().items():
        if key not in body:
            continue
        v = " ".join(str(body[key] or "").split())
        if len(v) > limit:
            _bad(key, f"at most {limit} characters")
        if key in REQUIRED and not v:
            _bad(key, "is required")
        if v and key == "map_embed_url":
            v = embed_src(v)
        elif v and key in URL_FIELDS and not re.match(r"https?://\S+$", v):
            _bad(key, "must be a full link starting with https://")
        if v and key == "pincode" and not re.fullmatch(r"[A-Za-z0-9 -]{3,10}", v):
            _bad(key, "enter a PIN code like 341508")
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
        check = _email if key == "emails" else _phone
        items = [check(x) for x in raw if str(x or "").strip()]
        if len(items) > limit:
            _bad(key, f"at most {limit}")
        out[key] = items
    if "hours" in body:
        out["hours"] = _clean_hours(body["hours"])
    return out


def embed_src(value: str) -> str:
    """The map preview link: Google's "Embed a map" gives an <iframe> tag;
    keep only its https://www.google.com/maps/embed?... address."""
    m = re.search(r'src="([^"]+)"', value)
    src = (m.group(1) if m else value).strip()
    if not re.match(r"https://(www\.)?google\.[a-z.]+/maps/embed\?\S+$", src):
        _bad("map_preview", "paste the link or <iframe> code from Google Maps > Share > Embed a map")
    return src


def _from_older(stored: Dict[str, Any]) -> Dict[str, Any]:
    """Values saved by the older General form, under today's keys."""
    out: Dict[str, Any] = {}
    line2 = stored.get("address_line2") or ""
    pin = re.search(r"\b(\d{6})\b", line2)
    for lang in ("", "_hi"):
        if stored.get(f"address_line1{lang}"):
            out[f"address_street{lang}"] = stored[f"address_line1{lang}"]
        if isinstance(stored.get(f"hours{lang}"), str) and stored[f"hours{lang}"]:
            out[f"hours_note{lang}"] = stored[f"hours{lang}"]
    if pin:
        out["pincode"] = pin.group(1)
        # "Kuchaman City, Rajasthan 341508": the state sits before the PIN.
        parts = [p.strip() for p in line2.replace(pin.group(1), "").split(",") if p.strip()]
        if len(parts) >= 2:
            out["state"] = parts[-1]
    if stored.get("directions_url"):
        out["maps_url"] = stored["directions_url"]
    if stored.get("email"):
        out["emails"] = [stored["email"]]
    return out


# Keys of the older General form, replaced by today's keys (see _from_older).
OLDER_KEYS = ("address_line1", "address_line1_hi", "address_line2", "address_line2_hi",
              "hours_hi", "directions_url", "email")


def upgrade(stored: Dict[str, Any], saving: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """On a save: older values not being replaced move to today's keys, and
    the older keys are removed. Returns ($set fields, $unset fields)."""
    stored = stored or {}
    keep = {k: v for k, v in _from_older(stored).items() if k not in saving and k not in stored}
    if isinstance(stored.get("hours"), str) and "hours" not in saving:
        keep["hours"] = {}
    return keep, [k for k in OLDER_KEYS if k in stored]


def merged(stored: Dict[str, Any]) -> Dict[str, Any]:
    """Every field, with the default wherever nothing is saved."""
    stored = stored or {}
    older = _from_older(stored)
    # A saved value wins even when empty (cleared on purpose); the default is
    # only for fields never saved.
    pick = lambda k, default: stored[k] if k in stored else older.get(k, default)  # noqa: E731
    out: Dict[str, Any] = {}
    for key, (default, _) in TEXT.items():
        out[key] = pick(key, default)
    for k in TRANSLATABLE:
        for lang in LANGS:
            key = f"{k}_{lang}"
            out[key] = pick(key, DEFAULT_TRANSLATIONS.get(key, ""))
    for key, (default, _) in LISTS.items():
        out[key] = stored[key] if key in stored else older.get(key, list(default))
    hours = stored.get("hours")
    out["hours"] = hours if isinstance(hours, dict) else {}  # older forms saved free text
    out["address"] = address_text(out)
    out["address_hi"] = address_text(out, "hi")
    out["classic"] = {
        **{k: stored.get(k) or v for k, v in CLASSIC_TEXT.items()},
        **{k: stored.get(k, v) for k, v in CLASSIC_FLAGS.items()},
    }
    out["languages"] = [{"code": c, "name": n} for c, n in LANGS.items()]
    return out


def address_text(b: Dict[str, Any], lang: str = "") -> str:
    """One-line address: "street, city, state PIN, country" (translated parts
    where given)."""
    t = lambda k: (lang and b.get(f"{k}_{lang}")) or b.get(k) or ""  # noqa: E731
    state_pin = " ".join(x for x in (t("state"), b.get("pincode") or "") if x)
    return ", ".join(x for x in (t("address_street"), t("city"), state_pin, t("country")) if x)


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
