# Tasks: PROSO-79 documentation reconcile

## Setup

- [x] Baseline grep (mandated pattern + broader sweep for `BrowserTTSAdapter`/
  `ElevenLabsAdapter`, which the mandated pattern's `browser tts` (space-
  delimited) does not catch on its own).

## Documentation changes

- [x] Patch `docs/architecture/current.md`:
  - `TTS Generation` bullet: `Calls ElevenLabs API` → delegates to the Proso
    server (`POST /api/v1/tts/synthesize`, spec 069), 402 for Free managed,
    BYOK works on every tier.
  - Adapters diagram: `ElevenLabsAdapter` → `ServerTtsAudioAdapter`.
  - Sequence diagram: `TTS` participant `ElevenLabs API` → `Proso Server
    (POST /api/v1/tts/synthesize)`; the `generateAudio`/`wordTimings`
    exchange corrected to the real `synthesize()` call and the client-side
    word-timing estimate (the server proxy does not return timings).
- [x] Patch `docs/architecture/proposed.md`:
  - `IAudioGenerator` JSDoc: removed `ElevenLabsAdapter, BrowserTTSAdapter
    (future)`, replaced with `ServerTtsAudioAdapter` + a citation of the
    removal commit (`9797dc6`) and `docs/reading-journey-status.md`.
- [x] Swept `docs/architecture/findings.md`: no ElevenLabs/browser-TTS claim
  present (its "audio generation" mentions are generic architecture-smell
  guidance, not provider-specific) — no edit needed.
- [x] Swept `docs/PRE_LAUNCH_CHECKLIST.md`: ElevenLabs mentions (lines 86,
  93-94, 566-567) are commercial-license-terms concerns about a still-current
  provider, not an architecture claim; Cross-Browser Testing (lines 406, 541)
  covers real Firefox/Chrome/Edge extension-compatibility testing, not a
  browser-TTS feature claim — no edit needed.

## Closeout

- [x] Re-ran the mandated grep and the broader sweep: both zero hits in
  `docs/architecture/` + `docs/PRE_LAUNCH_CHECKLIST.md`.
- [x] Recorded evidence for claim replacement with file:line references to
  code and docs (see PR body / in-pane report).
- [x] `docs/firefox-extension-testing-strategy.md` flagged, unchanged: its
  hit (a 15-line mocked-`window.speechSynthesis` code sample in "4.4 Audio
  Playback Testing" strategy #3) is the same claim class but NOT a trivial
  one-line fix — it needs either deletion-with-context-check or a non-trivial
  rewrite against the real server-fetch mock, so it is out of this PR's scope
  per the dispatch's own boundary rule.
