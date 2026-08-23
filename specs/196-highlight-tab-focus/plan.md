# Feature 196 — Implementation plan

## Constitution check

| Principle | Result | Evidence |
|---|---|---|
| Privacy First | PASS | No new destination or data flow; one local boolean preference only. |
| Security by Default | PASS | No permission or request change. Tab switching reuses the existing aborting stop path. |
| User Experience Excellence | PASS | Public checkbox names the behavior; enabled and disabled outcomes are browser-observable. |
| Modular Architecture | PASS | Sentence timing remains pure playback-domain logic; browser activation stays in the background boundary. |
| Critical-path tests | PASS | Pre-fix unit regression, settings/a11y checks, loaded-Firefox journey, plants, fuzz, and exact-head gate. |

## Root cause

The local host implements `generateAudioChunks()` as one response per sentence, but
`PlaybackService.generateAndPlayChunkedParagraph()` publishes the first clip through
`finalizeParagraphPlayback()` with the **full paragraph text**. `playNextChunk()` repeats the same
full-paragraph estimate using only elapsed clips. At the same time, `chunkPlayedMs` begins at zero
and is not seeded with the first clip duration, so the second clip's paragraph base is also zero.
The result is both semantic (wrong sentence) and temporal (backward offset) drift.

The background already listens to `browser.tabs.onActivated`, but only updates the footer handler's
active tab id. The composition-root `PlaybackService` is available there and its existing `stop()`
method already owns cancellation and visual cleanup, so no second teardown path is needed.

## Design

### Slice A — sentence-local absolute timelines

1. Split the playback paragraph with the same pure `splitSentences()` function that defines the
   chunked generator contract.
2. Associate each yielded response with its sentence text and source character offset.
3. Convert native timings, or estimate fallback timings, against that sentence only.
4. Add the sentence's character offset and cumulative completed-audio duration before sending the
   timeline to the content script.
5. Seed completed duration with chunk zero, then increase it exactly once per later chunk.
6. Make DOM word wrapping prefer the published absolute character offset so repeated words in an
   earlier sentence cannot be wrapped instead.

This does not invent measured word marks. It narrows the existing fallback estimate to the actual
synthesis unit and keeps its times on the paragraph clock.

### Slice B — tab-focus behavior preference

1. Add `stopPlaybackOnTabChange` to the validated settings schema and defaults, defaulting to true.
   Missing storage therefore behaves correctly for existing installs without a destructive
   migration.
2. Add a public checkbox and hint to Settings, including load, save, storage-sync, reset, and
   auto-save paths.
3. Keep one in-memory background boolean loaded during initialization and updated from
   `storage.onChanged`; do not perform an asynchronous storage read inside every activation event.
4. On activation, always retain the existing footer target update. When the preference is enabled
   and the playback state's tab differs, call the existing `PlaybackService.stop()` and report any
   rejection through background logging. Re-checking state in the helper protects a session that
   already targets the activated tab.

### Slice C — user gate and delivery evidence

1. Extend the local-host Firefox fixture article with a deterministic two-sentence paragraph.
2. Extend the public actor to exercise the setting through its checkbox, prepare two article tabs,
   verify enabled stop/readiness, then disable it and verify background continuation.
3. Assert the visible active word enters sentence two after the measured first fixture clip rather
   than resetting to sentence one's first word.
4. Add plants that sever tab-stop handling and sentence-offset handling; score on explicit verdict,
   never process exit alone.
5. Retain seed, browser identity, public action trace, HTTP records, screenshot, and exact HEAD in
   the receipt.

## Changed surfaces

- `packages/extension/src/core/playback/playback-service.ts`
- `packages/extension/src/utils/content/highlight.ts`
- `packages/extension/src/background/init-hexagonal.ts`
- `packages/extension/src/utils/config/{defaults,schema}.ts`
- `packages/extension/src/entrypoints/{settings.html,options/controller.ts}`
- focused playback, settings, accessibility, and background tests
- `scripts/lib/reading-fixture-server.mjs`
- `scripts/local-host-journey-{gate,plants}.mjs`
- `docs/reading-journey-status.md` and active-doc review metadata

## Verification order

1. `make doctor`
2. Pre-fix targeted regression (must fail before implementation)
3. Targeted chunk, content-highlight, background activation, settings, and accessibility tests
4. `FC_SEED=20260822 FC_NUM_RUNS=2000 make fuzz`
5. `make local-host-journey-gate` plus plants in fixture mode
6. Real loopback-host Nightly journey with `LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301`
7. `make verify`
8. `GENERATOR_FAMILY=openai PI_REVIEW_PRIVACY=private make gate`
9. Push, PR checks/reviews, squash merge, merged-state verification, worktree cleanup

## Complexity tracking

No new port, dependency, permission, timer, playback service, or teardown path. The only extra
state is sentence metadata for the current chunk sequence and one background preference boolean.
