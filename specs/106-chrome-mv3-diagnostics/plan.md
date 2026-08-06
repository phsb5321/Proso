# Plan — Feature 106

## Hypothesis and falsifier

**Hypothesis:** the two ledger failures are one root cause wearing two
symptoms. `PlaybackService.attachAndPlay()` constructs `new Audio()` directly in
the background context; Chrome MV3 service workers have no DOM, so `Audio` is
undefined there, the first playback attempt throws, and the `playback.start`
journey dies — leaving the popup transiently stuck on `Loading...` (pre-#86
diagnostic) or showing the failure UI (current `main`). The shipped
`offscreen.html` document and `OffscreenAudioAdapter`/`DirectAudioAdapter`
(IAudioPlayer) are dead code: no composition wiring selects an audio player per
browser.

**Falsifier:** a committed diagnostic on the Chrome MV3 build that goes RED on
current `main` (worker `Audio` undefined; start journey never reaches playing),
goes GREEN when the audio context works, and stays GREEN on the Firefox MV2
build. If the diagnostic goes GREEN on current Chrome, the hypothesis is wrong.
If the Firefox leg cannot run, the reason is reported as a finding.

## Delivery plan

1. Commit the spec skeleton first (this directory).
2. Write `scripts/chrome-mv3-diagnostics.mjs` — one script, two browser legs:
   - Chrome MV3 (Playwright Chromium, system `google-chrome`, `--headless=new`
     with `--load-extension`): assert worker `Audio` context (FR-001b), the
     popup start journey against the local fixture article + Proso API stub
     with an observed TTS request (FR-001a/FR-004), and a popup→background
     message roundtrip.
   - Firefox MV2 (raw geckodriver harness, `firefox-nightly`): same
     assertions must stay green (FR-003): background `Audio` available via
     `runtime.getBackgroundPage()`, popup start journey completes, roundtrip
     answers.
3. Run the Chrome leg on current `main`-based build; capture the RED receipt.
4. Run the Firefox leg; capture the GREEN receipt.
5. Fill the Verdict section: smallest Chrome-specific change among real
   candidates (worker-safe `Audio` shim over the shipped offscreen document;
   wiring the existing IAudioPlayer port; message-response fix alone), each
   with a falsifier.
6. Wire the gate: Makefile target + extension package script.
7. Biome clean, `git diff --check` clean, atomic conventional commits, in-pane
   report with receipts.

## Constitution check

- **Privacy First:** the diagnostic observes the extension's own message and
  audio behavior; the fixture stub records only fixture traffic. No new data
  flow.
- **Security by Default:** no credential, no secret; the fixture server binds
  127.0.0.1 and mirrors the production CORS contract.
- **User Experience Excellence:** the start journey is asserted through the
  real popup control and real status UI, not internal dispatch.
- **Modular Architecture:** the verdict is explicitly constrained to
  Chrome-specific change; the Firefox path is untouched by this feature.
- **Critical paths:** deterministic diagnostics stay separate from public
  acceptance (public-actor-gate keeps its role).
- **Business invariants:** no entitlement, credit, or pricing code touched.

## Files

```text
Makefile
packages/extension/package.json
scripts/chrome-mv3-diagnostics.mjs
specs/106-chrome-mv3-diagnostics/
```

No dependency, workflow, runtime, or production change is required.
