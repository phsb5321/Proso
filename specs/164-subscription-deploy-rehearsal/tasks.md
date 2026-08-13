# Feature 164 — Tasks

- [x] **T001 — Establish the gap.** Execute the existing Paddle PostgreSQL journey and document why
  it does not cover pre-commerce schema, checked-in predeploy, or a fresh built process. (FR-002 to
  FR-004)
- [x] **T002 — Relocate without duplicating predeploy.** Make `/app` the default release root and
  permit the local runner to supply the package root, preserving bridge → db push → bridge exactly.
  (FR-003)
- [x] **T003 — Add the process fault seam.** Reuse `beforeCommit()` through one explicit test-only
  environment switch whose default is inert. (FR-009)
- [x] **T004 — Implement the disposable runner.** Start PostgreSQL, apply the exact pre-commerce
  schema, execute predeploy, build shared then server, start the real built AppModule, and clean up
  every process/container on exit. (FR-001 to FR-004, FR-012)
- [x] **T005 — Prove the purchase boundary.** Send byte-exact signed canonical fixture data; assert
  pending → issued claim, paid validation, exactly-once hash-only rows, restart/replay, and
  rollback/retry. Keep claim requests under the real 5/min throttle and count event rows per
  distinct event id. (FR-005 to FR-009, FR-011)
- [x] **T006 — Wire the Make contract.** Add `subscription-deploy-rehearsal` and
  `subscription-deploy-rehearsal-plant` targets, with the green rehearsal included in applicable
  full verification. (FR-010, FR-012)
- [x] **T007 — Execute the bypass plant.** Run `--plant skip-predeploy`; retain its non-zero receipt
  showing the database-only claim-pair constraint is absent, then restore/run green. (FR-010)
- [x] **T008 — Run delivery gates available before immutable handoff.** Doctor/bootstrap passed;
  focused schema/canonical/PostgreSQL suites passed 20/20; full server passed 36 suites and 501/501;
  ordered shared→server build, built boot, checkout readiness, seeded fuzz (`20260813`, 200 runs),
  quality, dependency, security, source-secret scan, and `make verify` passed. The focused green
  rehearsal and bypass plant both passed their own oracles. Independent QA then exposed a changed-
  line coverage miss on the rehearsal fault; the real adapter path is now exercised by the 13/13
  PostgreSQL suite and LCOV records line 123 hit once. Full `make verify-full` is **BLOCKED** at its
  earlier format step by two out-of-scope defects inherited from Feature 163 on current `main`; they
  remain byte-identical to `origin/main` and are excluded from this feature diff. An isolated
  coverage attempt was additionally blocked by one unrelated Cartesia timeout after 505/506 tests.
  Exact receipts and SHA-256 values are recorded in the generator handoff. (all)
- [ ] **T009 — Immutable review handoff.** Commit/push one head, open the safe PR, write
  `/tmp/proso-164-generator-handoff.md`, then obtain direct DeepSeek p3 review and independent p4
  execution against that exact SHA. Repair findings only in a new immutable head and repeat both
  gates. (all)
- [ ] **T010 — Merge only when clean.** Require deterministic gates, p3 ALLOW, p4 PASS, and all
  required GitHub checks green; squash-merge the safe one-service change and report the one-line
  revert path. Never deploy. (all)
