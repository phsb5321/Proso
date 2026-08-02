# Quickstart: Clean Server Bootstrap Proof

## RED

```bash
nix shell nixpkgs#gnumake --command make bootstrap
test ! -e packages/shared/dist/index.js
nix shell nixpkgs#gnumake --command make smoke-server-boot
```

Expected before the fix: bootstrap installs the workspace without creating shared's
ignored `dist/**` output, then the server build cannot resolve `@proso/shared`.

## Minimum implementation

The root Make target selects `@proso/server...`, reusing pnpm's workspace dependency
graph. Do not add a prebuild script, dependency, package change, or workflow step.

## GREEN

Replay the same command from the same clean-state premise. The log must show shared
and server builds and `scripts/smoke-server-boot.mjs` must observe HTTP. Without
PostgreSQL, HTTP 503 is expected and accepted.

## Scope guard

```bash
git diff --check
git diff --name-only origin/main...HEAD
pnpm --filter '@proso/server...' list --depth -1
nix shell nixpkgs#gnumake --command make docs
```

The implementation must not touch `.github/workflows`, packages, runtime source,
Notes, secrets, services, tokens, or sync state.
