# Quickstart: Clean Server Bootstrap Proof

## RED

```bash
test ! -e packages/shared/dist/index.js
nix shell nixpkgs#gnumake --command make smoke-server-boot
```

Expected before the fix: the server build cannot resolve `@proso/shared` because its
ignored `dist/**` output does not exist.

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
