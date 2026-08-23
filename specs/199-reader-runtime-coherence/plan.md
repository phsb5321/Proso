# Feature 199 — Implementation plan

## Constitution check

| Principle | Result | Evidence |
|---|---|---|
| Privacy First | PASS | Existing reader-operated loopback destination only; marks travel with audio from the same user-entered host. |
| Security by Default | PASS | Text normalization stays at the synthesis trust boundary; no credential, permission, or destination change. |
| User Experience Excellence | PASS | One coherent player, immediate loading, actionable errors, real popup tabs, and truthful timing basis. |
| Modular Architecture | PASS | DOM reconciliation is pure content-boundary logic; provider mark parsing stays in the local-host adapter; playback consumes the existing port type. |
| Critical-path tests | PASS | Pre-fix runtime receipts, actual-entrypoint tests, content regressions, local route plants, and loaded Firefox public actions. |

## Verified root causes

1. **Cross-version DOM state is unowned.** `content.ts` guards one JavaScript execution with `window.Proso._contentInitialized`, but a newly loaded extension context cannot adopt the prior `StickyFooter` instance. `StickyFooter.show()` checks only its own `this.container`, never the document. The daily dbt page contained **22** `#proso-sticky-footer` accessibility landmarks after repeated extension reloads. Old `.proso-w` wrappers are likewise outside the new `HighlightManager` state and cannot be unwrapped by its current cleanup.
2. **The two counters use different bases.** Popup `updateParagraphInfo()` renders `current + 1`; `StickyFooter._formatPositionIndicator()` renders the zero-based `currentParagraph` directly. The screenshot therefore showed `1/56` and `0/56` for the same state.
3. **Loading is visual, not stateful.** Popup `startFreshPlayback()` calls `updateStatus('loading')` but does not update `currentState`, disable Play, or mark it busy. Repeated clicks still branch from `stopped` and dispatch another `playback.start`.
4. **Two prefetchers compete.** The local adapter's sentence generator has its own one-in-flight/one-prefetched pipeline, while `PlaybackService.start()` also starts the generic two-way paragraph prefetcher. The real service log showed four simultaneous requests. The chunked path never consumes paragraph-prefetched entries, so this work is pure contention.
5. **Failure leaves a visual lie.** `PlaybackService.setError()` shows an error and updates the footer but does not clear the paragraph/word highlight established before synthesis.
6. **The current model has no word marks.** Supertonic 3 advertises `markKinds: []`; its model uses an utterance-level duration predictor. The extension therefore distributes clip duration with an ASCII-biased syllable heuristic, treating punctuation and structural glyphs as timing weight. Exact word marks cannot be recovered from the model's public output.
7. **The current bridge leaks model exceptions.** At 13:55 BRT, box-drawing glyphs `└` and `├` raised `ValueError` through FastAPI as an unhandled 500. The bridge does not normalize against the loaded model's own supported-character index or convert synthesis exceptions to RFC-9457 errors.
8. **Popup tab tests copy rather than execute production.** `popup-keyboard.test.ts` reimplements `switchTab()` inside the test. It can remain green if production listeners or keyboard semantics are broken.
9. **The old oracle is scoped too narrowly.** `fleet-intel verify proso-highlight-tab-focus` passed after the screenshot because it uses a fresh fixture profile and checks sentence boundaries plus browser-focus policy. It cannot see accumulated daily-tab DOM, popup panel navigation, current-model glyph failures, or timing provenance.

## Design

### Slice A — reconcile page-owned artifacts

Add one small content-boundary helper invoked only after the same-context initialization guard and before managers are constructed. It removes obsolete Proso footer roots, unwraps obsolete word spans without changing their text, clears obsolete playback classes, and restores Proso-owned padding. New footer padding stores the exact prior inline value in a durable DOM marker so a future extension context can restore it. A conservative legacy path subtracts only the measured per-footer offset from pixel padding when old roots predate the marker. Minimize/expand recomputes from that immutable original value; it MUST NOT reread the already-inflated computed padding, which currently stacks another offset on every toggle.

Content initialization performs the only full page sweep. `StickyFooter.show()`/`hide()` reconcile footer roots and padding only, so a normal footer lifecycle cannot unwrap the live `HighlightManager` state. The user-facing position formatter adds one; internal indices remain unchanged.

### Slice B — one authoritative start and one prefetcher

On Play, set popup state to loading, set `aria-busy`, and disable only the Play/Pause control while the popup-owned start promise is pending. Stop remains available. A separate request-ownership flag prevents stale stopped/playing broadcasts from reopening Play, while an unowned loading state (queue/footer/background start) still converges on authoritative stopped/error. Stop during the owned request suppresses the resulting abort as reader intent rather than routing it as host failure. After success or failure, fetch and apply authoritative background state, then release the owned latch. If the popup closes mid-request, playback remains background-owned; a newly opened popup fetches authoritative state.

The playback service initializes its queue for chunked reading but gates `prefetch.service.start()` itself—both initial start and resume—on `!audioGenerator.supportsChunkedSynthesis`. Stop still clears both paths. This leaves the local adapter's bounded sentence pipeline as the only speculative producer.

