# Feature 199 — Coherent reader tabs and trustworthy word synchronization

## Problem

The deployed reader can look active without delivering a coherent reading session. Repeated extension reloads can leave obsolete player controls and word wrappers in an already-open page. The popup and page player then disagree about position, a slow start can be triggered repeatedly, and a synthesis failure can leave the first paragraph highlighted even though no audio is playing.

The popup's Player, Tools, and Queue panels exist, but their behavior is not exercised by the public loaded-browser contract. Keyboard tab navigation is incomplete, so a green reading journey does not prove that every visible panel works.

Finally, the current synthesis route publishes no word marks and estimates every word from total clip duration. Structural symbols, punctuation pauses, and accented words make that estimate visibly drift. The exact-host timing candidate was fast but lost every timestamp on realistic formatted PT-BR input, so no eligible current route can honestly provide exact synchronization. The product must improve and label the fallback rather than promoting an incomplete mark path.

## Goal

Make one reading session produce one coherent player on every page, make all three popup panels operable by pointer and keyboard, recover visibly from unsupported text and synthesis failures, and preserve real provider word marks on routes that already supply them. Keep the current local route explicitly approximate and materially improve its fallback for ordinary English and Brazilian Portuguese text.

## User stories

### US1 — Every browser page has one current Proso player

As a reader with pages that survived extension updates, I see at most one page player. Starting, stopping, or switching browser tabs cannot revive obsolete controls or obsolete word wrappers.

**Independent test:** seed a page with multiple obsolete Proso player roots, nested old word wrappers, an old paragraph class, and accumulated bottom padding; load the current content script and start reading. Exactly one player remains, source text is unchanged, stale highlight classes are gone, and page padding is restored before the current player applies its own single offset.

**Falsifier:** more than one player root or control landmark remains, text changes, wrappers stay nested, padding grows once per reload, or an obsolete player receives visible state.

### US2 — Player, Tools, and Queue are real tabs

As a reader, I can activate Player, Tools, and Queue with a click, Enter/Space, ArrowLeft/ArrowRight, Home, and End. Exactly one panel is selected and visible, focus follows keyboard navigation, and changing panels does not start, stop, or reset playback.

**Independent test:** drive all three tabs in a loaded Firefox popup through public role/name controls and assert selected state, visible panel content, focus, and unchanged playback state after each transition.

**Falsifier:** a tab has no public name, two panels are exposed together, a hidden panel remains focusable, arrow keys do nothing, or panel navigation mutates playback.

### US3 — One Play action creates one bounded start

As a reader, after I press Play once I immediately see a loading state and cannot accidentally enqueue another start while synthesis is pending. Stop remains available. Success changes both the popup and page player to playing; failure produces one actionable error and no stale paragraph or word highlight.

**Independent test:** hold synthesis pending, activate Play repeatedly, and assert one start request. Resolve success and failure separately; both surfaces converge, and the failure path clears stale reading markup.

**Falsifier:** multiple requests are issued, Play remains enabled as if idle, counters disagree, failure leaves highlighted text, or the UI remains loading indefinitely.

### US4 — Local synthesis handles real page text

As a reader, structural formatting characters and other unsupported glyphs do not crash the selected synthesis route. Characters that have no spoken value may be removed at the synthesis boundary without changing the source page. A real synthesis error is returned as a typed, actionable failure rather than an unhandled server error.

**Independent test:** read sentences containing accents, numbers, punctuation, and box-drawing characters through the real selected loopback route. Every request returns audio or a typed bounded error; no raw 5xx traceback is emitted and the source text remains unchanged.

**Falsifier:** an unsupported glyph causes an unhandled 5xx, retry loops, source-page mutation, or silent playback stop.

### US5 — The highlighted word follows the audio honestly

As a reader, routes already publishing valid word marks still drive highlights from those marks. On the current no-marks local route, Proso labels the mode approximate and uses a punctuation- and Unicode-aware fallback rather than claiming exact alignment.

