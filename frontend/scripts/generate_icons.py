"""
Generate Lumen brand icons (favicon + PWA / apple-touch).

Renders the AgentLogo design at large size with supersampling, then writes:
  - favicon.svg              (vector, primary favicon)
  - favicon.png              (32x32 fallback)
  - favicon-16.png, favicon-32.png
  - apple-touch-icon.png     (180x180, with brand background for crisp home-screen shortcut)
  - icon-192.png, icon-512.png       (PWA, with brand background, transparent corners)
  - icon-maskable-512.png            (PWA maskable, full-bleed bg + safe-zone mark)
  - site.webmanifest
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

# Logo geometry in the original 100x100 viewBox (see AgentLogo.jsx):
#   back tile: x=8  y=32 w=54 h=54 rx=12  fill #0F172A
#   front tile: x=38 y=8  w=54 h=54 rx=12  glass gradient (white, varying alpha)
#                                          stroke rgba(15,23,42,0.22)
#   sheen inside front tile
#   inner rim rgba(255,255,255,0.55)

INK = (15, 23, 42, 255)            # #0F172A
INK_RIM = (15, 23, 42, int(0.22 * 255))
WHITE_RIM = (255, 255, 255, int(0.55 * 255))

# Solid-background colours used for mobile app shortcuts so the mark doesn't
# float in transparent space when iOS / Android renders it at full icon scale.
BG_TOP = (244, 246, 250, 255)  # #F4F6FA  (matches login page bg)
BG_BOT = (228, 233, 241, 255)  # #E4E9F1  (matches --surface-3)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def rounded_rect_mask(size, rect, radius):
    """Return an L-mode mask the size of `size` with a filled rounded rect."""
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(rect, radius=radius, fill=255)
    return m


def vertical_gradient(size, top, bottom):
    """RGBA gradient: top→bottom."""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = lerp(top, bottom, t)
        for x in range(w):
            px[x, y] = c
    return img


def glass_gradient(size):
    """White, alpha 0.85 → 0.45 → 0.22 (from the SVG <linearGradient>)."""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    stops = [(0.0, 0.85), (0.45, 0.45), (1.0, 0.22)]
    for y in range(h):
        t = y / max(1, h - 1)
        # find segment
        for i in range(len(stops) - 1):
            a, alpha_a = stops[i]
            b, alpha_b = stops[i + 1]
            if a <= t <= b:
                k = (t - a) / max(1e-9, (b - a))
                alpha = alpha_a + (alpha_b - alpha_a) * k
                break
        else:
            alpha = stops[-1][1]
        c = (255, 255, 255, int(alpha * 255))
        for x in range(w):
            px[x, y] = c
    return img


def draw_mark(size, bg=None):
    """Render the Lumen mark at (size, size). If `bg` is None the canvas is transparent."""
    # Supersample 4x for crisp edges, then downscale with LANCZOS.
    ss = 4
    W = size * ss

    canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))

    if bg is not None:
        # Solid rounded-rect brand background filling the full icon canvas.
        # Use a vertical gradient (light top → slightly darker bottom) so the
        # glass tile reads as glass even when the icon is rendered at small sizes.
        bg_layer = vertical_gradient((W, W), bg[0], bg[1])
        # Slight rounding so iOS' own mask doesn't crop a harsh edge.
        bg_mask = rounded_rect_mask((W, W), (0, 0, W, W), radius=int(W * 0.22))
        canvas.paste(bg_layer, (0, 0), bg_mask)

    # Map viewBox (0..100) to canvas pixels.
    def s(v):
        return int(round(v / 100.0 * W))

    # ---------- Back (dark) tile ----------
    back_rect = (s(8), s(32), s(8 + 54), s(32 + 54))
    back_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    bd = ImageDraw.Draw(back_layer)
    bd.rounded_rectangle(back_rect, radius=s(12), fill=INK)
    canvas = Image.alpha_composite(canvas, back_layer)

    # ---------- Front (glass) tile ----------
    front_rect = (s(38), s(8), s(38 + 54), s(8 + 54))
    front_mask = rounded_rect_mask((W, W), front_rect, radius=s(12))

    # 1. Glass body
    front_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    grad = glass_gradient((front_rect[2] - front_rect[0], front_rect[3] - front_rect[1]))
    front_layer.paste(grad, (front_rect[0], front_rect[1]), grad)
    # Clip glass to rounded tile shape
    clipped = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    clipped.paste(front_layer, (0, 0), front_mask)
    canvas = Image.alpha_composite(canvas, clipped)

    # 2. Sheen inside the front tile
    sheen = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    # Top soft glow ellipse: cx=62 cy=14 rx=32 ry=11
    cx, cy, rx, ry = s(62), s(14), s(32), s(11)
    sd.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(255, 255, 255, int(0.55 * 255)))
    # Soft blur for glow
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=W * 0.005))
    # Sharp rim sliver: x=46 y=14 w=22 h=1.6 rx=0.8
    rim = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rh = max(2, int(round(1.6 / 100.0 * W)))
    rd.rounded_rectangle(
        (s(46), s(14), s(46 + 22), s(14) + rh),
        radius=max(1, int(0.8 / 100.0 * W)),
        fill=(255, 255, 255, int(0.95 * 255)),
    )
    sheen = Image.alpha_composite(sheen, rim)
    # Clip sheen to front tile
    clipped_sheen = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    clipped_sheen.paste(sheen, (0, 0), front_mask)
    canvas = Image.alpha_composite(canvas, clipped_sheen)

    # 3. Dark outer stroke on front tile
    stroke = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sd2 = ImageDraw.Draw(stroke)
    sd2.rounded_rectangle(
        front_rect,
        radius=s(12),
        outline=INK_RIM,
        width=max(1, int(W * 0.0035)),
    )
    canvas = Image.alpha_composite(canvas, stroke)

    # 4. Inner white rim
    inner = (front_rect[0] + s(0.6), front_rect[1] + s(0.6),
             front_rect[2] - s(0.6), front_rect[3] - s(0.6))
    rim_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    rd3 = ImageDraw.Draw(rim_layer)
    rd3.rounded_rectangle(
        inner,
        radius=s(11.5),
        outline=WHITE_RIM,
        width=max(1, int(W * 0.003)),
    )
    canvas = Image.alpha_composite(canvas, rim_layer)

    # Downsample for crisp edges
    out = canvas.resize((size, size), Image.LANCZOS)
    return out


def draw_maskable(size):
    """Maskable icon: full-bleed background + smaller, centered mark in safe zone."""
    ss = 4
    W = size * ss
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))

    # Full-bleed brand gradient
    bg = vertical_gradient((W, W), BG_TOP, BG_BOT)
    img.paste(bg, (0, 0))

    # Mark inset by 20% on each side (safe zone for maskable icons is the
    # inner 80% — Android can crop up to 10% off each edge for various masks).
    inset = int(W * 0.22)
    inner_size = W - inset * 2
    mark = draw_mark(inner_size, bg=None)
    img.paste(mark, (inset, inset), mark)

    return img.resize((size, size), Image.LANCZOS)


# ---------- Vector favicon ----------
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="45%"  stop-color="#FFFFFF" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.22"/>
    </linearGradient>
    <clipPath id="frontClip">
      <rect x="38" y="8" width="54" height="54" rx="12"/>
    </clipPath>
  </defs>
  <rect x="8" y="32" width="54" height="54" rx="12" fill="#0F172A"/>
  <rect x="38" y="8" width="54" height="54" rx="12" fill="url(#glass)" stroke="rgba(15,23,42,0.22)" stroke-width="1"/>
  <g clip-path="url(#frontClip)">
    <ellipse cx="62" cy="14" rx="32" ry="11" fill="rgba(255,255,255,0.55)"/>
    <rect x="46" y="14" width="22" height="1.6" rx="0.8" fill="rgba(255,255,255,0.95)"/>
  </g>
  <rect x="38.6" y="8.6" width="52.8" height="52.8" rx="11.5"
        fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.8"/>
</svg>
"""


