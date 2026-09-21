# Proso mark exploration — 21/09/2026

Produced through the editorial art lane (`docs/visual-assets.md`): the fleet ChatGPT
image tool, anchored on the **current shipped mark** (`brand/svg/proso-mark-wave-dark.svg`,
rendered to `mark-anchor.png` at 1024 px). Every raster here carries a provenance
sidecar, because a rejected direction is still a decision and has to name the prompt
that produced it. `make art-provenance` verifies this folder too.

## What was asked

"Try to generate a better logo, special icons and all that jazz."

## What came back

| Direction | Prompt id | Verdict |
|---|---|---|
| A — unified silhouette | `mark-evolve-unified` | **Rejected.** Fusing the bubble and the waveform makes the mark read as a heart/butterfly at small sizes — it loses the two-element grammar that makes it recognisable. |
| B — 16px-first geometry | `mark-evolve-16px` | **Rejected.** Chunky, but the white mass dominates and the interior detail closes up; at 16 px it is a blob. |
| C — louder silhouette | `mark-evolve-loud` | **Rejected**, same failure as B, with a nicer waveform rhythm worth keeping in mind. |
| D — app-icon tile | `app-icon-tile` | **Confirms the shipped grammar**: white bubble + green lines + green waveform on the navy tile is right. Nothing to replace. |

**Conclusion: the model is a direction-finder here, not an asset shop** — exactly what
`brand/source`'s construction documents and the vault's brand-art note say. Proso's mark
is not improved by a new concept; it is improved by better optics at the sizes where it
is seen most.

## The defect the exploration actually found

Rendering the shipped toolbar icons at 5× exposed a real, measured failure:

| Size | Before | After |
|---|---|---|
| 16 / 32 px (toolbar, most seen) | all-green on navy with a 2-unit stroke: the outline closed the bubble's interior and the four waveform bars merged into one green smear — illegible | the family's white open bubble with two text lines and a **two-bar** waveform — legible |
| 48 / 96 / 128 px | correct | unchanged |

The cause was `packages/extension/assets/icons/band-16.svg`, which had abandoned the
family grammar (white outline, waveform) for a single green dot mark. It is now the
48 px band's geometry scaled by 1/3 with the waveform reduced to the two bars that
survive an 11-unit field — one drawing, three bands, no new concept.

## Next slice (not done here)

The extension's UI icons are **Feather Icons paths inlined into `popup/index.html`**
(plus four literal `✓` glyphs), so the product's controls borrow a third-party visual
language with mixed stroke/fill conventions. A Proso glyph set — drawn on the same 24 px
grid, with the mark's grammar (rounded terminals, the waveform's bar rhythm) — is the
natural follow-up, and `settings.html`, the sticky footer and confirm dialogs all need
the same treatment when it happens.
