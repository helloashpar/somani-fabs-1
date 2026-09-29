"""Brand watermark for try-on images.

The super admin picks the text (up to two lines), one of the styles below, how
visible it is and whether the text is bold. Everything is drawn in white with a
soft shadow so it reads on both light and dark photos.
"""
import base64
import io
import math

from PIL import Image, ImageDraw, ImageFont

DEFAULT_TEXT = "Somani Fabs"

STYLES = {
    "lattice": "Tiled grid with dashed diagonal lines",
    "diagonal": "Repeated diagonal text across the photo",
    "center": "One large mark in the centre",
    "corner": "Small signature in the bottom-right corner",
    "band": "Label strip along the bottom",
}
VISIBILITY = ("subtle", "medium", "strong")
WEIGHTS = ("regular", "bold")
DEFAULTS = {"text": DEFAULT_TEXT, "style": "lattice", "visibility": "subtle", "weight": "regular"}
MAX_LINES = 2

# Opacity (0-255) of text, lines and shadow for each visibility level.
_ALPHA = {
    "subtle": {"text": 95, "line": 50, "shadow": 35},
    "medium": {"text": 140, "line": 80, "shadow": 55},
    "strong": {"text": 200, "line": 115, "shadow": 80},
}


def normalize(cfg: dict) -> dict:
    """Fill defaults and clamp values; unknown values fall back to defaults."""
    cfg = {**DEFAULTS, **{k: v for k, v in (cfg or {}).items() if v is not None}}
    lines = [ln.strip() for ln in str(cfg["text"]).replace("\r", "").split("\n")]
    cfg["text"] = "\n".join([ln for ln in lines if ln][:MAX_LINES])
    if cfg["style"] not in STYLES:
        cfg["style"] = DEFAULTS["style"]
    if cfg["visibility"] not in VISIBILITY:
        cfg["visibility"] = DEFAULTS["visibility"]
    if cfg["weight"] not in WEIGHTS:
        cfg["weight"] = DEFAULTS["weight"]
    return cfg


