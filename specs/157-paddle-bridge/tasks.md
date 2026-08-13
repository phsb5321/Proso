# Feature 157 — Tasks

- [x] **T001 — Pin the verified contract.** Add raw-body HMAC verification with
  a five-second injected clock, multiple `h1` support, strict envelope parsing,
  and 403 translation. (FR-001)
- [x] **T002 — Define the domain command.** Normalize supported Paddle events,
  exact four-price entitlement, customer identity, periods, status, ordering,
  and claim shape through typed `Result`; classify unsupported events. (FR-003
  through FR-006, FR-009, FR-012)
- [x] **T003 — Add persistent schema invariants.** Add Paddle customer identity,
  event ledger, source transaction uniqueness, ordering fields, nullable legacy
  licence storage, and claim-pair deployment checks. (FR-002, FR-006, FR-007,
  FR-011)
- [x] **T004 — Implement one atomic adapter.** In one serializable Prisma unit
  of work, insert the marker, upsert customer/subscription, converge state,
  fill claim routing, allocate once, ensure one active hash-only key, and roll
  back on every fault. (FR-002, FR-005 through FR-009)
- [x] **T005 — Compose retry-truth HTTP.** Replace controller-level repository
  composition with the domain processor and atomic port; return 200 only for
  committed/duplicate/unsupported outcomes and 5xx for processing errors.
  (FR-008, FR-009)
- [x] **T006 — Remove pretend billing operations.** Delete the fake checkout
  route and unused lookup/cancel port surface; remove the in-memory idempotency
  service as a correctness mechanism. (FR-002, FR-010)
- [x] **T007 — Add deterministic unit coverage.** Cover byte mutation, stale and
  future timestamps, rotated signatures, malformed envelopes, exact price
  mapping, buyer metadata mismatch, unknown/mixed prices, status/date/claim
  validation, and safe failures. The four current official Paddle schemas and
  adapted canonical examples are pinned in `tests/fixtures/paddle` and exercised
  by `paddle-canonical-fixtures.spec.ts`, including created-only
  `transaction_id` and canceled-null-period behavior. (FR-001, FR-003 through
  FR-006, FR-012)
- [x] **T008 — Add real PostgreSQL HTTP acceptance.** Boot the real AppModule
  with raw-body capture and PostgreSQL; prove provisioning-to-claim-to-paid-
  validation, restart duplicate handling, pre-commit rollback/retry, unknown
  price rollback, both delivery orders, and older-event non-regression.
  (FR-002 through FR-009, FR-011)
- [x] **T009 — Execute mechanical falsifiers.** Exact-byte mutation and the
  injected pre-commit fault are retained in the real HTTP suite. Removing the
  event-id primary key made restart replay persist two event rows (red receipt
  `/tmp/proso-157-event-uniqueness-red.log`, SHA-256
  `53413df50778632bdb13c75b25c2d2d9ba845ef814617f396b07d08ee26d5aa6`).
  Removing Pro yearly from the exact catalog made the four-map oracle red
  (`/tmp/proso-157-price-mapping-red.log`, SHA-256
  `b87ec0334f181729117a3b44e9a9aa5fa318cd0de28944edfdf5fb08fa4853a2`).
  Both files and generated Prisma were restored byte-for-byte; focused green
  receipts are `/tmp/proso-157-focused-postgres-green.log` and
  `/tmp/proso-157-focused-price-green.log`.
- [x] **T010 — Run deterministic gates.** Prisma generation used the NixOS
  engine fallback. After rebasing onto `origin/main@00b9e81`, `make verify-full`
  passed with 498/498 server tests, 91%+ changed-line coverage, all builds and
  static ratchets (`/tmp/proso-157-post-rebase-verify-full.log`, SHA-256
  `fe34f43f0a7f16c072e2d658d0f95b6540876999bb42199c3ef9dabd9e1b7aff`).
  Seeded fuzz passed with `FC_SEED=20260812`, and checkout deploy readiness
  passed while purchase remains disabled. `make user-gate` completed fuzz and
  the Firefox diagnostic, then correctly returned the repository contract's
  BLOCKED exit 2; it is not reported green.
- [ ] **T011 — Deliver without merge.** Commit atomically, rebase on current
  `origin/main`, push, open a PR, obtain native DeepSeek v4 Pro ALLOW on the
  clean head, fix every BLOCK finding and re-review, then stop without merging.
- [x] **T012 — Close DeepSeek pair-fill BLOCK.** A real AppModule/PostgreSQL
  journey first failed on the old branch when pairless `subscription.created`
  was followed by `transaction.completed` carrying the complete canonical pair
  (`/tmp/proso-157-pairfill-mutation-red.log`, SHA-256
  `4e46300d01ee4ad87f83e48341f797aaeb3f1df071d687f7cb658d325f195670`).
  The adapter now fills both null claim columns together in the same transaction
  as exactly one allocation/key, while an incomplete pair remains 503 and an
  existing conflicting pair remains protected. Focused integration and equal-
  timestamp ordering oracles passed
  (`/tmp/proso-157-pairfill-focused-green-final2.log`, SHA-256
  `71b4a59e43ec1d3d6cc46f9f442141c7c63d339d05581624a9d033050325092b`);
  full server passed 501/501
  (`/tmp/proso-157-pairfill-full-server-final.log`, SHA-256
  `52af08272cb8d4d6d29d259e77b79993018e919ac0509821df70a742ad0d2d55`).
