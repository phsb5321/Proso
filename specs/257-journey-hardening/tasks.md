# Tasks

- [x] Rebuild clean HEAD inputs and record commit/build/harness provenance.
- [x] Record hidden-window visibility history and verify navigation/reload.
- [x] Require live audio before leave and a prompt observed policy pause after.
- [x] Exercise clip/paragraph continuation inside the hidden window.
- [x] Bound WebDriver DELETE and clean up before writing evidence.
- [x] Add false-positive plants, including a stalled DELETE response body.
- [x] Complete real Firefox replay and retain actual verdict/anomalies.
- [x] Record final syntax/Biome/fuzz results and commit without pushing.

## Verification — 21/09/2026

- `pnpm install --frozen-lockfile`: passed (optional-platform DNS warnings).
- `node --check` and Biome check: passed for all four changed `.mjs` files.
- `node scripts/background-playback-journey.self-test.mjs`: passed false-positive
  plants and the five-second stalled-response-body teardown check.
- `make fuzz`: 11 tests passed; seed `20260730`, 100 runs.
- `BACKGROUND_ARTIFACT_DIR=.artifacts/background-playback-257-final make background-playback-journey`:
  exit 0, **PASS**, 21/21 checks, clean built commit `df8b9ad`. Firefox 157.0a1,
  geckodriver 0.37.1, seed `20260920`. Enabled and disabled each complete hidden,
  navigation and reload phases. The enabled hidden window crosses two paragraph
  boundaries. Exact build and harness hashes are in its receipt.
- Earlier BLOCKED receipts retain the observer privilege error, incorrect reset
  actor assumptions/naming, and one pause during concurrent Firefox testing.
  Observer/actor errors are fixed. Both serial hidden continuations passed;
  the concurrent-test pause's cause remains unproven.
- `make user-gate`: failed at smoke synthesis timeout; this ran concurrently with
  the first replay and is not a serial Feature 095 acceptance result.
- `GENERATOR_FAMILY=openai make gate`: blocked at doctor (missing generated
  Prisma client), before independent review. No full-gate PASS is claimed.
- Final process-log anomalies remain unclassified: 459/33 enabled/disabled
  opaque uncaught exceptions, 10/6 null `documentPrincipal` errors, and a null
  docShell error per shutdown; browser network warnings are also retained.
  Passing policy assertions do not certify an error-free browser session.
- Receipt harness/build hashes match the retained files after the run.
- No product source changes; no push. Logs: `/tmp/proso-257-{final,fuzz,user-gate,gate}.log`.