def _decode(data_uri: str) -> Image.Image:
    raw = base64.b64decode(data_uri.split(",", 1)[1] if data_uri.startswith("data:") else data_uri)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _encode(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


class _Pen:
    """Draws multi-line white text with a soft shadow at a given size."""

    def __init__(self, lines, size, cfg):
        self.lines = lines
        self.font = ImageFont.load_default(size=max(8, int(size)))
        self.stroke = max(1, round(size / 28)) if cfg["weight"] == "bold" else 0
        a = _ALPHA[cfg["visibility"]]
        self.fill = (255, 255, 255, a["text"])
        self.shadow = (0, 0, 0, a["shadow"])
        probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        self.boxes = [probe.textbbox((0, 0), ln, font=self.font, stroke_width=self.stroke) for ln in lines]
        self.line_h = self.font.size * 1.25
        self.w = max((b[2] - b[0] for b in self.boxes), default=0)
        self.h = self.line_h * len(lines)

    def draw(self, draw, cx, cy):
        """Draw the block centred on (cx, cy)."""
        top = cy - self.h / 2
        off = max(1, self.font.size // 20)
        for i, (ln, b) in enumerate(zip(self.lines, self.boxes)):
            x = cx - (b[2] - b[0]) / 2 - b[0]
            y = top + i * self.line_h + (self.line_h - (b[3] - b[1])) / 2 - b[1]
            draw.text((x + off, y + off), ln, font=self.font, fill=self.shadow,
                      stroke_width=self.stroke, stroke_fill=self.shadow)
            draw.text((x, y), ln, font=self.font, fill=self.fill,
                      stroke_width=self.stroke, stroke_fill=self.fill)

    def stamp(self, pad=0.3):
        """The block on its own transparent image (for rotating)."""
        p = int(self.font.size * pad) + 2
        im = Image.new("RGBA", (int(self.w) + 2 * p, int(self.h) + 2 * p), (0, 0, 0, 0))
        self.draw(ImageDraw.Draw(im), im.width / 2, im.height / 2)
        return im


def _dashed_line(draw, p1, p2, width, dash, gap, fill):
    (x1, y1), (x2, y2) = p1, p2
    length = math.hypot(x2 - x1, y2 - y1)
    dx, dy = (x2 - x1) / length, (y2 - y1) / length
    pos = 0.0
    while pos < length:
        end = min(pos + dash, length)
        draw.line([(x1 + dx * pos, y1 + dy * pos), (x1 + dx * end, y1 + dy * end)], fill=fill, width=width)
        pos += dash + gap


def _lattice(overlay, lines, cfg):
    W, H = overlay.size
    draw = ImageDraw.Draw(overlay)
    cell = W / 2  # two columns of square cells
    line_fill = (255, 255, 255, _ALPHA[cfg["visibility"]]["line"])
    lw, dash, gap = max(1, round(W / 500)), max(4, W / 90), max(3, W / 120)
    k = -(W + H)
    while k <= W + H:
        c = cell / 2 + k
        _dashed_line(draw, (-H, -H + c), (W + H, W + H + c), lw, dash, gap, line_fill)
        c2 = cell * 1.5 + k
        _dashed_line(draw, (-H, H + c2), (W + H, -W - H + c2), lw, dash, gap, line_fill)
        k += cell
    pen = _Pen(lines, W * 0.042, cfg)
    for r in range(math.ceil(H / cell) + 1):
        for col in range(2):
            pen.draw(draw, cell / 2 + col * cell, cell / 2 + r * cell - cell * 0.35)


def _diagonal(overlay, lines, cfg):
    W, H = overlay.size
    stamp = _Pen(lines, W * 0.04, cfg).stamp().rotate(30, expand=True, resample=Image.BICUBIC)
    step_x, step_y = stamp.width * 1.35, stamp.height * 1.1
    row = 0
    y = -stamp.height / 2
    while y < H:
        x = -stamp.width / 2 + (step_x / 2 if row % 2 else 0)
        while x < W:
            overlay.alpha_composite(stamp, (int(x), int(y)))
            x += step_x
        y += step_y
        row += 1


def _center(overlay, lines, cfg):
    W, H = overlay.size
    pen = _Pen(lines, W * 0.1, cfg)
    if pen.w > W * 0.85:  # long text: shrink to fit
        pen = _Pen(lines, W * 0.1 * W * 0.85 / pen.w, cfg)
    pen.draw(ImageDraw.Draw(overlay), W / 2, H / 2)


def _corner(overlay, lines, cfg):
    W, H = overlay.size
    pen = _Pen(lines, W * 0.035, cfg)
    margin = W * 0.04
    pen.draw(ImageDraw.Draw(overlay), W - margin - pen.w / 2, H - margin - pen.h / 2)


def _band(overlay, lines, cfg):
    W, H = overlay.size
    pen = _Pen(lines, W * 0.034, cfg)
    band_h = pen.h + W * 0.04
    draw = ImageDraw.Draw(overlay)
    band_alpha = {"subtle": 70, "medium": 105, "strong": 140}[cfg["visibility"]]
    draw.rectangle([0, H - band_h, W, H], fill=(0, 0, 0, band_alpha))
    pen.draw(draw, W / 2, H - band_h / 2)


_DRAW = {"lattice": _lattice, "diagonal": _diagonal, "center": _center,
         "corner": _corner, "band": _band}


def apply(data_uri: str, cfg: dict) -> str:
    """Return a JPEG data URI of the image with the watermark burned in."""
    cfg = normalize(cfg)
    lines = cfg["text"].split("\n") if cfg["text"] else []
    if not lines:
        return data_uri
    img = _decode(data_uri).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    _DRAW[cfg["style"]](overlay, lines, cfg)
    return _encode(Image.alpha_composite(img, overlay))


def preview_base(data_uri: str = "", width: int = 480) -> str:
    """A small image to preview watermarks on: the given photo, or a plain gradient."""
    if data_uri:
        img = _decode(data_uri)
        img.thumbnail((width, width * 2), Image.LANCZOS)
    else:
        h = int(width * 1100 / 900)
        img = Image.new("RGB", (width, h))
        draw = ImageDraw.Draw(img)
        for y in range(h):
            v = int(150 - 70 * y / h)
            draw.line([(0, y), (width, y)], fill=(v, v + 4, v + 10))
    return _encode(img)
