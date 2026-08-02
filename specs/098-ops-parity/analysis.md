# Engineer RED/GREEN Evidence

**Captured**: 02/08/2026 13:59 BRT

**Worktree**: `proso-098-ops-parity`

**Bootstrap HEAD**: `8d0abea483ff93c3fdf4070302f40bbf84682015`

## Hypothesis and falsifier

The clean server smoke fails because `@proso/shared` exports ignored build output that
does not exist after dependency installation; selecting `@proso/server...` makes pnpm
build the workspace dependency before the server. The hypothesis is false if bootstrap
creates shared output, the recursive filter omits shared, or the replay still reports
shared module resolution errors.

## Clean premise and causal RED

1. `nix shell nixpkgs#gnumake --command make bootstrap` completed successfully.
2. `packages/shared/dist/index.js` remained absent after bootstrap.
3. `nix shell nixpkgs#gnumake --command make smoke-server-boot` exited 2 after
   `pnpm --filter @proso/server build`; TypeScript reported 44 errors, including repeated
   TS2307 failures to resolve `@proso/shared`.

An earlier pre-bootstrap attempt failed at `nest: command not found`; it was discarded as
non-causal evidence and is not the retained RED.

## Minimum implementation and GREEN

The only implementation change replaces the Make recipe's server-only filter with
`pnpm --filter '@proso/server...' build`.

Replaying `nix shell nixpkgs#gnumake --command make smoke-server-boot` exited 0 and logged:

```text
Scope: 2 of 6 workspace projects
packages/shared build$ tsc -p tsconfig.build.json
packages/shared build: Done
packages/server build$ nest build
packages/server build: Done
ok  built server present — packages/server/dist/main.js
ok  server bootstrapped and is routing — HTTP 503 on /health
```

The GREEN creates `packages/shared/dist/index.js`, proving the dependency build occurred.

## Focused verification

- `git diff --check` — passed.
- `pnpm --filter '@proso/server...' list --depth -1` — selected exactly
  `@proso/server` and `@proso/shared`.
- `nix shell nixpkgs#gnumake --command make docs` — passed: six owned documents, no
  expired reviews or broken links.
- `nix shell nixpkgs#gnumake --command make -n smoke-server-boot` — printed the recursive
  filter followed by the smoke script.

No workflow, package manifest, runtime source, browser, Notes, service, token, secret, or
sync state was modified.
