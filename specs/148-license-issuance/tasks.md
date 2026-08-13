# Feature 148 — Tasks

- [x] **T001 — Consume the canonical transport.** Use merged main's
  `@proso/shared/schemas/checkout.ts` request, response, hash schema, and route
  without editing or duplicating them. (FR-006)
- [x] **T002 — Add secure claim persistence.** Add nullable unique transaction
  routing id and nullable claim hash to `Subscription`; extend the port and
  Prisma adapter; reject non-canonical hashes. (FR-010)
- [x] **T003 — Enforce one key row per user.** Make `LicenseKey.userId` unique
  and add the licence-key repository port plus Prisma atomic upsert/P2002
  convergence. (FR-001)
- [x] **T004 — Implement key primitives.** Generate 32 random bytes, derive the
  full HMAC-SHA256 with live/test prefix, hash plaintext for storage, and compare
  SHA-256 digests in constant time. (FR-003..FR-005)
- [x] **T005 — Implement reusable issuance.** Ensure/re-derive one active key,
  adopt a concurrent winner, and reject weak/rotated secrets or inactive rows
  through `Result`. (FR-002, FR-005)
- [x] **T006 — Implement fail-closed claim.** Route by transaction id, authorise
  only by the claim secret, align unavailable crypto paths, issue on a proven
  claim, and return one pending value otherwise. (FR-007, FR-008, FR-011)
- [x] **T007 — Expose and compose the endpoint.** Add the canonical POST route,
  HTTP status mapping, repository/config wiring, and real Nest throttler at five
  requests per minute. (FR-006, FR-009)
- [x] **T008 — Make schema rollout real.** Point both Dokku release surfaces at
  one predeploy script, apply an idempotent feature-scoped SQL bridge, then run
  normal `db push` without blanket data-loss acceptance; pin that wiring.
  (FR-012)
- [x] **T009 — Add deterministic unit coverage.** Cover derivation, secret
  floor/rotation, replay, inactive rows, malformed claim fields, wrong/unknown
  claims, atomic upsert shape, and P2002 recovery.
- [x] **T010 — Add real persistence coverage.** Run 32 concurrent issuance
  attempts against PostgreSQL, assert one row and one winner, assert direct
  duplicate P2002, and persist/read the real claim columns.
- [x] **T011 — Add the seeded HTTP journey.** Boot the real AppModule over a
  socket with in-memory persistence; claim, validate, compare unavailable
  responses, validate canonical request rejection, and observe throttling.
- [x] **T012 — Remove partial activation work.** Keep `webhook.controller.ts`
  and `subscription.module.ts` unchanged and remove webhook-specific tests and
  activation claims. Plane #38 owns the complete integration.
- [x] **T013 — Execute falsifiers.** Removing `!claimMatches` made the focused
  wrong-claim test exit 1 because it received `issued` instead of `pending`;
  exact restoration made the same command exit 0. Receipts:
  `/tmp/proso-148-claim-falsifier-{red,green}.log`, SHA-256
  `dccdcb3eded2b60b5a333003560a474186814691e0528260d402d810bb46446e`
  and `4a6678a72c6352d989df03db7f3e08cea8da8b774de01fa8fabbfbbd9a7b3e78`.
  The database side is pinned by P2002 injection, 32 concurrent real-Postgres
  upserts, a direct duplicate-row P2002, and a predeploy bridge run that rejects
  contradictory duplicate users with P2002.
- [x] **T014 — Verify.** Prisma generation passed through the NixOS engine
  fallback; focused checks passed 102/102, the full server suite 511/511, and
  real PostgreSQL contracts 25/25. Changed-line coverage was 120/125 (96%);
  static checks, build/boot smoke, dependency scan, seeded fuzz
  (`FC_SEED=20260730`), checkout surface 13/13, and its plants 8/8 passed.
  `make verify` and `make verify-full` were invoked and both stop on the same
  seven extension formatting findings present on clean `origin/main`; `make
  quality` likewise stops on main's same new/stale Knip pair. The Firefox
  diagnostic passed, after which `make user-gate` correctly returned its
  repository contract's `BLOCKED` exit 2 rather than skipped-green.
- [x] **T015 — Different-family gate.** DeepSeek Sentinel returned `ALLOW` on
  the security-relevant implementation at `e14e6dd` after 511/511 server checks
  and 25/25 real PostgreSQL checks. Later edits do not change claim, race,
  schema, rate-limit, derivation, or rotation behavior: they preserve Feature
  152's combined harness, record evidence, keep a 503-only error code local to
  the server, and synthesize deterministic test secrets without literals.
- [ ] **T016 — Deliver without merge.** Commit, rebase onto `origin/main`
  preserving Feature 152's auth module changes, push, open the PR, and stop
  before merge as explicitly requested.
