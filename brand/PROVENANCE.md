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

The selected lowercase wordmark is a custom outlined construction. Its `p` and
both `o`s share one canonical bowl/counter system. The `r` and `s` were redrawn
as direct, editable Bézier paths on the same baseline after raster measurement;
they are not stock-font glyphs and do not contain traced path output. The `p`
keeps the reference's unusual descender because it is the most distinctive and
consistently repeated wordmark feature.

A normalized 476×134 mask comparison against the primary source crop reached an
IoU of approximately 0.88 after the clean-path redraw. This receipt is useful for
regression direction, not a claim of exact identity: antialiasing, flat-colour
normalization, and deliberately regularized curves prevent pixel equivalence.
Validly measured stock candidates did not pass the identification threshold;
Outfit, Montserrat, Manrope, and Nunito Sans remain unclosed harness gaps only if
a future stock-font route is reconsidered.
