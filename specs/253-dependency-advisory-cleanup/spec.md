# 253 — Dependency advisory cleanup

Verified on 20/09/2026 in `proso-253-dep-ratchet`, Node 22.23.2 / pnpm 10.30.3.
Local commit only; no push, PR, release, or deployment requested.

## Policy and scope

Follow [244](../244-dependency-clock-remediation/spec.md): version-qualified
overrides, one selector per affected package, fixes instead of new exceptions,
and removal of stale advisory fingerprints. The existing override configuration
is `package.json#pnpm.overrides`; `pnpm-workspace.yaml` only declares workspaces.
Exact fixed versions minimize resolution churn. Existing fixed versions outside
the selectors are unaffected.

Hypothesis: fixed transitive versions preserve their consumers without application
changes. Falsifiers: consumer API/load failures, failing tests, or advisories still
reported on an upgraded version. A blanket uuid override was rejected because the
legacy request consumer uses an API absent from uuid 11.

## Dependency chains and decisions

Chains were checked with `pnpm -r why uuid deepmerge-ts adm-zip image-size request`,
the root lockfile, installed consumer source, and `pnpm audit --json`.

| Package | Real consumers | Decision |
| --- | --- | --- |
| uuid 8.3.2 | Extension/server Jest → node-notifier; extension web-ext and WXT → web-ext-run → node-notifier | `uuid@>=8.0.0 <11.1.1` → 11.1.1 |
| uuid 10.0.0 | Server → @testcontainers/postgresql → testcontainers → dockerode | Same override → 11.1.1 |
| uuid 3.4.0 | Extension → web-ext → sign-addon → request | Retain: request imports `uuid/v4` in auth, OAuth, and multipart modules. uuid 11.1.1 rejects that subpath with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Removing this advisory requires a compatible consumer migration beyond this cleanup's explicit request freeze. |
| deepmerge-ts 7.1.5 | Server → prisma → @prisma/config (also reachable through @prisma/client's Prisma peer) | `deepmerge-ts@<8.0.0` → 8.0.0 |
| adm-zip 0.6.0 | Extension → web-ext → firefox-profile 4.3.2; extension → WXT (also through @wxt-dev/unocss) → web-ext-run → firefox-profile 4.7.0 | Replace the old selector with `adm-zip@<0.6.1` → 0.6.1 |
| image-size 1.2.1 | Extension → web-ext → addons-linter | Unchanged: both high advisories still report patched versions `<0.0.0` (no fix). Existing exact-path exceptions retained. |
| request 2.88.2 | Extension → web-ext → sign-addon | Unchanged: moderate SSRF advisory still reports patched versions `<0.0.0` (no fix); explicitly outside the requested changes. |

The deepmerge-ts exception's CommonJS rationale no longer holds for the installed
Prisma 7.3.0: `@prisma/config` dynamically imports deepmerge-ts in
`loadConfigTsOrJs`. Loading the actual `prisma/prisma.config.ts` with 8.0.0 succeeds.
The [uuid 11.1.1 export map](https://github.com/uuidjs/uuid/blob/v11.1.1/package.json)
also confirms the legacy subpath incompatibility.

Remove four stale OSV entries (uuid 8/10, deepmerge-ts 7, adm-zip 0.6.0) and the
deepmerge-ts audit allowlist entry. Preserve the remaining baseline expiry,
30/10/2026, and document uuid 3's consumer constraint. No new suppressions or
gate changes. The live adm-zip feed includes a new high advisory
GHSA-7q85-xj36-vmfc fixed in 0.6.1; neither it nor the older moderate
GHSA-vwc7-r8mq-g2x9 is reported after the bump.

## Verification receipts

Logs are local files under `/tmp/proso-253-*`; they are not committed artifacts.

| Command | Exit / observed result | Receipt |
| --- | --- | --- |
| `pnpm install` (initial and after overrides) | 0 / prepared WXT types; existing peer/build-script warnings retained | `install.log`, `update.log` |
| `pnpm install --frozen-lockfile` | 0 / manifest and lock agree | `frozen-install.log` |
| `make doctor` before bootstrap | 2 / missing generated Prisma client | `doctor-before.log` |
| `./scripts/generate-prisma.sh` | 0 / native NixOS engine download initially 404; the script's Nix engine fallback generated Prisma 7.3.0 successfully | `prisma.log` |
| `pnpm --filter @proso/shared build` | 0 | `shared-build.log` |
| `pnpm -r lint` | 0 / extension reports 68 warnings | `lint.log` |
| `NODE_OPTIONS=--experimental-vm-modules npx jest --selectProjects unit` in packages/extension | 0 / 136 suites and 2819 tests passed; 1 existing skipped suite/test; worker teardown warning | `extension-unit.log` |
| `PRISMA_SCHEMA_ENGINE_BINARY=<Nix schema-engine> pnpm --filter @proso/server test` | 0 / 37 suites, 506 tests passed, including database contracts and the Paddle integration journey | `server-test.log` |
| `node /tmp/proso-253-consumers.mjs` | 0 / both firefox-profile versions encode ZIP preferences that adm-zip reads back; real Prisma config loads; notifier/dockerode uuid v4 calls work; legacy uuid/v4 works only on the retained request chain | `consumers.log` |
| `pnpm audit --json` before/after | 1 both times / fixed package hits removed; four advisory records remain: request, legacy uuid, image-size ×2 | `audit-before.json`, `audit-after.json` |
| `make dependencies` before baseline trimming | 2 / correctly rejects exactly four stale entries, no new findings | `osv-before-trim.log` |
| `make dependencies` after trimming | 0 / 4 known advisories, 0 new | `dependencies.log` |
| `./scripts/dependency-audit.sh` | 0 / 2 existing image-size paths allowlisted, 0 failures; pathless advisory self-test passes | `dependency-audit.log` |
| `make verify` in ambient shell | 2 / format, lint, types, reader smoke, server boot, builds, 44 security tests, secret scan and audit passed; brand-assets then failed on missing Python uharfbuzz | `verify.log` |
| `nix-shell --run 'make verify'` | 2 / previous checks plus brand-assets, icons and 45 preflight assertions passed; final AMO self-test failed on its stale 1.2.11 fixture versus the extension's 1.2.12 | `verify-nix.log` |

The npx invocation used a writable npm cache under the worktree's ignored
`node_modules/.cache/npm`. Server tests used
`/nix/store/87b89pq0x0cqj22iblj18xdmafcsr2p9-prisma-engines_7-7.10.0/bin/schema-engine`,
resolved by the repository's generation fallback.

The final fast-floor blocker is existing fixture drift in
`scripts/amo-publication-check.self-test.mjs:12`, which hard-codes 1.2.11 while
`packages/extension/package.json` declares 1.2.12. Both files and the publication
checker are unchanged from the starting HEAD. These scripts use Node built-ins,
not the upgraded dependencies. Follow-up: derive the positive fixture and older
version plant from the package version so subsequent releases do not rot it.
No live Mozilla publication was attempted by this local fixture test.

## Remaining risk

uuid and deepmerge-ts cross major versions outside their parents' declared ranges.
The exercised consumer APIs pass, but this is not evidence of a production
deployment or Mozilla signing run. The uuid 3.4.0 advisory deliberately remains;
this is partial uuid remediation, not an advisory-free dependency tree. request
and image-size remain vulnerable upstream. No application code, direct dependency
versions, request/image-size lock entries, or browser behavior was changed.

`make verify-full`, model review, and loaded-browser acceptance were not run.
Reversal after the local commit: `git revert HEAD` while that commit remains HEAD.
