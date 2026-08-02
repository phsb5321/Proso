# Tasks: TTS boundary hardening

## Phase 1 — Specify and analyze

- [x] T001 Record the product-policy boundary and outcome acceptance.
- [x] T002 Trace the 402 path through server, API adapter, audio adapter, and
  handler.
- [x] T003 Inspect the voices provider implementation and throttler metadata.
- [x] T004 Search the exact symptom through the private SearXNG instance using
  at least three query angles.

## Phase 2 — RED

- [x] T005 Add handler and public popup regressions proving the 402 message is
  visible without a prefix and playback leaves loading/playing.
- [x] T006 Strengthen the server regression to reject the removed browser-TTS
  remedy.
- [x] T007 Add controller metadata and behavioral HTTP regressions for the
  voices guard, named limit, TTL, 31st-request 429, and provider call count.
- [x] T008 Capture the expected failures against the pre-fix implementation.

## Phase 3 — GREEN and refactor

- [x] T009 Restore/refine the dedicated `payment_required` error and adapter
  mapping.
- [x] T010 Preserve the entitlement message unchanged at `audio.generate`.
- [x] T011 Keep the server remedy capability-based and bind voice discovery to
  the configured `long` throttler. Correct the adjacent `test-key` binding to
  that same configured name.
- [x] T012 Run focused extension and server suites with all available cores.

## Phase 4 — Delivery

- [ ] T013 Run formatting, lint, types, build, and deterministic full gates.
- [ ] T014 Reconcile `docs/reading-journey-status.md` and
  `docs/agent-delivery-harness.md` without overlapping another fleet owner.
- [ ] T015 Obtain a clean different-family typed review.
- [ ] T016 Commit, push, open the PR, and record checks/reviews/gates.
- [ ] T017 Merge only if the cross-service and product gates permit it;
  otherwise mark the precise Pedro-owned action and retain the worktree.
