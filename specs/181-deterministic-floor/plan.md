# Feature 181 — Implementation plan

## Constitution check

| Rule | Plan evidence |
|---|---|
| Security by default | No credentials touched; mocked fetch/timers only; no network from tests. |
| Fallible operations fail closed | The new bounded-retry-count assertions fail closed on unbounded retries; the size-bound proxy fails closed on a franc-variant regression. |
| Determinism over wall-clock | Jest fake timers fast-forward the retry backoff; the franc gate swaps the clock-dependent assertion for a load-independent module-size oracle. |
| Smallest correct diff | Test-only changes in three files + tracked specs; zero source-code behaviour changes (`retry-fetch` already exposes the `RetryRuntime` seam). |
| No dependency added | Jest fake timers and `node:module` `createRequire` are built in. |

## Gap decision

`retry-fetch.spec.ts` already proves retry semantics deterministically with an injected
runtime (no-op sleep, fixed `random`/`now`, bounded `fetch` call counts). The defect is that
the **adapter-level** tests call `retryableFetch` without the seam and therefore burn real
backoff sleeps while `fetch` is mocked; under load the sleeps plus Jest overhead exceed the 5 s
default and the tests redden on scheduling. The franc test asserts an absolute millisecond
budget that varies 6–79 ms on identical trees.

## Changes

### `packages/extension/tests/unit/language/franc-min-accuracy.test.js`

Replace the `Initialization Performance` block's wall-clock budget with:

- the observable outcome: first call returns `eng` (kept);
- a load-independent proxy for the "small variant" property: `createRequire(import.meta.url)`
  resolves `franc-min/data.js` and `statSync` its size, asserting it is below a 1 MB hard
  bound (franc-min 6.2.0 ships ~104 KB; full `franc` ships ~1 MB+). A swapped dependency
  (`franc` instead of `franc-min`) fails `require.resolve` immediately — red on the real
  defect class without any clock;
- repeated-call determinism: the same short input returns `eng` on every call.

### `packages/server/tests/unit/adapters/tts/cartesia-tts.adapter.spec.ts`

Wrap the five retry-triggering tests (network failure, DNS failure, non-Error thrown, 429,
500) in `jest.useFakeTimers()` with a `try/finally` back to real timers:

- kick off `adapter.synthesize(...)` and `await jest.advanceTimersByTimeAsync(60_000)` to
  fast-forward all retry sleeps and deadline timers;
- assert the Result shape (kept);
- **add** `expect(mockFetch).toHaveBeenCalledTimes(4)` (initial + 3 retries).

The 401 test is non-retryable and stays on real timers (it already completes in ~1 ms).

### `packages/server/tests/contract/tts-provider.adapter.spec.ts`

Same pattern for the retry-triggering contract tests (`on HTTP error response` — 429 — and
`on network error`) for OpenAI, ElevenLabs and Groq: fake timers + advance + Result shape +
bounded call count.

## Verification

1. Focused suites green on the quiet machine (extension franc file; cartesia spec; contract
   spec) with wall-clock receipts.
2. **Plant A (franc):** temporary `jest.mock('franc-min', () => ({ franc: () => 'spa' }))`
   copy → accuracy + first-call assertions red → revert → green.
3. **Plant B (adapters):** temporary `DEFAULTS.retries = 99` in `retry-fetch.ts` → bounded
   call-count assertions red → revert → green.
4. **Under load:** the three suites run while a parallel CPU hog (`yes > /dev/null` on every
   core) saturates the machine; all green, with per-test durations recorded.
5. `nix-shell --run "make verify"` exits 0.
6. Push + PR titled `test: ...`; report PR number + receipts; no merge.
