# Feature 173 — Authentic font wordmark

## Goal

Replace the hand-authored pseudo-typeface wordmark from Feature 161 with a
reproducibly outlined **real, named, properly licensed font**, while retaining
Proso's canonical mark, optical icon bands, path-only shipping SVGs,
deterministic generation, and accessibility/contrast gates.

"Real font" means the canonical glyph geometry is generated from a named font
file/version/weight/axes/tracking with its licence and hash recorded — not
hand-invented Béziers. Shipping SVGs remain self-contained path outlines: no
live `<text>`, remote font, raster embed, or runtime font dependency.

Feature 161's research explicitly stated no open font passed its
then-undocumented threshold. This feature reverses that art-direction decision
with a documented, reproducible metric gate.

## User stories

### US1 — A real named wordmark source (P1)

A designer can identify the exact font, version, axes, weight, tracking, and
licence that produced the Proso wordmark, and can regenerate the outlines from
the pinned font bytes.

**Independent test:** the pinned font file, its SHA-256, its OFL licence, and
the exact generation parameters are recorded; regeneration is deterministic and
the shipped SVGs byte-match a fresh generation.

### US2 — Path-only shipping unchanged (P1)

The production SVGs (wordmark, lockups, og-image) contain only path/primitives
geometry and no live text, font references, filters, or raster embeds.

**Independent test:** the existing structural gate keeps rejecting
`<text>`, `@font-face`, `<image>`, filters, and foreign objects.

### US3 — Drift is caught mechanically (P2)

A change to the font bytes, weight, axes, tracking, or a substitution of
hand-authored glyph paths fails a runnable gate by name.

**Independent test:** a mutation that swaps a glyph path, changes a hash, or
changes weight/tracking turns the brand gate red with the reason named.

### US4 — History is amended, not erased (P2)

Feature 161's "custom measured redraw" decision is superseded with a dated
decision delta; the old construction file remains readable history.

**Independent test:** the decision delta exists, is dated, and names the
replaced decision and the new source of truth.

## Functional requirements

- **FR-001:** Vendor the unmodified selected font file and its OFL licence text
  under `brand/fonts/` with a machine-readable provenance manifest
  (`brand/fonts/manifest.json`): file path, SHA-256, internal version, family,
  licence path, source commit/URL, and selected instance parameters (axes,
  tracking).
- **FR-002:** `brand/source/proso-wordmark-construction.svg` is replaced as the
  canonical wordmark source by a deterministic extraction script that shapes
  `proso` with HarfBuzz (whole-string shaping: kerning, clusters, offsets,
  advances) and emits outline paths from the exact font instance. The old
  construction file moves to `brand/source/archive/` or is otherwise retained
  readably; history is amended with a decision delta, not deleted.
- **FR-003:** Only legitimate typography controls are applied: declared font
  axes (`wght`, `opsz`, `wdth` if declared), additive tracking, one uniform
  scale, and translation. No per-glyph deformation, no anisotropic scaling.
- **FR-004:** The wordmark generation preserves the canonical composition
  geometry: the same baseline relationships, counter structure, and visual
  width class as the current canonical wordmark where the metric gate passes;
  where the font objectively differs, the gate records the measured delta
  instead of silently redrawing.
- **FR-005:** Shipping SVGs (`brand/svg/proso-wordmark.svg`, all lockups,
  `packages/site/assets/images/og-image.svg`) are regenerated from the new
  canonical wordmark group and remain path-only with the existing
  palette/accessibility/id rules.
- **FR-006:** `scripts/verify-brand-assets.mjs` gains a font-origin gate that
  fails when: the pinned font file hash drifts; the recorded version/axes/
  tracking change; the extracted outline hash changes; a generated SVG is
  stale; or a hand-authored path substitutes for font-derived geometry.
- **FR-007:** Existing mark geometry, optical 16/48/128 icon sources, contrast
  floors, and no-`<text>` rules remain unchanged unless a separately evidenced
  defect is found.
- **FR-008:** The decision delta in `specs/161-brand-vector-system/` and/or
  `brand/PROVENANCE.md` records the reversal, date, winner, and metrics;
  Feature 161's history is not rewritten.

## Acceptance criteria

- `node scripts/generate-brand-vectors.mjs` regenerates the wordmark and all
  lockups deterministically; `--check` passes byte-identical.
- `node scripts/render-site-brand-assets.mjs --check` passes (og-image
  refreshed from the new lockup).
- `node scripts/verify-brand-assets.mjs` passes and includes a font-origin
  receipt (font hash, instance, tracking, outline hash).
- A planted mutation (font byte change, weight/tracking change, or a
  hand-authored path swap) makes the gate fail naming the drift.
- `brand/fonts/manifest.json` records file, SHA-256, version, axes, tracking,
  licence, and source commit.
- Every shipping SVG has no `<text>`, `@font-face`, `<image>`, filter, or
  foreign object.
- `make verify` and the repository's different-family delivery gate pass.

## Art-direction decision

The wordmark uses the real font winner from `specs/173-font-authentic-wordmark/
research.md` (provisional: Outfit Variable `wght=475`, tracking 0‰, SIL OFL
1.1), replacing the Feature 161 "custom measured redraw". The reference board
segments remain the visual target; the gate chooses the closest legitimate font
instance under the documented metrics rather than guessing a family.

## Non-goals

- Redesigning the mark, optical icons, extension UI, or the marketing site.
- Adding a runtime font dependency or live text anywhere.
- Native iOS/Android/Safari pipelines.
- Trademark clearance or legal conclusions about the wordmark's original font.
