# Feature 168 — Plan

## Slices

1. **Spec + falsifier** (this directory; evidence in `spec.md`).
2. **Runner** — `scripts/dokku-deploy-preflight.mjs`:
   - tool presence gate (git, ssh, curl, pnpm);
   - SHAs via `git ls-remote dokku main` / `git rev-parse origin/main`;
   - server-affecting diff filter (`packages/server`, `packages/shared`);
   - drift report over `prisma/` + `scripts/` vs deployed SHA;
   - env contract parsed from `git show MAIN:…app.config.ts`
     (`REQUIRED_IN_PRODUCTION` + `PADDLE_*` mappings, camel→SCREAMING_SNAKE);
   - host key names via `ssh … config:show proso-api` (values stripped at
     parse, never printed);
   - verdict machine: NOOP(0)/SAFE(1)/HELD(2)/ERROR(3); `--check` default;
   - `--deploy`: HELD refuses pre-push; SAFE runs server build + full test
     suite, then `git push dokku main`;
   - success = `/health.revision === MAIN` (full SHA) after deploy;
     missing/null/wrong revision = FAIL (exit 4).
3. **Plant suite** — `scripts/dokku-deploy-preflight.self-test.mjs`: fake
   `git`/`ssh`/`curl`/`pnpm` shims on PATH + scenario files; asserts the
   ten planted cases in `spec.md` (migrations-only scan, absent env, paddle
   group, push-before-preflight, old-health, wrong revision, success,
   check-read-only, secret-echo, missing tool).
4. **Wiring + docs** — Makefile target `dokku-preflight-test` (+ .PHONY);
   `docs/health/deploy-status.md` updated honestly to name the tracked
   runner as the canonical mitigation.
5. **Gates** — plant suite green; `biome format/check` on new scripts;
   `make verify`; `make quality`; security/dependency/secret checks; server
   suite untouched but re-run to prove no regression.
6. **Production `--check` (read-only)** — once, after fake tests green, as
   HELD evidence for Plane #42 (missing key names only).
7. **Commit + PR + handoff** — conventional commit, push, PR,
   `/tmp/proso-168-deploy-preflight-handoff.md`; NO force-push/amend after
   publication; all repairs additive.
8. **Codex immutable-head gate** → merge only on ALLOW + required checks →
   confirm MERGED → update Plane #42 (prepared payload; seat mapping
   permitting, otherwise handed to the mapped PROSO seat).

## Reversal

`git revert <squash-merge-sha>` — one PR; runner is inert until invoked.
