"""Meta WhatsApp Cloud API (Graph API). Every call to Meta lives in this module,
so switching to another provider later only means rewriting this file.

Configuration comes from environment variables (see deploy/env.example). When
WHATSAPP_ENABLED is not "true" or a required value is missing, `enabled()` is
False and the rest of the app treats WhatsApp as switched off.
"""
import hashlib
import hmac
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("somani.whatsapp")

REQUIRED_ENV = ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID",
                "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN")


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def missing_env() -> List[str]:
    return [n for n in REQUIRED_ENV if not _env(n)]


def enabled() -> bool:
    return _env("WHATSAPP_ENABLED").lower() == "true" and not missing_env()


def graph_version() -> str:
    return _env("WHATSAPP_GRAPH_VERSION", "v23.0")


def public_base_url() -> str:
    return _env("PUBLIC_BASE_URL").rstrip("/")


def phone_number_id() -> str:
    return _env("WHATSAPP_PHONE_NUMBER_ID")


def waba_id() -> str:
    return _env("WHATSAPP_WABA_ID")


class WhatsAppError(Exception):
    def __init__(self, message: str, code: Optional[int] = None, details: str = ""):
        super().__init__(message)
        self.code = code
        self.details = details


# Meta error codes -> short message for shop staff. Full error goes to the log.
_FRIENDLY = {
    190: "The WhatsApp token has expired or is wrong. Ask the owner to check it.",
    131047: "The customer's 24-hour WhatsApp window has closed.",
    131026: "This number could not receive the message. It may not be on WhatsApp.",
    131050: "The customer has stopped marketing messages from this business.",
    131049: "WhatsApp did not deliver this message to keep engagement healthy. Try later.",
    131056: "Too many messages to this customer at once. Please wait a moment.",
    130429: "WhatsApp is busy right now. Please try again in a minute.",
    132001: "This message template is not approved yet.",
    133010: "The WhatsApp number is not registered yet. Ask the owner to run the setup.",
    368: "The WhatsApp number is temporarily blocked by Meta.",
    131031: "The WhatsApp account is locked. Ask the owner to check WhatsApp Manager.",
    131042: "WhatsApp payment issue. Ask the owner to check the payment method.",
}


def friendly_error(e: Exception) -> str:
    if isinstance(e, WhatsAppError):
        if e.code in _FRIENDLY:
            return _FRIENDLY[e.code]
        return str(e) or "WhatsApp message failed. Please try again."
    if isinstance(e, httpx.TimeoutException) or isinstance(e, httpx.TransportError):
        return "Could not reach WhatsApp. Check the internet and try again."
    return "WhatsApp message failed. Please try again."


def verify_signature(raw_body: bytes, header: str) -> bool:
    """Check Meta's X-Hub-Signature-256 header against the app secret."""
    secret = _env("WHATSAPP_APP_SECRET")
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[7:])


async def _request(method: str, path: str, *, json: Any = None, params: Dict = None,
                   data: Dict = None, files: Dict = None, content: bytes = None,
                   headers: Dict = None, timeout: float = 30) -> Dict:
    url = path if path.startswith("http") else f"https://graph.facebook.com/{graph_version()}/{path.lstrip('/')}"
    hdrs = {"Authorization": f"Bearer {_env('WHATSAPP_TOKEN')}", **(headers or {})}
    async with httpx.AsyncClient(timeout=timeout) as http:
        r = await http.request(method, url, json=json, params=params, data=data,
                               files=files, content=content, headers=hdrs)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:500]}
    if r.status_code >= 400 or "error" in body:
        err = body.get("error") or {}
        code = err.get("code")
        detail = (err.get("error_data") or {}).get("details") or err.get("error_user_msg") or ""
        msg = err.get("message") or f"Meta returned HTTP {r.status_code}"
        logger.warning("Graph %s %s failed: %s %s %s", method, path, code, msg, detail)
        raise WhatsAppError(msg, code, detail)
    return body


# ---------- Sending ----------
def _to(phone: str) -> str:
    return phone.lstrip("+")


async def send_template(phone: str, name: str, language: str, components: List[Dict]) -> str:
    """Send an approved template. Returns Meta's message id."""
    body = await _request("POST", f"{phone_number_id()}/messages", json={
        "messaging_product": "whatsapp", "to": _to(phone), "type": "template",
        "template": {"name": name, "language": {"code": language}, "components": components}})
    return body["messages"][0]["id"]


async def send_text(phone: str, text: str) -> str:
    body = await _request("POST", f"{phone_number_id()}/messages", json={
        "messaging_product": "whatsapp", "to": _to(phone), "type": "text",
        "text": {"body": text[:4096], "preview_url": False}})
    return body["messages"][0]["id"]


async def upload_media(data: bytes, mime: str = "image/jpeg", filename: str = "look.jpg") -> str:
    """Upload bytes straight to Meta (never via a public URL). Returns a media id."""
    body = await _request("POST", f"{phone_number_id()}/media",
                          data={"messaging_product": "whatsapp", "type": mime},
                          files={"file": (filename, data, mime)}, timeout=60)
    return body["id"]


async def send_image(phone: str, media_id: str, caption: str = "") -> str:
    body = await _request("POST", f"{phone_number_id()}/messages", json={
        "messaging_product": "whatsapp", "to": _to(phone), "type": "image",
        "image": {"id": media_id, "caption": caption[:1024]}})
    return body["messages"][0]["id"]


# ---------- Account / setup ----------
async def get_phone_number() -> Dict:
    return await _request("GET", phone_number_id(), params={"fields": (
        "display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,"
        "code_verification_status,status,platform_type,throughput")})


async def get_waba() -> Dict:
    return await _request("GET", waba_id(), params={
        "fields": "name,currency,timezone_id,account_review_status,business_verification_status"})


async def list_templates() -> List[Dict]:
    out, url, params = [], f"{waba_id()}/message_templates", {
        "fields": "name,language,status,category,previous_category,rejected_reason", "limit": 200}
    while url:
        body = await _request("GET", url, params=params)
        out += body.get("data", [])
        url, params = (body.get("paging") or {}).get("next"), None
    return out


async def create_template(payload: Dict) -> Dict:
    return await _request("POST", f"{waba_id()}/message_templates", json=payload)


async def subscribed_apps() -> List[Dict]:
    return (await _request("GET", f"{waba_id()}/subscribed_apps")).get("data", [])


async def subscribe_app() -> Dict:
    return await _request("POST", f"{waba_id()}/subscribed_apps")


async def register_number(pin: str) -> Dict:
    return await _request("POST", f"{phone_number_id()}/register",
                          json={"messaging_product": "whatsapp", "pin": pin})


async def upload_example_image(data: bytes, mime: str = "image/jpeg") -> str:
    """Resumable upload for a template's example header image. Returns the handle.
    Needs WHATSAPP_APP_ID (only used when submitting image-header templates)."""
    app_id = _env("WHATSAPP_APP_ID")
    if not app_id:
        raise WhatsAppError("WHATSAPP_APP_ID is needed to submit image templates")
    session = await _request("POST", f"{app_id}/uploads",
                             params={"file_length": len(data), "file_type": mime})
    body = await _request("POST", session["id"], content=data,
                          headers={"Authorization": f"OAuth {_env('WHATSAPP_TOKEN')}",
                                   "file_offset": "0"}, timeout=60)
    return body["h"]
