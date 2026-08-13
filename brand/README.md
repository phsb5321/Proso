# Proso brand source and vectors

This directory holds the reproducible source evidence and production vector
system for the lowercase Proso identity.

## Source segments

`source/proso-brand-board.png` is the immutable 1254×1254 reference. Its hash
and every crop rectangle live in `segments.json`.

| Segment | Purpose |
|---|---|
| `01-hero-panel.png` | Complete primary panel |
| `02-primary-lockup.png` | Tight horizontal mark + wordmark |
| `03-primary-mark.png` | Bubble, two pills, four-bar waveform |
| `04-wordmark.png` | Lowercase wordmark |
| `05-light-variant-family.png` | Dark-tile family on light |
| `06-compact-variant-family.png` | Green dot family on dark |
| `07-meaning-panel.png` | Text-to-voice semantic decomposition |
| `08-construction-panel.png` | Mark construction sequence |

Regenerate and verify:

```bash
node scripts/segment-brand-board.mjs
node scripts/segment-brand-board.mjs --check
```

The segmenter refuses a changed source hash, out-of-bounds crops, duplicate IDs,
missing outputs, dimensions that do not match the manifest, or same-sized stale
content that differs from a fresh deterministic crop.

The 1–3px uncovered seams in the panel rectangles are intentional presentation
gutters documented by source-pixel analysis; segment crops exclude them instead
of pretending they are logo content.

## Vector policy

- Reconstruct normalized primitives; do not ship a literal autotrace.
- Keep measured evidence separate from authored design decisions.
- Shipping SVGs contain no raster, live text, embedded font, filter, or script.
- Full-colour identity uses the documented navy, off-white, and spring green.
- Extension icons use independent 16/48/128 source drawings and deterministic
  16/32/48/96/128 PNG generation.

Geometry and provenance records are added alongside the vector masters in the
next implementation slice.
