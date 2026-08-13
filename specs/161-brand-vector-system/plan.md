# Feature 161 — Plan

**Branch:** `161-brand-vector-system`  
**Date:** 13/08/2026  
**Spec:** `specs/161-brand-vector-system/spec.md`

## Summary

Establish the source board and deterministic segments first, then construct the
normalized marks and wordmark as parametric SVG, then author the three extension
optical bands, and finally add structural/raster quality gates and proof sheets.
Autotrace output may be used only as a locked measurement underlay; it never
becomes shipping geometry.

## Technical context

- **Runtime:** Node.js 20+ ESM for manifests/gates; ImageMagick only for explicit
  crop regeneration; existing SVGO + `@resvg/resvg-js` for shipping raster output.
- **Storage:** tracked PNG/SVG/JSON/Markdown assets; no database.
- **Testing:** Node deterministic asset gate, existing icon freshness gate,
  `make verify`, and cross-family adversarial review.
- **Targets:** Firefox/Chrome extension icons and reusable static-site SVGs.
- **Constraints:** offline-first; no cloud vectorizer; no live fonts; no raster
  embeds; true native-size checks; no new runtime dependency.

## Constitution check

- **Privacy:** PASS — local assets only; no user/page data or external upload.
- **Security:** PASS — no credentials, network permission, executable SVG script,
  or foreign content.
- **UX:** PASS with gate — toolbar variants must work on light and dark themes and
  remain recognizable at 16px.
- **Architecture:** PASS — build tooling remains at repository/package boundaries;
  no domain-layer change.
- **Critical-path tests:** PASS with gate — generated extension artifacts remain
  freshness-checked and deterministic.
- **Spec tracking:** PASS — spec, plan, research, contract, and tasks ship together.

Re-check after vector implementation: palette, accessibility, and optical-size
receipts are blocking.

## Structure

```text
brand/
├── README.md
├── GEOMETRY.md
├── PROVENANCE.md
├── source/proso-brand-board.png
├── segments.json
├── segments/*.png
├── svg/*.svg
└── proofs/*

scripts/
├── segment-brand-board.mjs
└── verify-brand-assets.mjs

packages/extension/assets/icons/
├── band-16.svg
├── band-48.svg
└── band-128.svg

specs/161-brand-vector-system/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/brand-assets.md
└── tasks.md
```

## Delivery slices

1. **Reference extraction:** source, manifest, crop script, eight named crops,
   dimension/hash gate.
2. **Canonical masters:** normalized waveform/dot marks, wordmark proofs, lockups,
   monochrome variants, geometry/provenance records.
3. **Optical sources:** independent 16/48/128 extension drawings and regenerated
   16/32/48/96/128 PNGs.
4. **Quality receipts:** structural lint, topology/contrast/blur checks, contact
   sheet, deterministic regeneration, full repository gate.

Each slice gets an independent verify pass and a different-family review before
being considered complete. Tests and thresholds may not be weakened to fit an
asset.

## Risks

- **Generated inconsistency becomes canon:** prevented by consensus constants and
  explicit authored decisions rather than literal trace coordinates.
- **Tiny icon false confidence:** prevented by native 1× checks; the board's
  enlarged labels are not acceptance evidence.
- **Font guess fossilized:** prevented by outlined custom wordmark and metric proof.
- **Light-theme disappearance:** prevented by actual toolbar-background contrast
  checks and a reversible protective-tile fallback.
- **Binary rot:** prevented by source manifests, deterministic generation, and
  freshness checks.

## Complexity tracking

No constitution violation or new service/package is required.
