#!/usr/bin/env python3
"""Genera los iconos PWA desde el logo del login (logo-nebak.jpg).

- icon-192.png / icon-512.png: recorte circular del logo con esquinas
  transparentes. El blanco del propio logo forma el circulo, como en el login,
  y el splash blanco no muestra ningun cuadrado.
- icon-maskable-192.png / icon-maskable-512.png: lienzo blanco completo con el
  logo dentro de la zona segura; Android puede recortarlo sin dejar bordes.
- icon-180.png: apple-touch-icon opaco con el mismo fondo blanco.

Uso: python scripts/gen_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "src" / "assets" / "icons"
SRC = ICONS / "logo-nebak.jpg"
WHITE = (255, 255, 255)


def load_logo():
    return Image.open(SRC).convert("RGB")


def resized(logo, size, fill):
    target = max(1, int(round(size * fill)))
    ratio = min(target / logo.width, target / logo.height)
    return logo.resize(
        (max(1, int(round(logo.width * ratio))), max(1, int(round(logo.height * ratio)))),
        Image.LANCZOS,
    )


def circular_icon(logo, size):
    art = logo.resize((size, size), Image.LANCZOS)
    # Máscara circular con supersampling para un borde limpio y sin halo.
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    inset = size * scale * 0.01
    ImageDraw.Draw(mask).ellipse(
        (inset, inset, size * scale - inset, size * scale - inset),
        fill=255,
    )
    mask = mask.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    canvas.paste(art, (0, 0), mask)
    out = ICONS / f"icon-{size}.png"
    canvas.save(out, "PNG", optimize=True)
    return out


def white_icon(logo, size, fill, name):
    canvas = Image.new("RGB", (size, size), WHITE)
    art = resized(logo, size, fill)
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2))
    out = ICONS / name
    canvas.save(out, "PNG", optimize=True)
    return out


def main():
    logo = load_logo()
    outputs = [
        circular_icon(logo, 192),
        circular_icon(logo, 512),
        white_icon(logo, 192, 0.78, "icon-maskable-192.png"),
        white_icon(logo, 512, 0.78, "icon-maskable-512.png"),
        white_icon(logo, 180, 0.84, "icon-180.png"),
    ]
    for path in outputs:
        image = Image.open(path)
        alpha = image.getchannel("A").getextrema() if image.mode == "RGBA" else "opaque"
        print(f"{path.relative_to(ROOT)}: {image.mode} {image.size} alpha={alpha}")


if __name__ == "__main__":
    main()