**Independent test:** preserve a deterministic provider-mark fixture to prove valid marks are not discarded. Use the real no-marks loopback route for punctuation-heavy EN/PT-BR text and assert the approximate state plus deterministic monotonic fallback.

**Falsifier:** existing provider marks are discarded, estimated marks are called exact, the highlighted word crosses a sentence boundary early, repeated words map backward, timestamps exceed the clip, or the fallback treats structural glyphs as spoken words.

### US6 — Browser-tab policy still has both modes

As a reader, enabling **Stop playback when switching tabs** stops and clears the old page and leaves the newly active page ready; disabling it preserves background listening. Cleaning stale page UI and popup-panel navigation must not change either policy.

**Independent test:** exercise both settings through public controls with two article tabs after the stale-artifact and popup-panel journeys.

**Falsifier:** enabled mode leaves old audio/UI, disabled mode stops, a new tab autoplays, or either page accumulates another player.

## Requirements

- **REQ-001:** Content initialization MUST reconcile obsolete player roots, word wrappers, paragraph classes, and Proso-owned body padding before creating current page state.
- **REQ-002:** Reconciliation MUST preserve page text and author-owned styles and MUST be idempotent.
- **REQ-003:** The page position indicator and popup position indicator MUST use the same one-based user-facing index while internal paragraph indices remain zero-based.
- **REQ-004:** Popup tabs MUST implement one selected/visible panel, roving tab focus, click/native activation, ArrowLeft/ArrowRight, Home, and End.
- **REQ-005:** A pending playback start MUST expose loading, suppress duplicate starts, preserve Stop, and converge from the background's authoritative state.
- **REQ-006:** Chunked synthesis MUST NOT run the independent paragraph lookahead prefetcher; the chunk producer's own bounded prefetch is the sole speculative request path.
- **REQ-007:** Playback failure MUST clear paragraph and word highlighting before displaying its actionable error; it may keep one player visible for recovery.
- **REQ-008:** Unsupported non-spoken structural characters MUST be normalized only at the synthesis boundary, and provider exceptions MUST become typed failures.
- **REQ-009:** Existing provider word marks MUST remain preserved through cache and playback without being replaced by fallback estimates; this feature MUST NOT add an unused local marked-wire protocol while no exact-host candidate satisfies realistic PT-BR coverage.
- **REQ-010:** Accepted word marks MUST be monotonic, sentence-local, source-occurrence-correct, and bounded by clip duration. The current local route remains on the labelled approximate fallback.
- **REQ-011:** The approximate fallback MUST tokenize Unicode words, ignore structural-only tokens, account for punctuation pauses, and remain explicitly distinguishable from provider marks.
- **REQ-012:** Loaded Firefox MUST cover all popup panels, one bounded Play, real EN/PT-BR approximate playback, unsupported glyph recovery, exactly one page player, and both browser-tab policy modes using public controls and deterministic observers; deterministic tests retain the existing valid-provider-mark path.
- **REQ-013:** No install-time permission, telemetry, account requirement, managed-server behavior, or page-content destination may be added.

## Non-goals

- Claiming that an unmarked model has exact word alignment.
- Adding or promoting a marked local-host route before realistic PT-BR coverage passes.
- Deriving production marks with Whisper, speech recognition, or post-hoc transcription.
- Ranking voice naturalness without the separate blind listening gate.
- Automatically starting playback when a browser tab becomes active.
- Persisting or GPU-enabling an external model solely for this feature.

## Acceptance criteria

1. The recorded pre-fix live page with obsolete controls, `1/56` versus `0/56`, repeated starts, unsupported-glyph failure, and a false-green old oracle is represented by deterministic regressions.
2. A loaded-extension public actor proves Player, Tools, Queue, loading, stop, one player root, approximate-timing disclosure on the real route, and both browser-tab modes.
3. The real selected loopback route handles punctuation, accents, numbers, and structural glyphs without an unhandled 5xx.
4. Exact-head deterministic gates, seeded fuzzing, plants, and a different-family adversarial review pass.
5. The daily Firefox deployment is accepted only after its XPI hash, model identity, loopback listener, one-player-per-page observation, and rollback receipt are recorded.
