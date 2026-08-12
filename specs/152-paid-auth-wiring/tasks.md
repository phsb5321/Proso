# Feature 152 — Tasks

- [x] **T-001** Reproduce the defect from the module graph, not from prose:
  `grep -rn AuthModule packages/server/src` returns only the declaration.
- [x] **T-002** Rewrite `LicenseKeyGuard` as optional identity — `@Public()`
  bypass, missing key allowed anonymously, present key resolved by SHA-256
  through `UserRepositoryPort`, unresolved key `401`. (FR-002..FR-005)
- [x] **T-003** Import `LicenseModule` into `AuthModule` so the global guard can
  inject `UserRepositoryPort`.
- [x] **T-004** Import `AuthModule` into `AppModule`. (FR-001)
- [x] **T-005** Write `tests/integration/license-key-identity.spec.ts`: boot the
  real `AppModule` over a listening socket, substitute only Prisma and the
  repository ports, assert all four states plus health and
  `/api/v1/license/validate`. (FR-006)
- [x] **T-006** Run the falsifier — remove `AuthModule` from `AppModule` and
  record which assertions go red.
- [x] **T-007** Verify the built artifact still bootstraps with a global guard
  (`node scripts/smoke-server-boot.mjs`).
- [x] **T-008** Run the server suite, Biome, and `tsc --noEmit`; record the one
  environment-gated failure and how it was resolved.

## Executed evidence

```bash
# acceptance — 9 passed
cd packages/server && npx jest --runInBand tests/integration/license-key-identity.spec.ts

# falsifier — AuthModule removed from AppModule.imports
# Tests: 4 failed, 5 passed, 9 total

# whole server suite — 439 passed, 27 suites
# (the two testcontainer contract suites need the NixOS Prisma engine:
#  PRISMA_SCHEMA_ENGINE_BINARY=$(nix build --no-link --print-out-paths \
#    nixpkgs#prisma-engines)/bin/schema-engine)

pnpm exec biome check packages/server/src packages/server/tests/integration/license-key-identity.spec.ts
pnpm --dir packages/server exec tsc --noEmit
pnpm --filter '@proso/server...' build && node scripts/smoke-server-boot.mjs
pnpm exec depcruise --config .dependency-cruiser.cjs packages services scripts --output-type err
```

`node scripts/quality/knip-ratchet.mjs` fails identically on a clean `main`
(`8ad9539`, run in the main worktree) for two extension-side entries: a new
`SentenceTooLongError` unused export and a stale `loadApiKeys` baseline row.
Neither is touched by this feature.
