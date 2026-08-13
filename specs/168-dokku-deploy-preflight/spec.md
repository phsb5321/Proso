# Feature 168 — Repo-owned fail-closed Dokku deploy preflight

**Status**: in progress (13/08/2026)
**Owner**: Dokku deploy seat `w2:pJ`
**Branch**: `168-dokku-deploy-preflight` (from `e8e4ec5`)

## Problem

The operator-local runner `~/.local/bin/proso-dokku-deploy` (audit 13/08,
Plane #42) has three measured defects:

1. **Schema mutation before env discovery.** Its only schema check diffs
   `prisma/migrations/`; with main's commerce stack the real drift lives in
   `schema.prisma` + the `prepare-license-issuance-schema.sql` bridge and is
   applied by predeploy (`prisma db push`/`db execute`) — so an unattended
   run mutates the production schema and only then crashes, because
2. **required boot env is never checked.** Main's `app.config.ts` hard-throws
   at boot without `LICENSE_KEY_SECRET` (≥32 bytes), and commerce paths need
   the Paddle group; the runner pushes anyway and mislabels the failure
   ("possible diverged remote").
3. **Verification cannot identify the deployed revision.** It asserts the
   402 copy — an OLD container also passes — instead of the new
   `/health.revision` field (Feature 165, merged `e8e4ec5`).

## Falsifier (checked first, 13/08 15:38 BRT)

If a tracked repo command already reports NOOP/SAFE/HELD, detects
schema/bridge drift, validates the target tree's production env contract
before push, and compares `/health.revision` to the intended SHA under
deterministic fakes — do not duplicate.
**Result: none exists.** `git grep NOOP|SAFE|HELD origin/main -- scripts/ Makefile`
finds only `scripts/checkout-deploy-readiness.mjs`, which is the checkout
money-taking gate (site config); it has 0 matches for
`dokku|ls-remote|GIT_REV|revision`. Feature 168 is not a duplicate.

## Solution

`scripts/dokku-deploy-preflight.mjs` — the smallest tracked, repo-owned
runner — plus `scripts/dokku-deploy-preflight.self-test.mjs` (deterministic
fake-boundary plant suite) and one Makefile target.

### Required behavior

- `--check` is **strictly read-only** and exits with a named verdict:
  `NOOP` (0 — no server-affecting diff), `SAFE` (1 — deploy possible),
  `HELD` (2 — blockers). HELD lists **missing key NAMES only** and never
  pushes. Default mode is `--check`.
- **Env contract from the target tree**: parse `REQUIRED_IN_PRODUCTION` and
  the `paddle*: process.env.PADDLE_*` mappings out of
  `git show MAIN:packages/server/src/infrastructure/config/app.config.ts`
  (no untested duplicate list; camelCase config keys are transformed to the
  SCREAMING_SNAKE env names). Presence is checked against
  `ssh dokku@host config:show proso-api` **key names only** — values are
  stripped before anything is printed. Strength (≥32 bytes) is enforced by
  the app at boot; a weak-but-present secret fails the deploy at
  verification, which is reported honestly.
- **Drift detection** covers `schema.prisma`, `packages/server/scripts/`
  (predeploy + bridge `*.sql`), and `prisma/migrations/` — the output never
  says "schema untouched" when any of them changed.
- **`--deploy`** refuses HELD before any push/predeploy; SAFE runs the
  existing deterministic server gates (`pnpm --filter @proso/server build`
  + full `pnpm --filter @proso/server test`) and only then
  `git push dokku main`.
- **Final success requires** live `GET /health` `.revision` to equal the
  intended full SHA (main's 40-char SHA). A missing/null/wrong revision is
  FAIL — an old container's 402 copy can never prove success.
- **Missing tools fail closed** (git/ssh/curl/pnpm absent → ERROR, no push).

### Plant suite (each old bug planted against fakes)

migrations-only scan → drift must still be reported; absent
LICENSE_KEY_SECRET → HELD, no push; absent Paddle group with commerce
config present → HELD, names listed; push-before-preflight → push shim
never invoked while HELD; old-health response (no `revision`) → FAIL;
wrong revision → FAIL; complete env → SAFE on `--check` without push;
secret values never appear on stdout; missing tool → ERROR.

## Non-goals

- No real Dokku/Paddle/API/site/schema/env/network mutation. Plain
  `--deploy` is never run against production in this feature. `--check`
  against production is run once, after the fake tests are green, purely as
  HELD evidence.
- No `.github/workflows`, no NixOS activation, no secrets, no price values.
- The operator-local runner is NOT patched here; it is superseded by this
  tracked runner in documentation.

## Acceptance criteria

1. Plant suite passes (all planted old bugs fail closed; success path
   succeeds).
2. `--check` verdicts are named and exit-coded as specified; HELD never
   pushes.
3. Drift report covers the three areas; "schema untouched" appears only
   when all three are unchanged.
4. Env contract is derived from the target tree, not a local duplicate list.
5. `--deploy` success requires exact `revision === intended SHA`.
6. `make verify` + `make quality` + security/dependency/secret gates pass.
7. One `--check` run against production is recorded as HELD evidence
   (missing names only).
8. Handoff at `/tmp/proso-168-deploy-preflight-handoff.md`; merge only
   after immutable-head Codex ALLOW + required checks.
