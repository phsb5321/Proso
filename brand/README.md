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

Regenerate and verify (requires Node.js, pnpm, ImageMagick 7, and Inkscape;
`nix-shell` provisions them):

```bash
node scripts/segment-brand-board.mjs
# Font-derived wordmark source (nix-shell toolchain: fontTools + uharfbuzz)
nix-shell -p 'python312.withPackages (ps: with ps; [ fonttools uharfbuzz ])'   --run 'python scripts/extract-font-wordmark.py'
node scripts/generate-brand-vectors.mjs
pnpm --filter @proso/extension icons:generate
node scripts/render-brand-proofs.mjs
node scripts/render-site-brand-assets.mjs
node scripts/verify-brand-assets.mjs
```

The final command re-renders and byte-checks the segments, vectors, proof PNGs,
and extension icons; validates SVG structure and topology; verifies native icon
component counts and bounding boxes; and enforces the contrast floor.

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

Shipping masters live in `svg/`; the wordmark source is generated from the
vendored, licensed font in `fonts/` (see `fonts/manifest.json`) by
`scripts/extract-font-wordmark.py` into `source/proso-wordmark-construction.svg`.
The Feature 161 hand-built construction is preserved read-only in
`source/archive/`. Geometry decisions and source history are recorded in
`GEOMETRY.md` and `PROVENANCE.md`. The deterministic visual receipts in
`proofs/` are review artifacts, not shipping product assets.

Proof-sheet maps:

- `proofs/lockups/contact-sheet.png`: dark, light, mono navy, mono white.
- `proofs/marks/contact-sheet.png`: waveform mark, compact mark, wordmark.
- `proofs/icons/contact-sheet.png`: native-band 16, 48, and 128px zooms.
- `proofs/wordmark/wordmark-decisions.png`: raster reference, selected
  font-derived wordmark (Outfit Variable), legacy custom construction.
- `proofs/wordmark/48px-decisions.png`: waveform treatment, compact treatment.

The selected defaults are the font-derived wordmark (Outfit Variable
`wght=475`) and the full waveform at 48px. Regenerating the proof sheets
preserves the superseded custom construction as a reproducible comparison
without adding non-shipping SVGs.
