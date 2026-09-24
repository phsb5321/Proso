# Visuals generation manifest — 2026-09-24

The complete inventory of visual assets Proso needs, organized by surface, with the **method**
for each (hand-vector / GPT-lane / real capture / composed) and dependencies. This is the work
order for the visual push Pedro asked for (24/09/2026): *"visuals, icons, pages and all that
jazz"*. Rules every item inherits: `brand/GEOMETRY.md` for anything mark-shaped,
`docs/visual-assets.md` for editorial art (provenance sidecars, `make art-provenance`), the
[[GPT image prompting playbook]] five-slot spine for generated art, and the optical-size law
(16px = protective tile + silhouette + dot, detail removed).

**Decision gate at the top:** the aperture-blade dial (direction 4, candidates
`brand/exploration/2026-09-24/candidates/`) is the chosen mark direction pending Pedro's pick of
construction (strict / rhythm / compact) — everything in Wave 1 depends on it.

## Wave 1 — mark family (hand-vector, deterministic)

| # | Asset | Spec | Method |
|---|---|---|---|
| 1.0 | `GEOMETRY.md` amendment — dial topology, square 320 viewBox token, blade/pitch tokens | versioned art-direction change | hand, Pedro-ratified |
| 1.1 | Dial mark SVG family: mono-white, mono-navy, dot-green/navy/white, wave-split variants | `brand/svg/` parity (7–12 SVGs) | hand-vector |
| 1.2 | Optical bands: 16px (tile+silhouette+dot), 48/96px, 128px tuned drawing | per optical-size law | hand-vector |
| 1.3 | Deterministic PNG renders + 2× exports (5 PNGs) | `rsvg-convert`, byte-exact | scripted |
| 1.4 | Lockups: dial + Outfit-475 wordmark — dark, light, mono-navy, mono-white | `brand/svg/` parity | hand + font pipeline |
| 1.5 | Icon-band sheet 16→128 at 1× and 4× (the #269 legibility proof) | one sheet, hand-composed | composed |

## Wave 2 — extension & store surfaces

| # | Asset | Spec | Method |
|---|---|---|---|
| 2.1 | Toolbar icon band 16/24/32/48/64/128 from the dial mark | `packages/extension/public/icons` | scripted from 1.2 |
| 2.2 | AMO screenshots ×6 (1.2.13 UI): reading journey w/ footer+highlight, popup, settings, local-host flow, voice picker, queue | 1280×800-ish, real UI | **real Firefox capture** (harness) |
| 2.3 | Chrome Web Store promotional tiles: small 440×280, large 920×680, marquee 1400×560 | CWS listing spec | GPT-lane (spine) + composited type |
| 2.4 | Firefox/AMO promotional images (featured tile 533×400) | AMO spec | GPT-lane + composite |
| 2.5 | Favicon family refresh from the dial band (16/32/48 + apple-touch 180 + android 192/512) | `packages/site` | scripted |
| 2.6 | `og-image` refresh 1536×864 generate → 1200×630 publish (dial lockup + tagline from README, verbatim) | VISUAL-IDENTITY tokens | GPT-lane + real lockup composite |

## Wave 3 — site pages (7 pages)

| # | Page | Assets | Method |
|---|---|---|---|
| 3.1 | `index.html` | hero refresh (dial), 3 feature illustrations (highlight / voices / local-host privacy), CTA band art | GPT-lane art + hand type |
| 3.2 | `pricing.html` | credit-volume illustration (500,000 credits reading), plan comparison art | GPT-lane (spine, strict constraints) |
| 3.3 | `support.html` | first-listen step illustrations ×3 (install → grant → play) | GPT-lane |
| 3.4 | `success.html` | post-install welcome illustration | GPT-lane |
| 3.5 | `apoiar.html` | donate/support illustration | GPT-lane |
| 3.6 | `privacy.html` / `terms.html` | optional restrained header band only | composed, minimal |
| 3.7 | all pages | favicon/OG per 2.5–2.6; consistent art style token (flat geometric, 3 colours) | — |

## Wave 4 — editorial & marketing

| # | Asset | Spec | Method |
|---|---|---|---|
| 4.1 | README hero refresh + 2 section illustrations | wide 16:9 | GPT-lane (anchor+edit on 3.1 hero) |
| 4.2 | Release announcement card (next release) | 1200×630 social | GPT-lane + type composite |
| 4.3 | Social templates: X/LinkedIn card + 3-slide carousel (problem → how → install) | 1200×630 / 1080×1080 | GPT-lane, one idea per card |
| 4.4 | Blog post heroes ×2–3 (Proso posts on the personal blog) | 1.91:1 | GPT-lane |
| 4.5 | "First listen" guide art (docs guide, PR #270) — tutorial step art ×3 | inline detail 1280×720 | GPT-lane |

## Standing rules (apply to every generated item)

- Five-slot spine prompts; visual facts not praise; constraints slot explicit; wordless unless
  type is composited from `brand/svg/` / Outfit — **the model never paints letterforms**.
- Anchor-once-then-edit: `--ref` on an approved anchor; preserve list restated per iteration;
  serialize image runs per identity (`gpt-image` queue rules).
- Every generated PNG ships with its `.provenance.json` sidecar (`make art-provenance` gate).
- Real screenshots are evidence, not art — capture with the harness, redact nothing that leaks
  personal data.
- Anti-generic bans apply (no glowing orbs, no AI-brain iconography, no stock people).
