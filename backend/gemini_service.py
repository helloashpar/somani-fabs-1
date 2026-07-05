import os
import base64
import io
import asyncio
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')
from PIL import Image
from google import genai
from google.genai import types

API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image-preview")

_client = None


def get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=API_KEY)
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


def _part(b64: str):
    raw = base64.b64decode(_strip(b64))
    try:
        Image.open(io.BytesIO(raw))
        mime = "image/jpeg"
    except Exception:
        mime = "image/jpeg"
    return types.Part.from_bytes(data=raw, mime_type=mime)


def _build_prompt(garments, light_fabric):
    if light_fabric:
        bg = ("a clean, deep charcoal-to-black studio backdrop (dark grey / near-black), "
              "so the light coloured fabrics stand out with strong contrast")
    else:
        bg = ("a clean, bright whitish / light-grey seamless studio backdrop, "
              "so the dark coloured fabrics stand out with strong contrast")

    g_lines = []
    for g in garments:
        g_lines.append(f"- {g['slot']}: a well-tailored, properly fitted, crisply ironed and "
                       f"completely wrinkle-free {g['garment_type']} stitched from the fabric shown "
                       f"in the corresponding reference fabric image, with smooth crease-free sleeves.")
    garment_text = "\n".join(g_lines)

    return f"""You are a professional commercial virtual try-on studio engine for an unstitched-fabric retail shop. Money is involved, so accuracy is critical.

INPUT IMAGES:
1. The FIRST image is the real photograph of the customer (a person). 
2. The following images are CLOSE-UP photographs of UNSTITCHED FABRICS the customer wants stitched into garments.

TASK: Produce a single photorealistic full studio portrait of the SAME customer wearing newly-tailored garments made from those exact fabrics.

ABSOLUTE, NON-NEGOTIABLE CONSTRAINTS:
- The customer's FACE, facial structure, skin tone, expression, hair and identity must remain EXACTLY the same as in the first image. Do NOT beautify, slim, age, change or enhance the face in any way. The customer must instantly recognise themselves.
- Keep the SAME body type, build, height proportions, pose and camera angle as the original photo (a straight-on portrait framed roughly to the waist/stomach).
- Reproduce each fabric's TRUE colour, shade, pattern, weave and texture with maximum fidelity. Do not invent, recolour, brighten or stylise the fabric. What you render must match what the customer is buying.

GARMENTS TO RENDER (tailored, realistic stitching, natural folds and drape):
{garment_text}

GARMENT FINISH (IMPORTANT): Every garment must look freshly pressed and professionally ironed — crisp, smooth and completely wrinkle-free fabric with NO creases or wrinkles anywhere, especially NONE at the sleeves. The fit must be clean and well-tailored (neither baggy nor tight), sitting neatly on the body.

BACKGROUND: Place the customer against {bg}. Soft, even, professional studio lighting. No props, no text, no watermark.

OUTPUT: One clean, sharp, high-resolution try-on photograph only."""


def _generate_sync(person_b64, garments):
    """garments: list of {slot, garment_type, fabric_b64}"""
    fabrics = [g["fabric_b64"] for g in garments]
    light = fabric_is_light(fabrics)
    prompt = _build_prompt(garments, light)

    contents = [prompt, _part(person_b64)]
    for g in garments:
        contents.append(_part(g["fabric_b64"]))

    client = get_client()
    resp = client.models.generate_content(model=MODEL, contents=contents)

    for cand in resp.candidates or []:
        if not cand.content or not cand.content.parts:
            continue
        for part in cand.content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                data = inline.data
                if isinstance(data, str):
                    out = data
                else:
                    out = base64.b64encode(data).decode("utf-8")
                return f"data:image/png;base64,{out}"
    raise RuntimeError("No image returned from Gemini")


async def generate_tryon(person_b64, garments):
    return await asyncio.to_thread(_generate_sync, person_b64, garments)
