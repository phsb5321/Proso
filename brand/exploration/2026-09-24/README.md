# Exploration — 24/09/2026: three example directions from the project thread

Pedro's ask (24/09 13:43 BRT): *"we need to work on our visuals, generate some
examples through the image generator on the gpt tab on the nixos server through the
browser automation toolset"*. Generated through the ChatGPT web UI on the server
browser fleet (identity `openai-platform`, `vendors/chatgpt/generate.py` → the
`gpt-image` shim path), inside **project thread 01** — the same anchored conversation
boards 01–03 came from, so the seven brand attachments were in context. Three
sequential one-session calls (the lane's serialise rule), each `status: ok`,
`send_confirmed: true`, 3 candidates returned, last candidate taken.

Each prompt is an *edit of the anchor* per the method: a **preserve** column (palette,
shape language, stroke weight, negative space) and a **change** column, and an explicit
WORDLESS clause (the board-01 lesson: the model paints letterforms and invents
taglines unless banned).

## The three directions

| File | Direction | Verdict |
|---|---|---|
| `example-social-card.png` | Square marketing/social card: an abstract page of ink text rules funnels down into the speech bubble, the waveform rises out — *text becomes voice*. | **Keeper direction.** Composition is horizontal-band inside the square with generous negative space; the metaphor reads instantly. The model added concentric listening arcs (from the site-illustration brief vocabulary) and dashed accents in the funnel — slight busyness beyond strict "even stroke weight", acceptable for editorial art. |
| `example-app-icon-direction.png` | One navy rounded-square tile holding only the bubble-plus-waveform mark, thick strokes, reduced detail, to survive 16 px. | **Promising, two flags.** (1) Palette drift: the tile is a lighter navy and carries a faint top-left glow — the strict three-colour rule says anything else is a rejected direction, so this needs recolouring before any shipped use. (2) 16 px survival is **not proven** — at the icon-band sheet's 2-unit stroke the bubble interior tends to close and the four waveform bars merge (#269's exact lesson). Needs the 16→128 stress render before trusting it. |
| `example-site-illustration.png` | Wide site/README illustration: abstract browser window with text rules on the left, rules flowing into the bubble, waveform stepping into concentric listening arcs on the right. | **Keeper direction.** Closest of the three to the brief's own words; the window→bubble→waveform read is left-to-right and calm. Fits the README hero / support-page slot family. |

## Honest limits of this round

- **No `--ref` was passed.** The method says anchor with a reference image that
  embodies the intended grammar (`og-image.png`). This round leaned on thread 01's
  in-thread asset context instead. It worked (mark grammar held in all three), but the
  next round should use `--ref` explicitly — that is the method, not improvisation.
- All three came back genuinely **wordless** (the WORDLESS clause held).
- The model answers brief *vocabulary* loosely: arcs appeared in the social card
  because the neighbouring brief mentioned them. Sequential calls in one thread share
  context — a feature here (style continuity), but do not assume strict isolation.
- Nothing here is shippable art yet: these are directions. Picking one makes it the
  anchor for the family; redrawing as vector is the upgrade path
  (`docs/visual-assets.md` §The method).

## Reproduce

```bash
~/Documents/Code/personal/web-automation/bin/web-pull chatgpt generate "<prompt>" \
  --out brand/exploration/2026-09-24 \
  --identity openai-platform \
  --url 'https://chatgpt.com/g/g-p-6ab15a2574f881918c1c7bef42c7d89c-proso/c/6ab15c3d-d62c-83e9-8bbd-c225beab1127' \
  --json
```

Verbatim prompts, sha256, dims and signed source URLs are in each
`*.png.provenance.json` sidecar (audited by `make art-provenance`).