`setError()` awaits `clearHighlights()` before `showError()` and the footer error update, so the visible recovery state never overlays stale reading markup.

### Slice C — production popup tabs

Move the small panel-selection behavior into an imported popup tab controller used by the real entrypoint and its tests. It owns selected classes, `hidden`, `aria-selected`, roving `tabIndex`, click, Enter/Space through native button semantics, ArrowLeft/ArrowRight wrapping, Home, and End. Panel changes never dispatch a playback message. The dead OCR control stays hidden; Tools exposes only working content, and Queue add/remove is exercised against the handler's actual unwrapped `{id, position}` response.

### Slice D — truthful and improved approximate timing

The exact-device candidate gate is complete and fail-closed. Kokoro-FastAPI commit `26eec068d8ce6f559afef83f68933127ac38e315` produced a valid 7.316-second PT-BR WAV at CPU RTF 0.23825 but returned `timestamps: null` for the mandatory accents/date/currency/`├`/`└` input; its simple PT-BR control returned six model-derived marks. ROCm did not start within two bounded attempts. Therefore it is **not** adopted, no 600-second soak is claimed, and this feature does not add an unused marked local-host wire protocol.

Existing provider marks continue through the current `AudioResponse.wordTimings`, prefetch, cache, and popup state. The real local route remains raw WAV with null marks. Its fallback tokenizes Unicode letter/mark/number words, skips structural-only sentences/paragraphs, uses language-aware vowel clusters, and reserves bounded punctuation pause weight. Timing basis is ephemeral—provider, estimated, or none—so no storage migration is introduced; the popup renders that authoritative basis rather than a constant label.

### Slice E — current bridge resilience

Live storage and `/v1/health` on 23/08/2026 confirm that the current daily route is Supertonic 3 on `127.0.0.1:5301`; this live evidence supersedes the dated Qwen selection document. The transient bridge lives outside this repository. It is handled as a separately verified runtime patch: validate text with the loaded text processor, replace only unsupported non-spoken glyphs for synthesis, preserve the original request identity, and catch model validation/inference exceptions into the existing problem-document shape. It remains loopback-only and transient; the extension PR records the contract and reproducible receipt but does not pretend to own or persist the bridge.

### Slice F — public gate and deployment

Extend the loaded-Firefox actor rather than introducing another framework. Before public actions begin, each long-lived fixture tab contains the exact accumulated shape—22 obsolete player roots, nested word wrappers, playback classes, and legacy padding—and the observer asserts current initialization removes it without changing text. The actor then operates Player/Tools/Queue by accessible role/name, exercises Queue add/remove, starts one bounded chunk request path, asserts one player root, dynamic approximate timing disclosure, sentence transition, structural-glyph filtering, and both browser-tab policies. Post-deploy AT-SPI repeats the one-player assertion on the already-open daily dbt tabs, which is the real extension-reload history the hermetic fixture represents. Production-entrypoint tests own the held/repeated Play race; browser plants sever cleanup, disclosure, panel reachability, and request bounds. The receipt binds exact HEAD/build/XPI, Firefox, model/runtime revision, request trace, tab/action trace, timing basis, and anomalies.

## Changed surfaces

Expected minimum:

- `packages/extension/src/entrypoints/content.ts`
- `packages/extension/src/utils/content/{content-artifact-cleanup,sticky-footer,highlight}.ts`
- `packages/extension/src/entrypoints/popup/{main,popup-tabs,index.html}.ts|html`
- `packages/extension/src/core/playback/playback-service.ts`
- `packages/extension/src/adapters/audio/local-host-audio.adapter.ts` (structural-text boundary only; no marked-wire protocol)
- focused unit/contract tests and the loaded-Firefox local-host journey
- `scripts/oracles/reader-runtime-coherence`
- this feature's spec, plan, tasks, research receipt, and reading-status delta

External runtime validation is kept under the local TTS evidence directory and is not treated as repository source.

## Verification order

1. Preserve the pre-fix live receipt and make focused regressions fail.
2. `make doctor` using existing generated/dependency artifacts; no bootstrap while the global-hook issue remains open.
3. Focused content, popup-entrypoint, playback, and local-host adapter tests.
4. `FC_SEED=20260823 FC_NUM_RUNS=2000 make fuzz`.
5. Public loaded-Firefox coherence gate plus every plant.
6. Real loopback current-model glyph and approximate-timing journey; rerun the already-verified Kokoro rejection oracle without promoting it.
7. `make verify-full`.
8. Different-family adversarial panel against exact HEAD.
9. Push, green CI, squash merge, merged-state verification.
10. Atomically deploy the reviewed XPI, verify daily Firefox and both real browser tabs, write rollback receipt, and remove the feature worktree.

## Complexity tracking

- **No optional marked wire response:** the only exact-host candidate failed realistic PT-BR timestamp coverage, so adding its protocol now would be unused code. Existing marked providers remain untouched.
- **One DOM reconciliation helper:** justified because cross-extension-context artifacts cannot be owned by instance fields. It is intentionally page-global and limited to Proso-prefixed roots/classes.
- **Popup tab controller:** extracted only so tests execute the production behavior instead of copying it.
- No new dependency, permission, telemetry, account, persistent service, or alternate playback state machine.
