# Proso mark geometry

## Coordinate system

The first canonical mark proofs use a 320-unit-high construction grid.

- Primary waveform mark viewBox: `0 0 512 320`.
- Compact dot mark viewBox: `0 0 360 320`.
- Bubble outer stroke envelope: approximately x32–312, y16–308.
- Nominal bubble stroke: 40 units, or 0.143 of its 280-unit outer width.
- Repeated strokes use round caps and joins; the tail is integrated into the
  outline path rather than attached as a second filled shape.

## Primary waveform mark

- Two pills: 152×26 and 128×26, ratio 0.842.
- Four bars: 26 units wide on a 42-unit pitch.
- One center axis: y146.
- Proof bar heights: 62 / 124 / 194 / 102.
- The heights are the authored 8:16:25:13 starting rhythm rounded onto the
  construction grid. They remain a versioned art-direction token, not a claim
  that the raster dictated immutable values.

## Compact dot mark

- Two equal 116×26 pills.
- One 22-unit voice dot aligned with the first pill.
- One detached 40-unit waist cap belongs to the bubble contour; it stays
  physically separate from both main outline terminals, matching the reference's
  five connected components (outline, two pills, voice dot, waist cap).

## Normalizations

The reference's nominally identical geometry was intentionally regularized:

- one top-left/top-right radius system replaces measured 50/72px drift;
- one waveform width, pitch, and center axis replace 1–4px raster drift;
- one flat spring green replaces the source's weak left-to-right colour ramp;
- all repeated pill/bar terminals are exact stadiums.

## Selected wordmark

- Construction viewBox: `0 -30 5000 1466`.
- `p` and both `o`s reuse a 1029×1040 outer bowl and a 609×628 counter.
- Nominal bowl stroke is approximately 206 units; the `p` stem is 203 units.
- The `p` descends 366 units below the 1040-unit baseline.
- The `r` and `s` are clean direct Bézier paths with no font dependency,
  non-uniform transform, or tracer coordinate system.
- The selected treatment preserves the reference's near-monoline bowls and
  distinctive descending `p`; a conventional `p` was rejected as less ownable.

## Optical-size decisions

- 16px: protective navy tile, compact bubble silhouette, one voice dot; text
  pills and waveform bars are removed because their native cores collapse.
- 48px/96px: protective tile, full bubble, two pills, four authored bars.
- 128px: independently tuned full-detail drawing with the same semantic
  topology but different coordinates from the 48px band.
- All five PNG outputs are rendered deterministically from the independent
  16/48/128 SVG bands; 32px and 96px are the corresponding 2× exports.
