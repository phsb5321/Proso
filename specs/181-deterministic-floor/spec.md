# Feature 181 — Deterministic floor under machine load

## Goal

The deterministic test floor must be deterministic **under machine load**. Three tests
currently assert or implicitly depend on elapsed wall-clock time and go red purely on CPU
contention, which trains readers to re-run instead of read:

1. `packages/extension/tests/unit/language/franc-min-accuracy.test.js` asserts a **50 ms
   first-call budget**; the same tree measures 6/27/43/79 ms depending only on load.
2. `packages/server/tests/unit/adapters/tts/cartesia-tts.adapter.spec.ts` retry-path tests
   burn 3.5–3.9 s each on **real exponential-backoff sleeps** (500→1000→2000 ms + jitter)
   while `fetch` is mocked, so under contention they exceed Jest's 5 s default and redden on
   scheduling, not on adapter behaviour.
3. `packages/server/tests/contract/tts-provider.adapter.spec.ts` — the same class for the
   OpenAI/ElevenLabs/Groq contract tests (`on HTTP error response`, `on network error`).

Fix by asserting the **observable outcome** (a `Result` shape, a bounded retry count, a
mocked clock) instead of elapsed wall-clock. Do NOT raise timeouts — that hides the problem.

## User outcomes

### A green run is trustworthy without re-runs

A reader who sees a red `verify-full` can believe the red without assuming load-induced flake:
no wall-clock budget survives in the floor.

### Retry behaviour is still asserted

The retry-path tests keep asserting the `Err(ProviderUnavailable)` Result shape **and add** a
bounded retry count (`fetch` called exactly retries+1 times), so an unbounded-retry regression
goes red deterministically.

### The franc-min performance gate keeps its teeth without a clock

The 50 ms budget was a load-nondeterministic proxy for "the extension bundles the trimmed
`franc-min`, not the heavy full `franc`". The replacement asserts the observable outcome
(correct detection) and a load-independent proxy (the bundled data module is bounded in size).

## Requirements

- **FR-001 — No wall-clock budget in the floor.** No test asserts elapsed milliseconds measured
  with `performance.now()`/`Date.now()` deltas.
- **FR-002 — Mocked clock where timing matters.** The server adapter retry-path tests run under
  Jest fake timers and fast-forward the backoff; the result is asserted on the observable
  outcome, not on how long the test took.
- **FR-003 — Bounded retry count.** Each retry-path adapter test asserts `fetch` was called
  exactly `retries + 1` times (4 for the default 3 retries), so removing or loosening the cap
  goes red.
- **FR-004 — franc-min identity.** The extension performance test asserts the resolved module is
  `franc-min` and its bundled data module is below a hard size bound (franc-min ships ~104 KB;
  full `franc` ships ~1 MB+), a load-independent proxy for "initializes fast".
- **FR-005 — Correctness unchanged.** Detection-accuracy assertions and the `Err`/`Ok` Result
  shapes asserted today remain asserted.
- **FR-006 — No timeout raising.** No `jest.setTimeout` increase is used to absorb the flake.
- **FR-007 — Specs in the diff.** `specs/181-deterministic-floor/{spec,plan,tasks}.md` are
  tracked in the same diff as the code.
- **FR-008 — Red on the real defect.** The reworked tests are demonstrated red against a
  planted regression (wrong detection for franc; unbounded retry cap for the adapters) and green
  after reverting the plant.
- **FR-009 — Green under load.** The affected suites pass while a parallel CPU hog saturates
  all cores.
- **FR-010 — Delivery floor.** `nix-shell --run "make verify"` exits 0.

## Non-goals

- No adapter/source behaviour changes: `retry-fetch` already exposes a deterministic
  `RetryRuntime` seam and its own unit tests assert bounded counts; the fix lives in the
  adapter-level tests.
- No change to the accuracy corpus, thresholds, or Result semantics.
- No unrelated timing assertions elsewhere in the repo are touched.
