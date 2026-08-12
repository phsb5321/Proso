# Feature 147 — Account-free reading journey gate

## Goal

Observe, in a real Firefox, which audio route a reader's click actually takes —
and make the account-free journey (INV-001) fail closed when it takes the wrong
one.

Three consecutive fixes (PROSO-135 `#144`, PROSO-136 `#145`, PROSO-137 `#146`)
were shipped against the same symptom: a reader with a configured, granted,
reachable local host pressed Play and was answered with a 402 about billing.
Each fix was real and each was verified — and after all three the journey was
still broken, because nothing in the repository observed the one fact that
mattered: **which endpoint received the synthesis request.**

The adapter-level receipt (`tests/integration/local-host-live.test.ts`)
synthesizes real audio against a real host and passed throughout all three
bugs. It could not have caught any of them: every one was in the wiring
between the popup click and the adapter, not in the adapter.

The ledger rows this feature operationalizes (`docs/reading-journey-status.md`):

- ◐ "A public-control actor reads an article in a real Firefox — Synthesis is
  still the local fixture, so this proves the public control path, not the
  account-free outcome."
- ✗ "Current `main` allows a no-key managed request."
- The sibling gate's own receipt field: `provesFr1: false`.

## Requirements

- **FR-001:** A retained gate drives the built Firefox extension through public
  controls only — settings section, host address, "Test connection", "Enable
  the local synthesis host", the Unified Extensions button, the browser action,
  and the popup's "Play" — with no internal dispatch and no seeded local-host
  state.
- **FR-002:** The runtime host permission is granted by a real WebDriver click,
  so the user gesture `permissions.request()` requires is genuine. A grant
  simulated from privileged script does not satisfy this requirement.
- **FR-003:** The gate asserts the reader's own host received a synthesis
  request carrying the article text, and asserts **zero** requests reached
  `/api/v1/tts/synthesize`. The negative assertion is the point: a run in which
  audio plays because the managed route served it is a FAIL, not a PASS.
- **FR-004:** The gate asserts the engine adopted the host, not merely that the
  UI said so — the background must answer with the voices the reader's host
  publishes before the journey proceeds.
- **FR-005:** Verdicts are three-valued: PASS, FAIL, and BLOCKED for a missing
  browser, driver, control or accessible name. A missing surface is never
  reported as a pass.
- **FR-006:** Every assertion is shown to catch a planted break, scored on the
  gate's own verdict line rather than its exit code, with a self-check that a
  gate which never ran reports CRASH.
- **FR-007:** The synthesis host is a fixture speaking the appliance's wire
  contract (`/v1/capabilities`, `/v1/tts`, `Idempotency-Key`, exactly
  `{input, voice, speed}`, WAV out), so the gate runs with no tailnet
  dependency and refuses requests the real appliance would refuse.
- **FR-008:** On failure the gate reports which route was taken, the popup's
  status, the stored configuration, the granted origins and the background's
  voice list — the observation whose absence turned this defect into five
  debugging passes.

## Non-goals

- Replacing `scripts/public-actor-gate.mjs`. That gate covers pause, resume and
  position-holding against the managed stub; this one covers the account-free
  outcome. Both are retained.
- Proving the appliance itself. `tests/integration/local-host-live.test.ts`
  covers the real host at the adapter level (env-gated on `LOCAL_HOST_E2E_URL`).
- Exercising the optional-permission doorhanger. See Relaxations.

## Defects this gate found on `main` (`bda64a0`)

All three were live after PROSO-135/136/137, and each is fixed in this feature.

1. **The settings page discarded the address the reader typed.**
   `saveLocalHostSettings` stored `localHostUrl: enabled ? url : null`. The
   debounced save on `input` fires 600 ms after typing, while the enable box is
   still unchecked — the order every reader uses — so it wrote `null` over the
   address. `storage.onChanged` then pushed that `null` back into the field via
   `syncProviderUI`, clearing the input. Enabling then failed with "Enable
   requires a valid https:// address", the provider stayed managed, and
   playback 402'd. Fix: persist the address independently of `enabled`;
   nothing is sent anywhere until `localHostEnabled` is true **and** the exact
   origin is granted, both still enforced in `composition/factories.ts`.

2. **The local route still fell through to the server.** PROSO-137 closed the
   gate path, the throw path and the single-shot `Err` path, but not the
   chunked path's first-chunk fall-throughs. `LocalHostAudioAdapter`
   sets `supportsChunkedSynthesis = true`, so the local route *always* takes
   the chunked path — the one still unguarded. Measured: 4 requests to
   `/api/v1/tts/synthesize`, 0 to the reader's host. Fix: honour
   `failClosedOnGate` in all three remaining chunked fall-throughs.

3. **`PlaybackService.setLanguage()` was never called, from anywhere.**
   `detectedLanguage` stayed `null` for every request. Managed providers hid it
   by choosing a voice server-side; the reader's own host cannot, and declines
   an undetermined language rather than reading English text in a Portuguese
   voice (spec 100 D-2) — so the local route answered "Language not supported:
   und" for every article. This is the same dead-wiring shape PROSO-136 found
   with `subscribeToSettings()`. Fix: derive the language once in
   `playback.start` and give it to both the footer and synthesis, so the
   language the reader is told is the language they hear.

## Relaxations

Recorded in the gate's receipt, not hidden:

- `extensions.webextensions.remote=false` — inherited from the sibling gate. A
  remote popup's document is opaque to the parent process, so its accessible
  names cannot be read at all out-of-process.
- `extensions.webextOptionalPermissionPrompts=false` — the grant request, its
  user gesture and the resulting permission are real; the doorhanger the reader
  would accept is not exercised.
- The synthesis host is a fixture, not the appliance.

## Acceptance

```bash
make local-host-journey-gate     # PASS: reader's host served it, 0 managed requests
make local-host-journey-plants   # every assertion catches its planted break
```
