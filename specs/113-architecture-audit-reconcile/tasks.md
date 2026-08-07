# Tasks: PROSO-79 documentation reconcile

## Setup

- [x] Run baseline grep for scoped browser-TTS claims.

## Documentation changes

- [x] Patch `docs/architecture/current.md`:
  - Replace `Calls ElevenLabs API` with server-route language (`POST /api/v1/tts/synthesize` through `ServerTtsAudioAdapter` and `ProsoApiAdapter`).
  - Update TTS sequence diagram participant to the server API route.
  - Add a short note that Free managed requests currently return 402 and BYOK remains available (source-backed).
- [x] Patch `docs/architecture/proposed.md`:
  - Remove `BrowserTTSAdapter (future)` from the `IAudioGenerator` implementer list.
  - Restrict listed implementations to server-side adapter classes used by the current centralized route.
- [x] Re-scan `docs/architecture/findings.md` and `docs/PRE_LAUNCH_CHECKLIST.md` for browser-TTS claims and confirm no remaining matches in scope.

## Closeout

- [x] Re-run grep to capture zero matches.
- [x] Record evidence for claim replacement with file:line references to code and docs.
- [x] Mark `docs/firefox-extension-testing-strategy.md` as flag-only and unchanged due scope mismatch.
