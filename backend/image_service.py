import os
import base64
import io
import time
import asyncio
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')
from PIL import Image, ImageOps
from openai import OpenAI

API_KEY = os.environ.get("OPENAI_API_KEY")
# gpt-image-2.5-sunburst is OpenAI's model tuned for editing precision (keeping
# the customer's face while swapping clothes). gpt-image-2.5-flare is the same
# price per token and faster, so it is the fallback. gpt-image-1-mini is cheaper
# but cannot reliably combine a person photo with several fabric references.
MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2.5-sunburst")
FALLBACK_MODEL = os.environ.get("OPENAI_IMAGE_FALLBACK_MODEL", "gpt-image-2.5-flare")
# Quality is the main cost lever: low | medium | high | xhigh | max.
# "low" keeps the face and fabric well for try-on at a fraction of medium's cost.
QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "low")
# Output pixels are billed, so use the smallest canvas the model accepts
# (~655k pixels minimum) in the shape of the 900x1100 customer photo. Full-length
# outfits (any bottom wear, or a long top like a kurta) use a taller canvas with
# the same pixel count. Each falls back to a standard size if a model rejects it.
SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "736x896")
SIZE_FULL = os.environ.get("OPENAI_IMAGE_SIZE_FULL", "608x1088")
SAFE_SIZE = "1024x1024"
SAFE_SIZE_FULL = "1024x1536"
# Optional, only for older models that support it (gpt-image-1 / 1.5). Leave empty to skip.
INPUT_FIDELITY = os.environ.get("OPENAI_IMAGE_INPUT_FIDELITY", "")
# Input images are billed per token, so we shrink them before sending.
# The customer photo keeps more pixels so the face survives; fabric swatches
# are centre-cropped so the weave keeps its detail at a small size (tested:
# fine linen slubs still come through at 192 px).
PERSON_MAX_PX = int(os.environ.get("OPENAI_IMAGE_PERSON_MAX_PX", "448"))
FABRIC_MAX_PX = int(os.environ.get("OPENAI_IMAGE_FABRIC_MAX_PX", "192"))

# USD per 1M tokens: (text input, image input, image output). Used only to log
# an estimated cost per try-on; update if OpenAI changes prices.
PRICES = {
    "gpt-image-2.5-sunburst": (5.0, 8.0, 30.0),
    "gpt-image-2.5-flare": (5.0, 8.0, 30.0),
    "gpt-image-2": (5.0, 8.0, 30.0),
    "gpt-image-1.5": (5.0, 8.0, 32.0),
    "gpt-image-1-mini": (2.0, 2.5, 8.0),
}

_client = None


def get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=API_KEY)
    return _client


def _strip(b64: str) -> str:
    if not b64:
        return b64
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def fabric_is_light(b64_images):
    """Average luminance across fabric images. Returns True if fabrics are predominantly light."""
    total = 0.0
    count = 0
    for b in b64_images:
        try:
            raw = base64.b64decode(_strip(b))
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            img = img.resize((48, 48))
            px = list(img.getdata())
            lum = sum(0.299 * r + 0.587 * g + 0.114 * bl for r, g, bl in px) / len(px)
            total += lum
            count += 1
        except Exception:
            continue
    if count == 0:
        return False
    return (total / count) > 140


def _file(b64: str, name: str, max_px: int, square: bool = False):
    """Upright, shrink and re-encode an uploaded image as JPEG for the OpenAI SDK."""
    raw = base64.b64decode(_strip(b64))
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    if square:
        side = min(img.size)
        left, top = (img.width - side) // 2, (img.height - side) // 2
        img = img.crop((left, top, left + side, top + side))
    img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return (f"{name}.jpg", buf.getvalue(), "image/jpeg")


# Tops that hang to the knees. With one of these the try-on must show the
# full length, or the customer never sees where the hem falls.
_LONG_TOP_WORDS = ("kurta", "sherwani", "achkan", "jodhpuri", "angrakha")

_SLOT_ROLE = {
    "top": "the main upper-body garment",
    "bottom": "the lower-body garment",
    "third": "the outer layer, worn over the upper-body garment",
}


def is_full_length(garments):
    """True when the outfit needs a head-to-feet shot: any bottom wear or a knee-length top."""
    for g in garments:
        if g["slot"] == "bottom":
            return True
        text = f"{g['garment_type']} {g.get('description', '')}".lower()
        if any(w in g["garment_type"].lower() for w in _LONG_TOP_WORDS) or "knee" in text:
            return True
    return False


