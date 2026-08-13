# Feature 165 — Runtime revision truth in `/health`

**Status**: in progress (13/08/2026)
**Owner**: Dokku deploy seat `w2:pJ`
**Branch**: `165-health-revision` (from `bb699b3`)

## Problem

Deployment verification is unsound: the running application's `/health`
response cannot identify its deployed git revision. `version` is a semantic
product version hardcoded from `npm_package_version` (`1.0.0`), which cannot
distinguish two deployments of the same package version. Dokku already injects
`GIT_REV` into the container environment, but no public response reports it.

Consequence (measured in the 13/08 deploy-hold audit): after a failed deploy,
an old container answers verification requests identically to the new one, so
a post-deploy check can pass against the wrong deployment.

## Falsifier (checked first, 13/08 15:03 BRT)

If an existing public response already reported the actual runtime `GIT_REV`
and a runnable test proved it, this feature must make no duplicate change.
**Result: no consumer exists.** `git grep GIT_REV|revision bb699b3 --
packages/server/src` is empty. The change is not a duplicate.

## Solution

Smallest backward-compatible server change:

1. `/health` gains a clearly named `revision` field.
2. Its value is sourced **only from process configuration**
   (`process.env.GIT_REV`, trimmed) — never from request input, never from the
   `version` constant.
3. Explicit safe fallback when the platform did not supply it: `revision:
   null`. Verification tooling must fail closed on null; `version` must never
   impersonate a revision.
4. `version` semantics are preserved unchanged. All existing response fields
   (`status`, `version`, `uptime`, `details`) are preserved.

## Non-goals

- No changes to the operator-local runner (`~/.local/bin/proso-dokku-deploy`).
- No CI/workflow, CODEOWNERS, release, site, Paddle, schema, or env changes.
- No shared-package schema change (the API consumer is curl/manual).

## Acceptance criteria

1. `GET /health` returns `revision` alongside the existing fields.
2. With `GIT_REV=<40-char sha>` set: `revision === <sha>`.
3. With `GIT_REV` unset or whitespace-only: `revision === null`.
4. Plant/falsifier test: an implementation that reports the hardcoded/package
   `version` (or any request-derived value) as `revision` fails the suite.
5. `version` stays `1.0.0` (or the package version) in every case.
6. Server suite: measured local baseline before this feature is
   **411 passing, 8 suite-level failures** (3 contract, 3 integration,
   2 unit-persistence — all Postgres/Prisma-engine local-only failures).
   This feature must not reduce the passing count; its new tests pass locally.
7. `make verify` passes (fast deterministic floor).
8. `docs/health/deploy-status.md` describes the field honestly (and only that
   doc is updated).
