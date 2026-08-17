# Feature 173 — Research: real-font wordmark and vectorization workflow

**Research dates:** 13/08/2026 (initial) and 16/08/2026 (reproduction after a
host reboot wiped `/tmp`; identical method, identical results)
**Repository:** `phsb5321/Proso`; base `b8f4d33468bf11cc757f7f0ff14423489cedeca0`
**Dependency:** PR #167 (Feature 166) — **MERGED** 14/08/2026 00:03 UTC as
`6c93d3e051e6e0a93708f36859bb4706da365fca`, so this feature is unblocked.

## Winner

**Outfit Variable, SIL OFL 1.1 — instance `wght=475`, tracking `0‰`, whole-string
HarfBuzz shaping, one uniform scale.** This reverses Feature 161's "custom
measured redraw" with a documented metric gate. The vendored font, licence, and
provenance manifest live in `brand/fonts/`.

- Font file: `brand/fonts/OutfitVariable.ttf` (upstream `Outfit[wght].ttf`)
- SHA-256: `fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade`
- Internal version: `Version 1.100; gftools[0.9.27]`
- Source: https://github.com/google/fonts/tree/main/ofl/outfit/Outfit[wght].ttf
  at commit `5f246070882b903ed95a911dba83d9d4a6836152`
- OFL text SHA-256: `c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416`
- Selected instance: `wght=475`, tracking `0‰`, x-height 1040 units,
  baseline 1040, descender 425.

Why not the raw IoU leader (Plus Jakarta Sans)? PJS leads IoU by 0.0061
(0.8551 vs 0.8490) but loses Chamfer (1.579 vs 1.557), held-out Hausdorff
(19.80 vs 16.28), component-width MAPE (4.84% vs 3.89%) and ink-area MAPE
(8.39% vs 3.25%). Outfit wins the corroborating held-out/structural metrics
and needs zero tracking. This is a reconstruction choice, not a claim that the
AI-generated source board originally used Outfit.

## Method (final, reproducible)

`/tmp/proso-173-font-eval.py` (regenerated on 16/08 after the reboot; same
method, byte-identical results):

1. threshold the committed 550×220 wordmark segment against measured navy;
2. shape the complete string `proso` with HarfBuzz (uharfbuzz 0.53.2),
   preserving glyph IDs, clusters, kerning, offsets, advances;
3. outline each glyph from the exact variable-font instance (fontTools
   `instantiateVariableFont` + `SVGPathPen`, winding-correct fill);
4. vary declared axes only (`wght`; `opsz` where declared; no tested font
   exposes `wdth`) and add tracking after shaped advances;
5. one uniform scale plus translation — no anisotropic scaling, no glyph
   deformation;
6. coarse-to-fine IoU search (bitwise masks), then symmetric Chamfer on the
   top placements;
7. selection: maximize IoU, tie-break Chamfer;
8. held out until after selection: symmetric Hausdorff and
   component/counter ratios.

Tool identities: Python 3.12.13, fontTools 4.63.0, Pillow 12.3.0, NumPy 2.5.0,
SciPy 1.18.0, uharfbuzz 0.53.2, Inkscape 1.4.4, ImageMagick 7.1.2-27.

## Candidate matrix (16/08 reproduction)

| Rank | Candidate | Axes | Tracking | IoU ↑ | Chamfer ↓ | Hausdorff (held out) ↓ | comp width MAPE | ink-area MAPE | counter-area MAPE |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Plus Jakarta Sans | wght=675 | -10‰ | 0.8551 | 1.579 | 19.80 | 4.84% | 8.39% | 2.56% |
| 2 | **Outfit** | **wght=475** | **0‰** | **0.8490** | **1.557** | **16.28** | **3.89%** | **3.25%** | **3.60%** |
| 3 | Gabarito | wght=450 | +25‰ | 0.8487 | 1.597 | 16.28 | 5.67% | 3.39% | 2.79% |
| 4 | DM Sans | opsz=40, wght=575 | +25‰ | 0.8404 | 1.651 | 17.69 | 3.91% | 3.73% | 3.89% |
| 5 | Montserrat | wght=625 | -35‰ | 0.8364 | 1.786 | 20.52 | 7.30% | 12.96% | 0.73% |
| 6 | Sora | wght=550 | -35‰ | 0.8068 | 2.106 | 19.80 | 6.09% | 7.53% | 38.36% |
| 7 | Inter Variable | opsz=32, wght=625 | +20‰ | 0.7929 | 2.272 | 16.28 | 8.16% | 4.30% | 14.52% |
| 8 | Manrope | wght=675 | +30‰ | 0.7680 | 2.498 | **11.31** | 9.55% | 8.97% | 10.72% |
| 9 | Poppins SemiBold | wght=600 | +35‰ | 0.7280 | 3.069 | 16.97 | 7.30% | 3.14% | 25.04% |
| 10 | Urbanist | wght=575 | +70‰ | 0.6979 | 3.111 | 13.45 | 11.09% | 22.45% | 6.92% |

Predeclared gate: IoU ≥ 0.84, Chamfer ≤ 1.65, held-out Hausdorff ≤ 18,
component-width MAPE ≤ 5%, counter-area MAPE ≤ 5%. Plus Jakarta Sans fails
Hausdorff; Gabarito fails component width; DM Sans clears the gate but trails
Outfit on every listed metric. Manrope's Hausdorff win cannot overcome its
8th-place IoU/Chamfer and structural error — the held-out metric corroborates,
it does not override.

Reference metrics: five components (98×134 p, 61×98 r, 99×99 o, 77×99 s,
99×99 o), three counters, ink ratio 0.194.

## Reproducibility evidence

The first full run (13/08) and the post-reboot reproduction (16/08) used the
same candidate bytes (font SHA-256s identical — see
`brand/fonts/manifest.json` for the winner) and produced identical IoU/Chamfer/
Hausdorff values for all ten candidates. The evaluation script and receipts are
archived at `/tmp/proso-173-font-eval.py` and `/tmp/proso-173-font-candidates/`
(best-mask PNGs, top-20 JSON, proof sheet, tool versions).

## Font provenance

All candidates were fetched from the canonical Google Fonts repository; each
directory's `OFL.txt` was fetched separately. All are SIL OFL 1.1. Inter was
tested from the pinned local Nix package (`Inter Version 4.001; git-9221beed3`,
SHA-256 `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf`);
its upstream release is v4.1. The source image was never uploaded to a third
party; no cloud font matcher was used. Three independent SearXNG queries
(captured under `/tmp/proso-173-searx/`) preceded canonical-source fetches.

## Workflow improvements ranked by ROI

1. Separate semantic primitives (marks) from typographic recognition
   (wordmarks) before vectorizing; do not let raster noise become geometry.
2. Shape candidate strings with HarfBuzz and extract outlines from the exact
   font instance — per-character rendering destroys evidence.
3. Coarse-to-fine IoU search; compute expensive EDT distances only for
   finalists; parallelize fonts across cores.
4. Multiple metrics with a held-out metric — IoU alone preferred Plus Jakarta
   Sans, which loses on corroborating evidence.
5. Pin font bytes, version, axes, tracking, and toolchain; record outline hash.
6. Parametric fitting for geometric marks; trace only irregular boundaries.
7. Simplify Béziers only under topology and native-size constraints.
8. Keep independent 16/48/128 optical sources (Feature 161's gates already
   enforce this).
9. Differentiable vectorization (diffvg, Bézier Splatting) is a research
   accelerator, never a final oracle.
10. Keep cloud matchers and AI vectorizers out of the evidence path.
