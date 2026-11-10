#!/usr/bin/env python3
"""Genera los iconos PWA desde el logo del login (logo-nebak.jpg).

- icon-192.png / icon-512.png: lienzo blanco completo con el logo centrado.
  Sin transparencias ni recorte circular, para que se vea como un icono de
  app normal al instalar la PWA (evita el logo "raro" en launchers oscuros).
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
    # Icono "any": lienzo blanco completo con el logo centrado (sin recorte
    # circular ni transparencias). Asi se ve como un icono de app normal en
    # cualquier fondo y no aparece "raro" al instalar la PWA.
    canvas = Image.new("RGB", (size, size), WHITE)
    art = resized(logo, size, 0.84)
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2))
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
