# Feature 164 — Subscription deployment rehearsal

## Goal

Turn the merged subscription implementation into reproducible deployment evidence without contacting
Paddle or any deployed Proso service. One local command must start from the pre-commerce database
shape, apply the checked-in release schema path, start the built server, and prove the complete
account-free purchase fulfilment boundary plus its failure semantics.

## User outcomes

### A completed purchase survives deployment realities

A correctly signed canonical purchase creates exactly one Paddle-bound user, paid subscription,
period allocation, active hash-only licence, and durable event marker. Before fulfilment the buyer's
claim receives the canonical pending response; afterwards the same claim receives a usable key.

### Retries stay safe across process restarts

Restarting the server and replaying the same provider event acknowledges the replay without another
user, allocation, key, or marker.

### Failed fulfilment remains retryable

A failure immediately before commit returns a service error and leaves no partial commerce state.
Retrying the same event after the fault is removed completes once.

## Requirements

- **FR-001 — Disposable boundary.** The rehearsal uses only loopback and a disposable PostgreSQL
  container. It performs no production, Dokku, Paddle, release, workflow, or live-site action.
- **FR-002 — Historical starting point.** The database starts from the exact pre-commerce schema
  tracked at commit `087607c`; it does not start from the current Prisma schema.
- **FR-003 — Exact release path.** The rehearsal invokes `packages/server/scripts/predeploy.sh`,
  whose bridge → Prisma reconciliation → bridge sequence is the deployed schema path. A test-only
  path override may relocate `/app` to the local package root without changing command order.
- **FR-004 — Real deployable.** Workspace dependencies build in order (shared before server), and
  the rehearsal starts `packages/server/dist/main.js` with the real `AppModule` under production
  validation and dummy non-live environment values.
- **FR-005 — Authentic canonical bytes.** The HTTP webhook body comes from the checked-in canonical
  `transaction.completed` fixture. Its claim hash is adapted to the rehearsal secret before the
  final bytes are signed; those exact bytes are sent unchanged with a valid Paddle HMAC.
- **FR-006 — Account-free claim.** Before webhook delivery the claim endpoint answers exactly
  `202 { status: 'pending', retryAfterMs: 2000 }`. After delivery it answers `200 issued`, and the
  returned key validates as the configured paid tier with the expected credits.
- **FR-007 — Atomic exactly-once state.** The committed database contains one Paddle customer user,
  subscription, source allocation, active licence key, and event marker. It contains claim/key
  hashes only, never the plaintext claim secret or licence key.
- **FR-008 — Restart replay.** A fresh server process on the same database accepts replay of the
  exact event and preserves all exactly-once counts.
- **FR-009 — Rollback/retry.** A deterministic pre-commit fault produces HTTP 503 with zero rows in
  every commerce table; retrying the same bytes without the fault succeeds once.
- **FR-010 — Falsifiable deploy path.** Plant mode bypasses the checked-in predeploy command. The
  rehearsal must detect the missing database-only claim-pair constraint and fail non-zero.
- **FR-011 — Secret-safe evidence.** Logs and receipts identify steps and digests but never print
  dummy secrets, plaintext licence keys, claim secrets, database passwords, or raw webhook bodies.
- **FR-012 — Missing prerequisites block.** Missing Docker, PostgreSQL readiness, Prisma engine,
  build output, or schema application is a failure, never a skipped-green result.

## Acceptance criteria

This is a service-to-service HTTP/PostgreSQL contract. Native shell, Node HTTP, and SQL assertions
are the maintained runner; adding Gherkin would duplicate the executable boundary.

- `make subscription-deploy-rehearsal` exits 0 and writes a receipt under
  `.artifacts/subscription-deploy-rehearsal/` bound to the tested Git head.
- `node scripts/subscription-deploy-rehearsal.mjs --plant skip-predeploy` exits non-zero because the
  required `Subscription_paddle_claim_pair_check` is absent.
- The green run observes pre-commerce → exact predeploy, pending → issued claim, paid validation,
  restart replay, and injected-fault rollback → retry in one deterministic command.
- Stopping the database, removing the built server, or making PostgreSQL/Prisma unavailable fails
  loudly rather than reporting PASS.

## Non-goals

- Paddle sandbox/live network traffic, catalog provisioning, KYC, credentials, or business setup.
- Production/Dokku deployment, schema application to production, live probes, or site publication.
- Browser checkout/extension acceptance; those surfaces retain their own actor gates.
- New runtime dependencies, abstractions, workflow files, CODEOWNERS, releases, or site config.
