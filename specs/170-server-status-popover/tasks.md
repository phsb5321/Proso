# Feature 170 — Tasks

- [x] T1 — Reproduce the defect in a built page over HTTP (real Firefox,
  geckodriver): bounding rects, elementFromPoint, computed overflow/stacking,
  light/dark/narrow — receipt in `spec.md` (header 1812px at ≤768px,
  static aria-hidden).
- [x] T2 — Spec/plan/tasks files.
- [x] T3 — CSS: single-column named areas in base `.container`.
- [x] T4 — JS: `aria-hidden` visibility sync in the options controller.
- [x] T5 — Gate `scripts/server-status-popover-gate.mjs` (PASS across
  desktop/narrow/zoom/dark) + plants script (3 caught, 0 missed) + Makefile.
- [ ] T6 — Biome; settings axe suite; extension lint/type/build/fuzz;
  `make verify`; `make quality`; security/dependency gates.
- [ ] T7 — Commit (≤72-char subjects), push, PR, handoff with verbatim SHA.
- [ ] T8 — Codex immutable-head gate; additive repairs; merge after
  ALLOW + checks + browser receipt; update Plane #17.
