# Feature 170 — Plan

## Slices

1. **Reproduce first (done, receipt in spec.md):** built page over HTTP in
   real Firefox-nightly (geckodriver) — measured the implicit-track
   breakage (header 1812px at ≤768px) and the static `aria-hidden`.
2. **CSS fix:** single-column named areas in base `.container`.
3. **JS fix:** `aria-hidden` visibility sync in
   `packages/extension/src/entrypoints/options/controller.ts`.
4. **Regression gate:** `scripts/server-status-popover-gate.mjs`
   (loaded extension, desktop/narrow/zoom/dark, topmost/unclipped/aria/
   touch-target assertions) + `scripts/server-status-popover-plants.mjs`
   (control + `grid-areas` + `aria-static` plants, verdict-line scoring)
   + Makefile targets.
5. **Gates:** biome; settings axe suite; extension lint/type/build/fuzz;
   `make verify`; `make quality`; security/dependency gates; Firefox
   visual tests only if the Docker path exists (no host Playwright).
6. **Commit (subjects ≤72 chars), push, PR, handoff**
   `/tmp/proso-170-status-popover-handoff.md` with exact verbatim SHA.
7. **Codex immutable-head gate** (DeepSeek-generated; additive repairs
   only; no force-push/amend after publication) → merge only after
   ALLOW + required checks + browser receipt → update Plane #17.

## Reversal

`git revert <squash-merge-sha>` — one PR; CSS+JS+scripts revert together.
