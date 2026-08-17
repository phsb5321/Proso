# Feature 173 — Plan

**Branch:** `173-font-authentic-wordmark`
**Date:** 16/08/2026
**Spec:** `specs/173-font-authentic-wordmark/spec.md`
**Research:** `specs/173-font-authentic-wordmark/research.md`

## Summary

Vendor the research winner (Outfit Variable, SIL OFL 1.1) as the single source
of truth for the lowercase `proso` wordmark. A deterministic build script
shapes the string with HarfBuzz and outlines the exact font instance into the
canonical wordmark group; all shipping SVGs and the site og-image are
regenerated; the brand gate learns a font-origin drift check; Feature 161's
decision is amended with a dated delta.

## Technical context

- **Runtime:** Node.js 20+ ESM; build-time only Python 3.12 toolchain
  (fontTools 4.63, uharfbuzz 0.53.2, Pillow, NumPy, SciPy) via `nix-shell`;
  ImageMagick 7 and Inkscape for existing proofs. No runtime dependency.
- **Storage:** vendored font + OFL + manifest; tracked SVGs/PNGs; JSON receipts.
- **Testing:** deterministic brand gate + font-origin falsifier + existing
  site-asset and icon gates; `make verify`; different-family review.
- **Targets:** static site SVG/PNG assets and reusable brand masters.
- **Constraints:** offline-first; path-only shipping; no live fonts; no raster
  embeds; deterministic generation; no per-glyph deformation.

## Constitution check

- **Privacy:** PASS — local assets only; no user/page data or uploads.
- **Security:** PASS — no credentials, network permission, executable SVG
  script, or foreign content; font is vendored and hashed.
- **UX:** PASS with gate — wordmark keeps baseline/counter legibility within
  the documented metric thresholds; toolbar icons untouched.
- **Architecture:** PASS — build tooling stays at repository boundaries; no
  domain-layer change.
- **Critical-path tests:** PASS with gate — generated artifacts remain
  freshness-checked and deterministic; a mutation falsifier proves the
  font-origin gate fails red.
- **Spec tracking:** PASS — spec, plan, research, tasks ship together.

## Structure

```text
brand/fonts/
├── Outfit[wght].ttf          # vendored unmodified font
├── OFL.txt                   # SIL OFL 1.1 licence text
└── manifest.json             # hash, version, axes, tracking, source, licence

brand/source/
├── archive/proso-wordmark-construction.svg   # Feature 161 construction (read-only history)
└── proso-wordmark-construction.svg           # regenerated canonical source (font-derived)

scripts/
├── extract-font-wordmark.mjs   # HarfBuzz-shaped outline extraction (build-time)
├── generate-brand-vectors.mjs  # reads canonical source; regenerates brand/svg + proofs
└── verify-brand-assets.mjs     # gains font-origin drift gate + falsifier plant support

specs/161-brand-vector-system/research.md  # amended with dated decision delta
specs/173-font-authentic-wordmark/{spec,plan,tasks,research}.md
```

## Delivery slices

1. **Provenance:** vendor font + OFL + `manifest.json` (hash/version/axes/
   tracking/licence/source commit) and the extraction script; generate the new
   canonical wordmark source; regenerate `brand/svg/*` and og-image; run
   structural/freshness gates.
2. **Gate hardening:** font-origin assertions in `verify-brand-assets.mjs`
   (font hash, instance params, outline hash, no hand-authored substitution)
   plus a planted mutation that fails red naming the drift; update Feature 161
   research with the dated decision delta.
3. **Receipts:** regenerate proofs/contact sheets, run focused brand gates,
   `make verify`, `make quality`, dependency/secret audits, and the
   browser-visible brand checks; commit/push/PR.

Each slice gets a deterministic verify pass and a different-family review
before completion. Tests and thresholds are never weakened to fit an asset.

## Risks

- **Font drift upstream:** pinned bytes + SHA-256 in manifest; gate fails on
  any change until re-vendored deliberately.
- **Shaping engine drift:** recorded HarfBuzz version; outline hash gate
  catches changed curves.
- **Silent hand-redraw regression:** outline-hash assertion + id/coordinate
  anchors replaced by font-origin receipts; a substitution plant proves the
  gate fails.
- **Board mismatch:** the board is an inconsistent AI raster; the gate selects
  the closest legitimate instance and records the measured delta honestly.
- **Binary rot:** manifest + deterministic generation + freshness checks.

## Complexity tracking

No constitution violation or new service/package. The only new tooling is a
build-time Python/Node script pair executed via the existing `nix-shell`
environment; the vendored font is build-time provenance, not a runtime
dependency.
