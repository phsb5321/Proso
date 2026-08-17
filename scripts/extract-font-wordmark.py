#!/usr/bin/env python3
"""Deterministic Proso wordmark extraction from the vendored Outfit variable font.

Shapes the lowercase string "proso" with HarfBuzz (whole-string kerning,
clusters, offsets and advances), instantiates the font at the manifest axes,
outlines each glyph, applies one uniform scale plus translation (no glyph
deformation), and writes the canonical wordmark source SVG.

Usage:
    python scripts/extract-font-wordmark.py            # write brand/source/...
    python scripts/extract-font-wordmark.py --check    # byte-compare committed source

Requires the nix-shell toolchain (fontTools, uharfbuzz). Build-time only; the
shipping SVGs remain path-only with no runtime font dependency.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'brand/fonts/manifest.json'
FONT_FILE = ROOT / 'brand/fonts/OutfitVariable.ttf'
SOURCE = ROOT / 'brand/source/proso-wordmark-construction.svg'

TEXT = 'proso'
X_HEIGHT_UNITS = 1040  # canonical wordmark x-height in the SVG coordinate system
GLYPH_IDS = ['letter-p', 'letter-r', 'letter-o-1', 'letter-s', 'letter-o-2']
MARGIN_RIGHT = 40
MARGIN_TOP = 30
MARGIN_BOTTOM = 60


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def ntos(value):
    text = format(value, '.3f').rstrip('0').rstrip('.')
    return text or '0'


def load_manifest():
    data = json.loads(MANIFEST.read_text())
    if data.get('font') != 'brand/fonts/OutfitVariable.ttf':
        raise SystemExit('manifest font path drifted')
    return data


def shape(font_path, axes):
    data = font_path.read_bytes()
    face = hb.Face(data)
    hfont = hb.Font(face)
    hfont.scale = (face.upem, face.upem)
    hfont.set_variations(axes)
    buffer = hb.Buffer()
    buffer.add_str(TEXT)
    buffer.guess_segment_properties()
    hb.shape(hfont, buffer)
    return face, hfont, buffer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    manifest = load_manifest()
    axes = dict(manifest['axes'])
    tracking = int(manifest['trackingPerMille'])

    font = TTFont(FONT_FILE)
    font_sha = sha256_bytes(FONT_FILE.read_bytes())
    if font_sha != manifest['fontSha256']:
        raise SystemExit(f'font file hash drifted: {font_sha} != {manifest["fontSha256"]}')
    instantiateVariableFont(font, axes, inplace=True)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[ord(char)] for char in TEXT]
    if len(names) != len(GLYPH_IDS):
        raise SystemExit('glyph count mismatch')

    # Whole-string shaping for positions/advances (kerning preserved).
    face, hfont, buffer = shape(FONT_FILE, axes)
    upem = face.upem
    positions = buffer.glyph_positions
    if len(positions) != len(names):
        raise SystemExit('shaped cluster count mismatch')

    # x-height from the 'o' glyph top; baseline is y=0 in font units (y-up).
    o_bounds = BoundsPen(glyph_set)
    glyph_set[names[2]].draw(o_bounds)
    x_height_top = o_bounds.bounds[3]
    scale = X_HEIGHT_UNITS / x_height_top

    # Left edge of the 'p' glyph becomes x=0 (mirrors the old construction).
    p_bounds = BoundsPen(glyph_set)
    glyph_set[names[0]].draw(p_bounds)
    min_x = p_bounds.bounds[0]

    # y-up font units -> y-down SVG: y_svg = (x_height_top - y_up) * scale,
    # so the baseline lands exactly on X_HEIGHT_UNITS and the x-height top on 0.
    transform = Transform(scale, 0, 0, -scale, -min_x * scale, x_height_top * scale)

    outlines = []
    max_x = 0.0
    max_y = 0.0
    origin = 0.0
    for index, name in enumerate(names):
        position = positions[index]
        offset_x = origin + (position.x_offset or 0)
        offset_y = position.y_offset or 0
        glyph_pen = SVGPathPen(glyph_set, ntos=ntos)
        t1 = TransformPen(glyph_pen, Transform(1, 0, 0, 1, offset_x * scale, -offset_y * scale))
        t2 = TransformPen(t1, transform)
        glyph_set[name].draw(t2)
        outlines.append((GLYPH_IDS[index], glyph_pen.getCommands()))
        origin += position.x_advance
        if tracking:
            origin += tracking * upem / 1000
        # Track rendered extent via the shifted path coordinates.
        bounds = BoundsPen(glyph_set)
        bt1 = TransformPen(bounds, Transform(1, 0, 0, 1, offset_x * scale, -offset_y * scale))
        bt2 = TransformPen(bt1, transform)
        glyph_set[name].draw(bt2)
        if bounds.bounds:
            max_x = max(max_x, bounds.bounds[2])
            max_y = max(max_y, bounds.bounds[3])

    width = math.ceil(max_x) + MARGIN_RIGHT
    height = math.ceil(max_y) + MARGIN_BOTTOM + MARGIN_TOP

    body_lines = [f'    <path id="{glyph_id}" fill-rule="evenodd" d="{d}"/>' for glyph_id, d in outlines]
    group = '  <g id="wordmark" fill="#F8F8F9">\n' + '\n'.join(body_lines) + '\n  </g>\n'
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -30 '
        f'{width} {height}" role="img" aria-labelledby="title desc">\n'
        '  <!-- Generated by scripts/extract-font-wordmark.py from '
        f'{manifest["font"]} (wght={axes["wght"]}, tracking {tracking}\u2030); do not edit. -->\n'
        '  <title id="title">Proso wordmark construction</title>\n'
        '  <desc id="desc">The lowercase Proso wordmark outlined from the '
        'vendored Outfit variable font (SIL OFL 1.1).</desc>\n'
        f'{group}</svg>\n'
    )

    source_sha = sha256_bytes(svg.encode())
    if args.check:
        committed = SOURCE.read_text()
        if committed != svg:
            raise SystemExit(
                f'wordmark source is stale (expected sha256 {source_sha}) — '
                'run python scripts/extract-font-wordmark.py'
            )
        print(f'wordmark source fresh: sha256 {source_sha}')
    else:
        SOURCE.write_text(svg)
        print(f'wrote {SOURCE.relative_to(ROOT)}: {width}x{height}, sha256 {source_sha}')
        print(f'expected manifest sourceSha256: {source_sha}')


if __name__ == '__main__':
    try:
        main()
    except SystemExit as error:
        if error.code:
            print(f'extract-font-wordmark: FAIL — {error}', file=sys.stderr)
        raise
