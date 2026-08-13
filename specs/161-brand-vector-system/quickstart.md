# Feature 161 — Quickstart

The brand pipeline requires Node.js, pnpm, ImageMagick 7 (`magick`), and
Inkscape. `nix-shell` provisions all four tools.

```bash
# Regenerate reference crops (ImageMagick)
node scripts/segment-brand-board.mjs

# Re-render expected crops and require exact committed SHA-256 equality
# (ImageMagick is required in both modes.)
node scripts/segment-brand-board.mjs --check

# Regenerate vector variants from the editable wordmark construction
node scripts/generate-brand-vectors.mjs

# Regenerate independent optical-band extension PNGs
pnpm --filter @proso/extension icons:generate

# Regenerate visual receipts, then run the complete asset oracle
node scripts/render-brand-proofs.mjs
node scripts/verify-brand-assets.mjs

# The repository delivery floor also includes the brand oracle
make verify
```

Reference segments live in `brand/segments/`; production vector masters live in
`brand/svg/`; deterministic review receipts live in `brand/proofs/`. Edit the
wordmark in `brand/source/proso-wordmark-construction.svg`, then regenerate in
the order above. Never hand-edit generated `brand/svg/` or extension PNG files.
