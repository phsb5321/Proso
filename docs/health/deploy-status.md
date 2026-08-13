# Proso Deploy Status — Dokku Seat (living doc)

**Owner**: Dokku deploy seat (`w2:pJ`) — created 12/08/2026.
**Purpose**: track the server deploy state, the deploy-automation gap it
mitigates, and the standing duty that keeps merged server code on the host.
Update this doc on every deploy (or state why no deploy was needed).

## The gap this seat is a manual mitigation for

**PROSO #25 — deploy automation missing.** The GitHub Actions pipeline has been
in `startup_failure` since 05/08/2026, so no automated deploy path exists. Until
that is restored (or a separate deploy workflow is approved), the Dokku seat is
**the deploy path**: a human-operated agent seat that checks, deploys, and
verifies against reality.

The repeatable runner lives at **`~/.local/bin/proso-dokku-deploy`** (local
tooling, deliberately NOT in `.github/workflows` — deploy automation there is a
separately gated decision). It:

1. compares deployed SHA (`git ls-remote dokku main`) vs `origin/main`;
2. deploys only when `packages/server` or `packages/shared` changed;
3. gates on server build + unit tests (contract tests excluded — known
   local-only Prisma engine 404 for `linux-nixos`);
4. `git push dokku main`, watching for the deploy-lock failure mode
   (`dokku-event-listener` rebuild loop — do not fight it, report it);
5. verifies `/health` + the corrected 402 copy (the deploy's done-criterion);
6. advisories on `proso-log-gateway` staleness/divergence.

**`/health` revision field (Feature 165, introduced 13/08/2026).** The
`/health` response additionally returns `revision`: the trimmed
`GIT_REV` process variable Dokku injects into the container, or `null` when
the platform supplied nothing. `version` stays the semantic package version
and must never be used to identify a deployment. Verification MUST fail
closed when `revision` is null or does not equal the pushed SHA — an old
container answers `/health` identically to the new one and a null revision
cannot be distinguished by `version` alone.

Log: `~/.local/state/proso-dokku/deploy.log`. Run `--check` for report-only.

## Current state (updated 12/08/2026)

| App | Deployed SHA | main SHA | State |
|---|---|---|---|
| proso-api | `e6b412f` | `beec2ac` | ✅ in sync (server) — deploy verified 12/08 14:50 BRT; 5 commits ahead are extension-only (#139/#138/#140/#141/#142) |
| proso-log-gateway | `3908f3c` | — | ⚠️ stale since 30/07 — remote **diverged** (pre-monorepo lineage, parent `e01fa91` not in main's history) |

### proso-api deploy history

| When (BRT) | Deployed | Shipment | Verification |
|---|---|---|---|
| 12/08 11:52 | `7e4cda0` → `e6b412f` | #137 402 copy (BYOK-free + local host), #86 entitlement failures, #121/#117 knip ratchets | health ok, 402 copy asserted live; migrations identical |

### proso-log-gateway blocker

Deploy blocked by a **diverged git remote**: `dokku-gateway/main` sits on the
pre-monorepo lineage; `git push` is rejected non-fast-forward and force-pushing
to Dokku is forbidden by seat rules. `build-dir` was cleared on the host
(12/08) so the root-context Dockerfile builds cleanly — **the moment the host
ref is reset to main's lineage, `git push dokku-gateway main` works**.
Resolution is Pedro-gated (host-side `git reset --hard` in
`/home/dokku/proso-log-gateway`).

## Standing duty

Whenever `main` gains server-affecting commits (`packages/server`,
`packages/shared`, migrations), deploy them — do not wait to be asked. Run
`~/.local/bin/proso-dokku-deploy` (plain = deploy if stale; `--check` = report).
Then update this table.
