# Feature 161 — Quickstart

```bash
# Regenerate reference crops (requires ImageMagick)
node scripts/segment-brand-board.mjs

# Re-render expected crops and require exact committed SHA-256 equality
# (ImageMagick is required in both modes.)
node scripts/segment-brand-board.mjs --check

# Later slices: verify vectors and regenerate extension PNGs
node scripts/verify-brand-assets.mjs
pnpm --filter @proso/extension icons:generate
make verify
```

Reference segments live in `brand/segments/`; vector masters and proof sheets
will live under `brand/svg/` and `brand/proofs/`.