def write(path, data, *, binary=False):
    mode = "wb" if binary else "w"
    with open(path, mode) as f:
        f.write(data)
    print(f"  wrote {os.path.relpath(path, OUT)}")


def main():
    print(f"Generating icons → {OUT}")
    # Vector favicon (transparent — used by browsers in light/dark tabs)
    write(os.path.join(OUT, "favicon.svg"), SVG)

    # Browser tab fallbacks (transparent, mark only)
    draw_mark(16, bg=None).save(os.path.join(OUT, "favicon-16.png"))
    print("  wrote favicon-16.png")
    draw_mark(32, bg=None).save(os.path.join(OUT, "favicon-32.png"))
    print("  wrote favicon-32.png")
    # Replace the existing favicon.png with a sharper 32x32
    draw_mark(32, bg=None).save(os.path.join(OUT, "favicon.png"))
    print("  wrote favicon.png")

    # Apple touch icon — must be solid (iOS ignores alpha + rounds corners itself).
    # 180x180 is the modern standard; render with brand background for crispness.
    draw_mark(180, bg=(BG_TOP, BG_BOT)).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("  wrote apple-touch-icon.png")

    # PWA icons
    draw_mark(192, bg=(BG_TOP, BG_BOT)).save(os.path.join(OUT, "icon-192.png"))
    print("  wrote icon-192.png")
    draw_mark(512, bg=(BG_TOP, BG_BOT)).save(os.path.join(OUT, "icon-512.png"))
    print("  wrote icon-512.png")

    # Maskable PWA icon (Android adaptive)
    draw_maskable(512).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("  wrote icon-maskable-512.png")

    # Web app manifest
    manifest = """{
  "name": "Lumen",
  "short_name": "Lumen",
  "description": "WFH Group task agents",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f4f6fa",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"""
    write(os.path.join(OUT, "site.webmanifest"), manifest)
    print("Done.")


if __name__ == "__main__":
    main()
