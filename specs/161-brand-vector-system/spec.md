# Feature 161 — Proso brand vector system

## Goal

Turn the supplied 1254×1254 brand board into a reproducible, production-ready
identity package: measured reference segments, clean editable SVG masters,
light/dark/monochrome lockups, compact and waveform marks, and independently
legible browser-extension icon bands.

The board is reference evidence, not a vector master. Repeated instances disagree
in corner radii, colour, spacing, and labelled pixel size, so the implementation
must recover intent and normalize geometry rather than trace one crop literally.

## User stories

### US1 — Inspectable source segments (P1)

A designer can inspect each meaningful part of the source board independently:
hero lockup, primary mark, wordmark, light variants, compact variants, meaning,
and construction.

**Independent test:** one command regenerates every named crop from the committed
source, and a separate check confirms the source hash and every crop dimension.

### US2 — Canonical vector family (P1)

A product maintainer can use clean SVG assets for the primary waveform mark,
compact dot mark, wordmark, full lockups, and one-colour variants without a font,
raster embed, filter, or editor-specific dependency.

**Independent test:** structural verification confirms the declared topology,
palette, viewBox, accessible metadata, and absence of prohibited SVG constructs.

### US3 — True optical icon bands (P2)

Chrome and Firefox receive icon assets that remain recognizable at native size
on light and dark browser chrome. The 16, 48, and 128 sources are independent
drawings; 32 and 96 are intentional exact-2× renders.

**Independent test:** native-size connected-component, contrast, blur, and
geometry-hash checks pass for all three sources, and the existing icon generator
reproduces 16/32/48/96/128 PNGs.

### US4 — Reproducible quality receipts (P2)

A reviewer can reproduce the measurements and see one contact sheet covering
variants, sizes, and backgrounds rather than relying on a subjective claim that
the vectors look right.

**Independent test:** the verification command emits deterministic structural
receipts and a visual proof sheet from a clean checkout.

## Functional requirements

- **FR-001:** Commit the source board under a neutral filename with its SHA-256
  and 1254×1254 dimensions recorded in a machine-readable segment manifest.
- **FR-002:** Generate named crops for the hero panel, primary lockup, primary
  mark, wordmark, light variant family, compact variant family, meaning panel,
  and construction panel.
- **FR-003:** The primary mark contains exactly two interior pills and four
  external waveform bars; the compact mark contains two equal pills and one dot.
- **FR-004:** Repeated geometry uses one authored stroke system, equal waveform
  widths and pitch, one center axis, and explicitly normalized corner radii.
- **FR-005:** Shipping SVGs use paths/primitives only: no `<image>`, `<text>`,
  filters, foreign objects, embedded fonts, or unresolved editor effects.
- **FR-006:** Full-colour masters declare only `#010616`, `#F8F8F9`, and
  `#21F299`; one-colour masters declare one foreground colour plus transparency.
- **FR-007:** Standalone informative SVGs expose accessible title/description
  metadata; decorative integration remains the consumer's explicit choice.
- **FR-008:** Wordmark geometry is outlined and reuses one canonical bowl for
  both `o` glyphs and the `p` bowl. No stock-font identity may be claimed unless
  it passes the documented metric gate.
- **FR-009:** The extension keeps its existing three-source pipeline:
  `band-16.svg` → 16/32, `band-48.svg` → 48/96, `band-128.svg` → 128.
- **FR-010:** Essential toolbar shapes meet 3:1 contrast on the documented light
  and dark browser surfaces, or use a protective tile that does.
- **FR-011:** Verification rejects stale crops, malformed dimensions, prohibited
  SVG constructs, wrong component counts, matching optical-band geometry, and
  stale generated PNGs.
- **FR-012:** Every normalization or unresolved art-direction choice is recorded
  in `GEOMETRY.md`/`PROVENANCE.md`; measured values are not mislabeled as immutable
  design truth.

## Acceptance criteria

Gherkin is intentionally not used: these are deterministic asset/build checks,
not stakeholder behaviour with a live Gherkin runner.

- Running `node scripts/segment-brand-board.mjs` regenerates all eight crops and
  exits 0; `--check` uses ImageMagick to re-render each expected crop and requires
  exact SHA-256 equality with the committed output.
- Every crop's decoded dimensions exactly match `brand/segments.json`.
- The canonical full mark has 2 pills and 4 bars; the compact mark has 2 pills
  and 1 dot, established by structural IDs and raster component checks.
- Every shipping SVG passes XML/structure checks and contains no raster or live
  text.
- Native 16/48/128 proofs decode at their requested size and retain the declared
  topology after the documented blur/downsample checks.
- Two clean generation runs produce identical PNG bytes.
- `make verify` and the repository's different-family review gate pass before
  merge.

## Art-direction proof decisions

The branch must produce side-by-side proofs rather than silently deciding:

1. measured custom `p` versus a conventional full-height `p` stem;
2. near-monoline wordmark contrast versus conventional optical thinning;
3. 48px waveform versus compact-dot treatment.

The initial authored defaults are the measured custom `p`, near-monoline
wordmark, and waveform at 48px. Each remains reversible through the proof source.

## Non-goals

- Native iOS/Android/Safari asset pipelines; Proso currently ships Chrome and
  Firefox extensions plus a static site.
- Trademark clearance or legal ownership conclusions.
- Redesigning extension UI or the marketing site in this slice.
- Treating whole-image RMSE against the inconsistent board as the sole quality
  oracle.
