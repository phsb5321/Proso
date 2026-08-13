# Feature 165 — Tasks

- [x] T1 — Falsifier: prove no existing public response reports `GIT_REV`
  (evidence: `git grep GIT_REV|revision bb699b3 -- packages/server/src` empty).
- [x] T2 — Spec/plan/tasks files under `specs/165-health-revision/`.
- [x] T3 — Controller: add `revision` to `/health` (process env only, trimmed,
  `null` fallback; `version` semantics unchanged; all fields preserved).
- [x] T4 — Focused test file `health.controller.spec.ts`: configured / absent /
  whitespace cases + plant proving `version` cannot impersonate `revision`.
- [x] T5 — `docs/health/deploy-status.md`: honest description of the field.
- [x] T6 — Built shared before server (`./scripts/generate-prisma.sh` +
  `pnpm --filter @proso/shared build` + `pnpm --filter @proso/server build`);
  focused test 4/4; FULL server suite with real PostgreSQL via testcontainers
  + Nix engine: **37/37 suites, 505/505 tests** (= 501 baseline + 4 new).
- [x] T7 — `make verify` exit 0 (doctor, format-check, lint, typecheck,
  smoke-reader, smoke-server-boot, security, brand-assets, icons);
  `make quality` exit 0.
- [x] T8 — Conventional commit, push, PR, handoff file at
  `/tmp/proso-165-health-revision-handoff.md`.
- [ ] T9 — Codex immutable-head gate; merge only on ALLOW + green checks.
