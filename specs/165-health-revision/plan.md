# Feature 165 — Plan

## Slices

1. **Spec + falsifier evidence** (this directory; falsifier recorded in
   `spec.md`).
2. **Controller change** — `packages/server/src/infrastructure/controllers/health.controller.ts`:
   read trimmed `process.env.GIT_REV` inside `check()`, add `revision` to the
   response (`null` when absent/blank). No other file changes.
3. **Focused tests** — new `packages/server/tests/unit/infrastructure/health.controller.spec.ts`:
   - configured case (`GIT_REV` set → `revision` echoes it),
   - absent case (unset → `revision === null`),
   - whitespace case (blank → `null`),
   - plant/falsifier: `version` (hardcoded/package) and request-derived values
     must never satisfy `revision`; absent-GIT_REV response must not report a
     non-null revision.
4. **Doc update** — `docs/health/deploy-status.md` only: describe `revision`
   honestly (source, fallback, verification must fail closed on null).
5. **Gates**:
   - `./scripts/generate-prisma.sh` (NixOS engine wrapper — NEVER bare
     `prisma generate` in a fresh worktree);
   - build shared before server (`pnpm --filter @proso/shared build` then
     `pnpm --filter @proso/server build`, or `make build`);
   - focused health test;
   - **full server suite against a real PostgreSQL** — recover the documented
     501-test baseline via the repo's Nix shell / Docker PostgreSQL path; the
     8 local-only suite failures are NOT normalized away. If the DB path
     cannot run, report the exact infrastructure BLOCK with evidence instead.
   - `make verify` (doctor, format-check, lint, typecheck, smoke-reader,
     smoke-server-boot, security, brand-assets, icons).
6. **Commit + PR + handoff** — conventional commit, push, PR; write
   `/tmp/proso-165-health-revision-handoff.md` (full 40-char head, diff,
   command/exit receipts, plant receipt, unresolved production hold, revert
   command).
7. **Codex immutable-head gate** (cross-family; this branch is
   DeepSeek-generated) — merge only after Codex ALLOW + required checks pass.

## Reversal

`git revert <merge-sha>` — single-commit revert; server-only surface.
