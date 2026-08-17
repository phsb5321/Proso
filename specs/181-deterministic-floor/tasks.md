# Feature 181 — Tasks

- [x] **T001 — Baseline the flake.** Run the three affected suites on the quiet machine and
  record per-test durations: franc first-call ~9 ms today (measured 6–79 ms historically);
  cartesia retry-path tests 3.5–3.9 s each (24 tests, 20.5 s total); contract retry tests
  3.4–4.0 s each (50 tests, 25 s total) — all real backoff sleeps while `fetch` is mocked.
  (FR-001, FR-006)
- [x] **T002 — franc: drop the wall-clock, keep the teeth.** Replace the 50 ms budget with the
  observable outcome (first call returns `eng`) plus the load-independent `franc-min` identity
  and data-size proxy. (FR-001, FR-004, FR-005)
- [x] **T003 — cartesia: mocked clock + bounded retry count.** Wrap the five retry-triggering
  tests in fake timers, fast-forward the backoff, assert the Result shape and that `fetch` was
  called exactly 4 times. (FR-001, FR-002, FR-003)
- [x] **T004 — contract: same pattern for OpenAI/ElevenLabs/Groq.** Apply fake timers +
  bounded call count to the retry-triggering contract tests. (FR-001, FR-002, FR-003)
- [x] **T005 — Plant A (franc detection regression).** Temporarily mock `franc-min` to return
  `spa` for every input; the accuracy and first-call assertions go red; revert; green.
  Receipt: `/tmp/proso-181-plant-a-*.log`. (FR-008)
- [x] **T006 — Plant B (unbounded retry cap).** Temporarily set `DEFAULTS.retries = 99`;
  the bounded call-count assertions go red; revert; green. Receipt:
  `/tmp/proso-181-plant-b-*.log`. (FR-008)
- [x] **T007 — Green under load.** Run the three suites with a parallel CPU hog on all cores;
  all green with durations recorded. Receipt: `/tmp/proso-181-load-*.log`. (FR-009)
- [x] **T008 — Delivery floor.** `nix-shell --run "make verify"` exits 0. (FR-010)
- [x] **T009 — Ship.** Commit specs + tests, push `181-deterministic-floor`, open the PR
  (`test: ...`), report number + receipts; no merge. (FR-007)
