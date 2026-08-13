# Feature 164 — Implementation plan

## Constitution check

| Rule | Plan evidence |
|---|---|
| Security by default | Dummy secrets remain process-local and redacted; the gate sends exact signed bytes only to loopback and stores only hashes. |
| Hexagonal architecture | No production domain layer changes. A test-only composition override is confined to the existing persistence adapter boundary. |
| Fallible operations fail closed | The shell/Node runner propagates every command, HTTP, process, Docker, and SQL failure; missing prerequisites never skip. |
| Credit correctness | One real PostgreSQL transaction is checked for exactly one source allocation, and an injected pre-commit failure must leave zero rows. |
| Built deployable starts | The gate builds shared then server and starts the real `dist/main.js`/`AppModule` under production env validation. |
| No production action | The runner rejects non-loopback database URLs, creates its own disposable container/network state, and never imports deploy tooling. |

No Gherkin is added: this is a service-to-service contract with executable HTTP, process, Docker,
and PostgreSQL oracles.

## Gap decision

The existing `paddle-provisioning-journey.spec.ts` already proves signed raw HTTP, AppModule
composition, PostgreSQL persistence, restart-like module recreation, and transactional fault
injection. It does **not** prove the deployed bootstrap or schema path:

- it starts `Test.createTestingModule`, not `dist/main.js`;
- its helper applies the current schema directly with `prisma db push`;
- it never starts from the pre-commerce schema;
- it never invokes `scripts/predeploy.sh`;
- its restart is an in-process application recreation, not a fresh built server process.

Feature 164 therefore adds one narrow release-boundary runner and reuses all existing production
scripts, fixtures, modules, and Docker/PostgreSQL availability. No dependency or new domain
abstraction is introduced.

## Rehearsal topology

```text
Node orchestrator
  -> docker run postgres:16-alpine (127.0.0.1, random host port)
  -> psql applies exact schema from git show 087607c
  -> sh packages/server/scripts/predeploy.sh
       (PROSO_APP_ROOT relocates /app only for local execution)
  -> pnpm build @proso/shared, then @proso/server
  -> node packages/server/dist/main.js (real production bootstrap)
       -> signed canonical transaction.completed bytes
       -> PostgreSQL state + account-free claim/validate HTTP
  -> stop/start a fresh dist/main.js process; replay exact bytes
  -> a fault-enabled dist/main.js process; 503/zero rows; clean retry
```

## Minimal seams

### Relocatable predeploy root

`predeploy.sh` keeps `/app` as its default. `PROSO_APP_ROOT`, when explicitly supplied by the local
rehearsal, changes only where the checked-in config/schema/bridge files are found. Command order and
Prisma operations remain identical. This avoids copying or reimplementing the release path.

### Environment-only fault injection

`PrismaPaddleProvisioner.beforeCommit()` already exists solely as the rollback test seam. The
rehearsal enables it with a dedicated non-production environment flag read at that boundary. The
runner starts a fresh process with the flag for exactly one attempt, stops it, proves zero rows,
and restarts without the flag for retry. The production default remains inert.

## Canonical payload and claim flow

The runner reads `packages/server/tests/fixtures/paddle/transaction-completed.json`, preserves its
shape, and changes only `data.custom_data.license_claim_hash` to SHA-256 of a process-local dummy
claim secret. After serialization, it signs and sends that exact byte buffer. No Paddle network or
SDK is called.

Claim calls are deliberately limited to two per server process/window: one pre-webhook canonical
202 and one post-webhook issued 200. This stays below the real 5/min/IP throttle. The gate does not
try to exercise the sixth request because doing so would impose a 60-second delay on every full
verification run; the existing controller/integration coverage pins the throttle wiring. Event
counts equal distinct delivered event ids: this single-event rehearsal expects one event row, not
one row per transaction in the general case.

## Assertions

1. Predeploy emits both bridge phases and normal Prisma reconciliation.
2. The resulting catalog contains every commerce table/index and the database-only claim-pair
   check; the legacy `User.licenseKey` column is nullable.
3. Production boot with a short licence secret exits before listening; a strong dummy secret boots.
4. Claim before delivery is byte-shape canonical pending 202.
5. Exact signed fixture delivery returns 200.
6. DB state is one user/subscription/allocation/key/event; customer/price identity is provider/
   operator-derived; only 64-hex hashes are stored.
7. Claim after delivery is issued 200; validate reports Pro and 500,000 credits.
8. A new process on the same DB replays the same event to 200 with unchanged counts.
9. Fault process returns 503 and all commerce tables remain empty; clean process retry returns 200
   and all counts become one.
10. Receipt/log secret scan finds none of the process-local plaintext values.

## Plant

`--plant skip-predeploy` intentionally applies only the current Prisma schema after the legacy
schema. Prisma cannot express `Subscription_paddle_claim_pair_check`, so the schema oracle must
fail. A plant that reaches PASS invalidates the runner.

## Artifacts

`.artifacts/subscription-deploy-rehearsal/receipt.json` records schema version, tested head,
pre-commerce commit, fixture path/hash, commands as named phases, counts, HTTP statuses, process
restart, rollback/retry, plant state, and UTC completion time. It records no values from secret-
bearing environment variables or issued bodies.