def _build_prompt(garments, light_fabric):
    # Kept short on purpose: text is billed per token, and this compact version
    # was tested to give the same result as a longer prompt (~40% fewer tokens).
    bg = "plain deep charcoal backdrop" if light_fabric else "plain light-grey seamless backdrop"

    # Image 1 is the customer; image N+1 is the fabric for garment N.
    lines = []
    for i, g in enumerate(garments, 2):
        line = f"- Image {i}: fabric for {_SLOT_ROLE.get(g['slot'], g['slot'])}. Make a {g['garment_type']}"
        lines.append(f"{line}: {g['description']}" if g.get("description") else f"{line}.")

    slots = {g["slot"] for g in garments}
    full = is_full_length(garments)
    if "top" not in slots and "third" not in slots:
        lines.append("Change only the lower-body clothing; keep the upper-body clothing from image 1 unchanged.")
    if "bottom" not in slots and full:
        lines.append("No bottom wear chosen: show plain neutral bottoms that suit the outfit.")
    if "third" in slots:
        lines.append("The outer layer goes over the upper-body garment, which stays visible where it "
                     "naturally shows (collar, front, sleeves or hem).")

    framing = ("Show head to feet so full lengths and hems are visible; extend the body naturally, same build."
               if full else "Show head to upper thighs so the whole garment and hem are visible; same camera angle.")
    garment_text = "\n".join(lines)

    return f"""Virtual try-on. Edit image 1 so the same person wears new clothes stitched from the fabric swatches.
- Image 1: the customer (edit this photo).
{garment_text}
Keep exactly from image 1: face, features, skin tone, expression, hair, beard, glasses, body build, pose; footwear if visible. No beautifying or retouching.
Fabric: copy each swatch's exact colour, pattern, weave and texture; scale patterns to real garment size; use only the cloth, ignore hands, tables or backgrounds in the swatches.
Garments: follow each description; realistic tailoring, freshly pressed, clean fit.
{framing}
Background: {bg}, soft studio light. No props, text or watermark.
Output: one photorealistic photo."""


def _extract_image(resp):
    for item in resp.data or []:
        if getattr(item, "b64_json", None):
            return f"data:image/jpeg;base64,{item.b64_json}"
    return None


def _usage(resp, model):
    """Token usage and estimated USD cost of one images.edit call."""
    u = getattr(resp, "usage", None)
    if not u:
        return {"model": model}
    details = getattr(u, "input_tokens_details", None)
    text_in = getattr(details, "text_tokens", 0) or 0
    image_in = getattr(details, "image_tokens", 0) or 0
    out = getattr(u, "output_tokens", 0) or 0
    info = {"model": model, "quality": QUALITY, "text_in": text_in,
            "image_in": image_in, "output": out}
    p = PRICES.get(model)
    if p:
        info["cost_usd"] = round((text_in * p[0] + image_in * p[1] + out * p[2]) / 1e6, 5)
    return info


def _generate_sync(person_b64, garments):
    """garments: list of {slot, garment_type, description, fabric_b64}. Returns (image, usage)."""
    fabrics = [g["fabric_b64"] for g in garments]
    light = fabric_is_light(fabrics)
    prompt = _build_prompt(garments, light)

    # Order matters: the prompt refers to images by position.
    images = [_file(person_b64, "customer", PERSON_MAX_PX)]
    for i, g in enumerate(garments, 1):
        images.append(_file(g["fabric_b64"], f"fabric_{i}", FABRIC_MAX_PX, square=True))

    client = get_client()
    models_to_try = [MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != MODEL:
        models_to_try.append(FALLBACK_MODEL)

    extra = {"input_fidelity": INPUT_FIDELITY} if INPUT_FIDELITY else {}
    full = is_full_length(garments)
    size, safe_size = (SIZE_FULL, SAFE_SIZE_FULL) if full else (SIZE, SAFE_SIZE)

    last_err = None
    # Retry transient 429 / 5xx errors with backoff, then try the fallback
    # model (if configured) so an image is produced instead of failing the try-on.
    for model in models_to_try:
        for attempt in range(3):
            try:
                resp = client.images.edit(model=model, image=images, prompt=prompt,
                                          size=size, quality=QUALITY, n=1,
                                          output_format="jpeg", output_compression=85,
                                          **extra)
                img = _extract_image(resp)
                if img:
                    return img, _usage(resp, model)
                last_err = RuntimeError("No image returned from OpenAI")
            except Exception as e:
                last_err = e
                # Out of credits will not fix itself; fail fast instead of retrying.
                if "insufficient_quota" in str(e):
                    raise
                # A model that rejects the custom size gets the standard one.
                if size != safe_size and "size" in str(e).lower():
                    size = safe_size
                    continue
                if not any(k in str(e) for k in _RETRYABLE_TOKENS):
                    raise
            if attempt < 2:
                time.sleep(_BACKOFF[attempt])
    raise last_err


_RETRYABLE_TOKENS = ("503", "502", "500", "429", "rate_limit", "Rate limit",
                     "server_error", "overloaded", "timed out", "Connection error",
                     "No image returned")
_BACKOFF = [2, 4]


async def generate_tryon(person_b64, garments):
    return await asyncio.to_thread(_generate_sync, person_b64, garments)
