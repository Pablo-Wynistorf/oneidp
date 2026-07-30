#!/usr/bin/env bash
#
# Rasterises the ONEIDP logo into the platform icons that live in public/icons.
#
# The SVG files (oneidp-mark.svg / oneidp-mark-square.svg) are the source of
# truth for the artwork; this script reproduces the exact same geometry with
# ImageMagick primitives because the bundled ImageMagick SVG renderer mangles
# gradients. Keep the numbers below in sync with the SVGs if the mark changes.
#
# Geometry, expressed in the 64-unit design grid scaled x16 onto a 1024 master:
#   tile        64x64, corner radius 16          -> 1024x1024, radius 256
#   glyph head  circle cx 32 cy 24 r 10          -> 512,384 r 160
#   glyph stem  rect 28,27 8x23 radius 4         -> 448,432 .. 576,800 radius 64
#   square variant scales the glyph to 82% about the centre so it stays inside
#   the maskable safe zone once the OS applies its own corner mask.
#
# Usage: ./scripts/generate-icons.sh   (requires ImageMagick 7)

set -euo pipefail

VIOLET='#7c5cff'
CYAN='#22d3ee'
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/icons"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 1; }

# --- masters -----------------------------------------------------------------

# Gradient tile: violet at the top-left corner, cyan at the bottom-right.
magick -size 1024x1024 xc: \
  -sparse-color barycentric "0,0 $VIOLET 1023,1023 $CYAN" \
  "$WORK/tile.png"

# Rounded master: keyhole glyph, inner hairline, rounded-corner alpha mask.
magick "$WORK/tile.png" \
  -stroke none -fill white \
  -draw 'circle 512,384 512,224' \
  -draw 'roundrectangle 448,432 576,800 64,64' \
  -fill none -stroke 'rgba(255,255,255,0.22)' -strokewidth 24 \
  -draw 'roundrectangle 12,12 1011,1011 244,244' \
  \( -size 1024x1024 xc:black -stroke none -fill white \
     -draw 'roundrectangle 0,0 1023,1023 256,256' -alpha off \) \
  -alpha off -compose CopyOpacity -composite \
  "$WORK/master-rounded.png"

# Square master: full bleed, glyph at 82% for the maskable safe zone.
magick "$WORK/tile.png" \
  -stroke none -fill white \
  -draw 'circle 512,407 512,276' \
  -draw 'roundrectangle 460,446 564,748 52,52' \
  "$WORK/master-square.png"

# --- exports -----------------------------------------------------------------

emit() { # emit <master> <size> <filename>
  magick "$WORK/$1.png" -filter Lanczos -resize "${2}x${2}" -strip "$OUT/$3"
  echo "  public/icons/$3 (${2}x${2})"
}

echo "Writing icons to $OUT"
emit master-rounded 512 oneidp-logo.png
emit master-rounded 32 favicon-32.png
emit master-rounded 16 favicon-16.png
emit master-square 180 apple-touch-icon.png
emit master-square 192 icon-192.png
emit master-square 512 icon-512.png

# Multi-resolution ICO for browsers that still ask for /favicon.ico.
magick "$WORK/master-rounded.png" -filter Lanczos \
  \( -clone 0 -resize 16x16 \) \( -clone 0 -resize 32x32 \) \( -clone 0 -resize 48x48 \) \
  -delete 0 -strip "$OUT/favicon.ico"
echo "  public/icons/favicon.ico (16/32/48)"
