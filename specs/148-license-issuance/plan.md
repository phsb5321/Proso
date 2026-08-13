# Feature 148 — Implementation plan

## Constitution check

| Rule | Plan evidence |
|---|---|
| Security by default | Claim secrets are never persisted; licence plaintext is hash-only; missing/weak/rotated derivation secrets fail closed; public retrieval is throttled and transaction ids never authorise. |
| Hexagonal core | Key derivation, issuance, and claim decisions live in `core/subscription`; persistence is behind ports; Nest and Prisma remain in infrastructure/adapters. |
| Fallible domain operations return `Result` | Issuance and claim return `Result<…, LicenseError>`; the controller is the HTTP translation boundary. |
| Shared contract is the product boundary | The server consumes merged main's `schemas/checkout.ts` unchanged and validates it with the existing Zod pipe. |
| Critical paths are falsifiable | Pure tests, a real PostgreSQL adapter race, and a real-AppModule HTTP journey each have a planted regression described below. |
| Deployable boots | Production configuration and both Dokku schema-release surfaces are exercised by focused tests plus `make smoke-server-boot`. |

No Gherkin is added. This is a service contract with native Jest/PostgreSQL and
HTTP acceptance oracles; a second English-to-step-definition layer would add no
live coverage.

## Layers

```text
@proso/shared (unchanged canonical transport)
  schemas/checkout.ts

packages/server
  core/subscription/license-key.ts
  core/subscription/license-issuance.service.ts
  core/subscription/license-retrieval.service.ts
             ↓ ports
  ports/license-key-repository.port.ts
  ports/subscription-repository.port.ts
             ↓ adapters
  adapters/persistence/prisma-license-key.repository.ts
  adapters/persistence/prisma-subscription.repository.ts
             ↓ composition / HTTP
  infrastructure/services/license-issuance-deps.factory.ts
  infrastructure/controllers/license.controller.ts
  infrastructure/modules/license.module.ts
```

## Issuance algorithm

1. Reject a derivation secret shorter than 32 UTF-8 bytes.
2. Read the user's one key row, active or inactive. If active, re-derive and
   verify its digest; if inactive, return an integrity error rather than expose
   or replace it.
3. If absent, generate a 32-byte key id and derive the prefixed full HMAC.
4. Call the repository's `createIfAbsent`. Prisma uses `upsert` with unique
   `userId` as conflict target; a P2002 fallback re-reads the database winner.
5. If another caller won, derive and verify the winner's key. Every successful
   caller therefore holds the key whose hash is actually persisted.

The service's first read is an optimisation, never the race guarantee. The
`LicenseKey.userId @unique` database constraint is authoritative.

## Claim algorithm

1. Look up the subscription by the unique Paddle transaction id.
2. Choose its canonical 64-character claim hash, or a valid dummy digest when
   the transaction/credential is unavailable.
3. Hash the presented claim secret and run one constant-time 32-byte digest
   comparison on every path.
4. Unless a real subscription, a canonical persisted hash, and the comparison
   all succeed, return the canonical pending value.
5. On success, call reusable issuance and return the canonical issued value.
   Only server-side derivation/integrity failure becomes HTTP 503.

The controller applies the merged request schema, maps pending to 202 and issued
to 200, and uses the registered `ThrottlerGuard`. There is no wrong-claim error
branch or rejection-specific log.

## Persistence and rollout

`Subscription` gains nullable unique `paddleTransactionId` and nullable
`licenseClaimHash`; `LicenseKey.userId` becomes unique. The subscription adapter
parses claim hashes with the canonical schema before Prisma sees them.

The repository had no migration history while both release surfaces invoked
`prisma migrate deploy`, so schema-only changes would not reach the database.
Both `Procfile` and `app.json` are aligned to `scripts/predeploy.sh`. Before
normal Prisma reconciliation, that script executes an idempotent SQL bridge
containing only Feature 148's additive columns and unique indexes. This avoids a
blanket `--accept-data-loss` flag while allowing `db push` to finish without its
unique-index warning. Duplicate user rows make index creation fail with P2002;
the bridge never deduplicates or deletes production data.

## Test strategy and falsifiers

| Oracle | What it decides | Plant that must turn it red |
|---|---|---|
| `license-key.spec.ts` | 32-byte id, full HMAC, prefix, secret floor, hash shape and constant-time primitive behavior | truncate the key body or accept a 31-byte secret |
| `license-issuance.service.spec.ts` | replay stability, hash-only storage, inactive/rotated failure, concurrent in-memory convergence | return the locally derived loser instead of the stored winner |
| `license-claim.service.spec.ts` | secret-only authorization and one pending outcome | remove the digest comparison; wrong claim becomes issued |
| `prisma-license-key.repository.spec.ts` (unit) | atomic upsert shape and P2002 convergence | replace upsert with read-then-create or drop P2002 recovery |
| `prisma-license-key.repository.spec.ts` (PostgreSQL contract) | real unique index and 32-way race | remove `@unique` from `LicenseKey.userId` |
| `prisma-subscription.repository` unit + contract | exact hash validation, real columns and transaction lookup | allow uppercase/truncated hash or omit either column |
| `license-issuance-journey.spec.ts` | real module route, canonical schema, usable key, indistinguishable unavailable response, live throttler | bypass claim verification, remove route guard, or return a key validation rejects |
| `schema-deploy.spec.ts` | both release surfaces apply the checked-in schema | restore either dead `migrate deploy` command |

The source-level claim and database-race plants are executed after the final
commit and restored before delivery; their commands and red outputs are retained
under `/tmp`.

## Out of scope

- No edit to `webhook.controller.ts`, its module wiring, or webhook tests.
- No Paddle signature, payload, price mapping, event idempotency/order, user
  creation, credit allocation, or cross-repository transaction work.
- No site or extension edit.
- No secret creation, rotation, production deployment, or migration of an
  existing derivation secret. Those are operator/integration work, not this
  reusable foundation.
