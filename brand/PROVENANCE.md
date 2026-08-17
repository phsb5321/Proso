# Proso identity provenance

## Source

- File: `brand/source/proso-brand-board.png`
- SHA-256: `114a6c227a33822a00184ec6547371519cdea4f0063c5e2dc8b45be4e33b8550`
- Dimensions: 1254×1254, 8-bit sRGB PNG
- Supplied: 12/08/2026

The source is a generated presentation board, not an editable vector file. It
contains repeated but inconsistent instances. The committed segments preserve
that evidence; the SVGs are a measured and human-directed reconstruction.

## Recovered signal

- open-waist speech-bubble outline;
- exactly two interior text pills;
- exactly four bars in the primary waveform;
- compact two-pill treatment with a dot and detached waist contour;
- measured starting palette `#010616`, `#F8F8F9`, `#21F299`.

## Authored decisions

- normalized radii, bar widths, pitch, and axis;
- one flat green;
- proposed 8:16:25:13 waveform rhythm;
- semantic SVG groups and accessible metadata.

These decisions add a reproducible vector system without claiming pixel-for-pixel
identity with every inconsistent source instance. Potrace/VTracer was used only
as a measurement aid while inspecting raster contours; no tracer output or
coordinate transform survives in a shipping SVG.

## Wordmark

### Original decision (Feature 161, 13/08/2026)

The selected lowercase wordmark was a custom outlined construction. Its `p` and
both `o`s shared one canonical bowl/counter system. The `r` and `s` were redrawn
as direct, editable Bézier paths on the same baseline after raster measurement;
they were not stock-font glyphs and contained no traced path output. The `p`
kept the reference's unusual descender because it was the most distinctive and
consistently repeated wordmark feature.

A normalized 476×134 mask comparison against the primary source crop reached an
IoU of approximately 0.88 after the clean-path redraw. At the time, validly
measured stock candidates did not pass the then-undocumented identification
threshold; Outfit, Montserrat, Manrope, and Nunito Sans remained unclosed
harness gaps.

### Decision delta (Feature 173, 16/08/2026)

Pedro reversed the art-direction decision: the wordmark now uses a real, named,
properly licensed font. The canonical wordmark source
`source/proso-wordmark-construction.svg` is generated deterministically from the
vendored **Outfit Variable** font (SIL OFL 1.1), instance `wght=475`, tracking
`0‰`, shaped as a whole string with HarfBuzz (kerning preserved). Font bytes,
licence, source commit, axes, tracking, and the resulting outline hash are
recorded in `fonts/manifest.json`. Only one uniform scale plus translation is
applied — no glyph deformation.

The Feature 161 custom construction is preserved read-only at
`source/archive/proso-wordmark-construction-custom.svg` and remains renderable
as the `legacy` proof; the old bowls/p-stem anchors were not deleted from
history. The full candidate matrix, metric gate, and winner rationale live in
`specs/173-font-authentic-wordmark/research.md`.
