# Feature 152 — Plan

## Constitution check

| Principle | Effect on this plan |
|---|---|
| INV-001 (free tier needs no account) | The load-bearing constraint. The guard's missing-header branch returns `true` with no identity, so registering it globally cannot turn reading into a signup. The first two assertions in the suite exist to keep it that way. |
| INV-002 (BYOK on every tier) | A BYOK request still carries no licence key and stays anonymous; `TTSController`'s BYOK branch is untouched. |
| II (security by default) | The key is resolved by SHA-256, never by the raw value, and never logged. An unresolvable key is rejected rather than downgraded, and a repository failure propagates rather than being swallowed into "not a customer". |
| IV (modular architecture) | The guard is infrastructure and depends on `UserRepositoryPort`, not on Prisma. `core/` is untouched — `tests/unit/core/shared/no-nestjs-imports.spec.ts` still passes. |
| V (critical-path coverage) | The proof boots `AppModule` over a socket, because the defect lives in module registration and is invisible to a directly constructed guard. `make smoke-server-boot` covers the complementary risk: a global guard whose dependencies do not resolve kills bootstrap. |

## Approach

Three edits, each the smallest that can carry its requirement.

1. **The guard becomes optional identity.** Missing key → allow with no identity
   instead of `UnauthorizedException`. Present key → hash, resolve, attach
   `userId`, or 401. `@Public()` returns before either branch.
2. **`AuthModule` gains an import.** The guard now injects
   `UserRepositoryPort`, and a global guard resolves its dependencies in the
   context of the module that declares `APP_GUARD`. `LicenseModule` already
   binds and exports that port to the Prisma adapter, so importing it is the
   correct wiring — re-binding the port here would create a second instance of
   the same repository for no reason.
3. **`AppModule` imports `AuthModule`.** The one-line change the whole feature
   exists for.

Rejected: a `@UseGuards` decorator per controller. It is the same defect with
more surfaces to forget, and it cannot express "every route except the public
ones".

## Falsifiability

The acceptance suite is written so that the original defect reproduces it. With
`AuthModule` removed from `AppModule.imports`:

- `attaches the repository user id when a valid key is presented` → `userId`
  null;
- `resolves the key by SHA-256 hash` → no lookup happened at all;
- `lets a shipped route bill the identified user` → 401 instead of 200;
- `rejects an unrecognised key with 401` → 200, the silent downgrade.

The four account-free assertions stay green, which is the point: the defect was
invisible to anyone who only read without paying.

## Risks

- **A global guard that cannot resolve its dependencies kills the server at
  boot,** and no unit test executes bootstrap. Mitigated by
  `make smoke-server-boot` against the built `dist/main.js`.
- **A key presented to a route that does not need one now 401s.** Accepted and
  tabulated in the spec; the extension only sends the header when a key is
  configured.
- **Identity lookup on every keyed request is a database read per request.** No
  cache is introduced here: correctness first, and the repository call is a
  single indexed lookup. Revisit if the money path ever carries load.
