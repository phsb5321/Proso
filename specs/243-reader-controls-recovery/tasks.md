# Feature 243 — Recovery tasks

Continuation checklist, created 12/09/2026 after recovering the staged work.
Unchecked delivery gates must not be inferred from local unit results.

- [x] T001 Inspect the immutable parent transcript, worktree and remote effects;
  confirm the interrupted commit failed and no branch push occurred.
- [x] T002 Share the footer DOM harness in
  `packages/extension/tests/helpers/footer-test-environment.ts` and the fixture
  in `tests/contract/highlight-sync.contract.test.ts`; keep every assertion.
- [x] T003 Pin stale voice labels, Escape handling, native keyboard activation
  and focus retention in `tests/unit/content/sticky-footer-voice.test.ts`;
  repair `src/utils/content/sticky-footer.ts` after observing red tests.
- [x] T004 Pin a queued idle pass racing a new reading session in
  `tests/unit/entrypoints/content-hover-play.test.ts`; recheck active reading
  at execution in `src/entrypoints/content.ts`.
- [x] T005 Repair `scripts/lib/webdriver.mjs` at the shared launcher seam and
  leave `scripts/lib/webdriver.self-test.mjs` proving privilege remains opt-in.
- [x] T006 Strengthen `scripts/hover-affordance-gate.mjs` to observe repeated
  DOM writes, not infer absence of churn from a stable paragraph count.
- [x] T007 Run local extension tests (3,316 pass, one pre-existing skip),
  seeded fuzz and loaded-Firefox fixture journeys; retain red and green logs.
  Exact-head replay is part of the PR evidence, not an acceptance waiver.
- [ ] T008 Clear the full deterministic gate without suppressing the new
  dependency advisories; retain the first failure in the recovery evidence.
- [ ] T009 Satisfy `make user-gate` / Feature 095, including a public footer
  voice/retry journey. Current footer proofs use unit/contract seams, not a
  loaded-browser footer actor.
- [ ] T010 Obtain a capable exact-head different-family gate. Do not launch
  the retired models pinned by the legacy adversarial script.
- [ ] T011 Restore protected-base eligibility and inspect exact-head CI/review
  before squash merge. Release/daily-profile installation remains separate.

## Follow-up coverage gaps

- The unchanged Paddle integration fixture's fixed period expired on
  12/09/2026 at 17:00 BRT (`PERIOD_END` in
  `packages/server/tests/integration/paddle-provisioning-journey.spec.ts`).
  Two tests now expect active credits from an expired period; repair the clock
  fixture separately without changing production credit expiration.

- Voice-list invalidation after changing providers while a footer is alive.
- Reconciliation after routing during a read and then stopping that read.
- Observer scheduling under prolonged idle starvation; pending work currently
  becomes eligible again before the scheduled idle callback executes.
- Several older content-script tests intentionally share listeners. The new
  race test follows their ordering convention; isolated teardown is future work.

These are not claims of completed user acceptance.
