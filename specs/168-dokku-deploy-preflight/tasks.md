# Feature 168 — Tasks

- [x] T1 — Falsifier: no tracked deploy preflight exists
  (`checkout-deploy-readiness.mjs` is the checkout gate, 0 deploy matches).
- [x] T2 — Spec/plan/tasks files under `specs/168-dokku-deploy-preflight/`.
- [ ] T3 — Runner `scripts/dokku-deploy-preflight.mjs` (verdict machine,
  target-tree env contract, drift report, revision-gated success).
- [ ] T4 — Plant suite `scripts/dokku-deploy-preflight.self-test.mjs`
  (10 planted cases, deterministic fake boundaries).
- [ ] T5 — Makefile target + honest `docs/health/deploy-status.md` update.
- [ ] T6 — Plant suite green; biome format/check; `make verify`;
  `make quality`; security/dependency/secret gates; server suite re-run.
- [ ] T7 — Production `--check` (read-only, HELD evidence) — after T6.
- [ ] T8 — Conventional commit, push, PR, handoff file
  `/tmp/proso-168-deploy-preflight-handoff.md`.
- [ ] T9 — Codex immutable-head gate; additive repairs only; merge on
  ALLOW + green checks; confirm MERGED; update Plane #42.
