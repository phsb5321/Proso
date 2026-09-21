# The Proso ChatGPT project

Created 21/09/2026 so Proso's visual work has one place with the brand context
already loaded, instead of re-explaining the mark in every thread.

| | |
|---|---|
| Project | `https://chatgpt.com/g/g-p-6ab15a2574f881918c1c7bef42c7d89c/project` |
| First thread (board 01) | `https://chatgpt.com/g/g-p-6ab15a2574f881918c1c7bef42c7d89c-proso/c/6ab15c3d-d62c-83e9-8bbd-c225beab1127` |
| Identity | fleet ChatGPT identity `openai-platform` (Pedro's Pro lane), headed Chrome on Nix.Server VM 105 |

## What is in it

- **`INSTRUCTIONS.md`** — the brand brief (metaphor, mark rules, the three colours,
  visual mode, method, bans). The section marked *Instructions (verbatim)* is what
  belongs in the project's Instructions field.
- **Attachments in the first thread** — the seven real assets: the mark on navy, the
  mark transparent, the mono mark, both lockups, the palette card, and the icon-band
  sheet (16→128 px at 1× and 4×). Real files, not descriptions, so the model anchors on
  the drawing rather than on prose about it.

## The measured UI path

Reverse-engineered once, on 21/09/2026, because guessing it produced two failures: the
brief typed into the *chat composer* (the lane then correctly refused to send, which is
the guard doing its job) and a hunt for `/g/` anchors that never existed.

1. `chatgpt.com/projects` → the **`New`** button → a modal with a *Project name* field
   (placeholder "Copenhagen Trip") → **`Create project`**.
2. Projects are **grid rows** (`role="row"`), not links — click the row to open one.
3. The header control holding the project's settings is **`aria-label="Show project
   details"`**; it opens a menu with **`Project settings`** (and *Pin project*). The
   instructions editor lives inside that panel.
4. Inside the project, the composer is the ordinary one, so the lane's own primitives
   work unchanged: `attach_reference` per file, then `send_and_anchor`. The first
   message created the thread at `/g/g-p-…-proso/c/<uuid>`.

`vendors/chatgpt/project.py` in `web-automation` automates steps 1–4 (instructions from a
file, attachments, first prompt).

## State on 21/09/2026

The project exists, the first thread exists, all seven assets are attached, and
`brand/exploration/2026-09-21/project-board-01.png` is what came back — a 3×3 board with
the logo, construction geometry, a browser-frame application, the three exact hexes, a
typography panel, a 256→16 px icon ladder, a waveform and a tiled pattern, all
provenance-gated.

**Still to set:** the project's *Instructions* field. The automation reached the panel but
the fleet tunnel dropped mid-run (`ssh ControlMaster to Nix.Server is not alive`, then
`BrokerBusy`) and the step did not complete. Finish it with:

```bash
cd ~/Documents/Code/personal/web-automation && env PYTHONPATH="$PWD" browser-patchright \
  vendors/chatgpt/project.py --identity openai-platform \
  --project-url "https://chatgpt.com/g/g-p-6ab15a2574f881918c1c7bef42c7d89c/project" \
  --instructions <(sed -n '/Instructions (verbatim)/,/^---/p' brand/chatgpt-project/INSTRUCTIONS.md) \
  --prompt "acknowledge the brief" --out /tmp
```

Two honest notes on the board: it drew the wordmark itself (approximating Outfit — the
canon says letterforms must be composited from the real lockup if an asset ships), and it
invented two taglines ("Simple. Faster. Louder.", "A clearer conversation everywhere.")
that are not approved copy. Both are fine for an exploration board, neither is usable on
a shipped surface without the real wordmark and approved language.
