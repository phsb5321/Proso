# Feature 196 — Sentence-synchronized highlighting and tab-focus playback

## Problem

When Proso reads through the local synthesis host, each sentence is a separate audio clip but the
highlight timeline is rebuilt from the whole paragraph. The second clip also starts from an audio
offset that omits the first clip. The visible word can therefore jump backward or belong to a
sentence that is not playing.

Playback also remains attached to the original page when the reader activates another browser tab.
That is useful for background listening, but it is surprising when the reader expects Proso to
follow browser focus, and there is no setting that lets the reader choose.

## Goal

Keep estimated highlighting inside the sentence whose audio is playing, preserve monotonic
paragraph time across sentence clips, and let the reader choose whether activating another tab
stops the old reading session and leaves Proso ready on the newly active page.

## User stories

### US1 — The visible word follows the sentence being spoken

As a reader using a synthesis host without word marks, I see highlighting only among words in the
currently playing sentence. At a sentence boundary the highlight advances into the next sentence
instead of jumping back to the paragraph start.

**Independent test:** play a two-sentence paragraph whose clips have different known durations.
The first published timeline contains only sentence one. After the first clip ends, the next
timeline contains only sentence two, its first timestamp equals sentence one's duration, and its
character offsets point into sentence two in the source paragraph.

**Falsifier:** a sentence timeline contains words from another sentence, paragraph time decreases at
a clip boundary, or the second sentence wraps a repeated word occurrence from sentence one.

### US2 — Tab focus can own playback

As a reader, I can enable **Stop playback when switching tabs**. When enabled, activating a tab
other than the page being read stops audio, aborts pending synthesis and prefetch, clears the old
page's highlight/footer, and leaves the new tab idle and ready for its own Play action. Proso does
not automatically read the new page.

**Independent test:** start reading tab A through public controls, activate tab B, observe tab A's
reading UI clear and the popup on tab B expose Play rather than Pause, then start tab B without
reloading the extension.

**Falsifier:** old audio continues, old page UI remains, a stale request completes into playing,
the new tab starts automatically, or Play on the new tab cannot begin a fresh session.

### US3 — Background listening remains available

As a reader, I can disable **Stop playback when switching tabs**. Activating another tab then leaves
the original reading session playing exactly as before.

**Independent test:** disable the setting through its public checkbox, start tab A, activate tab B,
and observe Pause remains available while tab A's playback position continues advancing.

**Falsifier:** disabling the setting still stops or restarts playback, or changing the setting
requires an extension restart.

## Requirements

- **REQ-001:** Chunked playback MUST derive each fallback word timeline from the current sentence's
  text and measured clip duration, not from the full paragraph and a partial duration.
- **REQ-002:** Chunk-local word and provider timing offsets MUST be translated to absolute paragraph
  character and time offsets before publication.
- **REQ-003:** Paragraph audio position MUST be monotonic across chunk boundaries; the first chunk's
  duration MUST contribute to the second chunk's base.
- **REQ-004:** Providers returning native word timings MUST retain those timings; the fallback MUST
  remain explicitly estimated when marks are absent.
- **REQ-005:** The settings page MUST expose a keyboard-reachable checkbox named **Stop playback
  when switching tabs**, persist it in extension-local storage, synchronize it across settings
  pages, and apply changes without restart.
- **REQ-006:** The setting MUST default to enabled when absent. Disabling it MUST preserve the
  existing background-listening behavior.
- **REQ-007:** Enabled tab-focus behavior MUST stop only when a different tab replaces the playback
  tab. Idle state, same-tab activation, and a fresh session already targeting the activated tab
  MUST not be stopped.
- **REQ-008:** Stopping on tab activation MUST use the existing `PlaybackService.stop()` path so
  cancellation, audio teardown, cache/prefetch cleanup, highlight clearing, and footer hiding stay
  atomic with the existing generation guard.
- **REQ-009:** No install-time permission, network destination, telemetry, account, or server change
  is permitted.
- **REQ-010:** A real loaded-Firefox journey and deterministic plants MUST cover the public setting,
  enabled stop/readiness behavior, disabled continuation behavior, and a two-sentence highlight
  transition.

## Non-goals

- Claiming provider-measured word alignment from Supertonic or any host that advertises no marks.
  Within a sentence, positions remain a deterministic estimate from measured audio duration.
- Feeding synthesized audio through STT/Whisper.
- Automatically starting playback when a new tab becomes active.
- Changing playback when a browser window merely loses operating-system focus.
- Persisting or accelerating the external Supertonic service.

## Acceptance criteria

1. The pre-fix two-sentence regression fails and the fixed implementation publishes sentence-local,
   absolute, monotonic timelines.
2. The settings checkbox is publicly named, keyboard reachable, persisted, cross-page synchronized,
   and effective without restart.
3. Loaded Firefox proves enabled tab switching stops/clears/readies and disabled tab switching
   continues the original session.
4. Missing controls, stale audio/highlight, wrong sentence, a non-monotonic timeline, or a plant
   reported as PASS fails closed.
5. The exact-head deterministic gate and a different-family adversarial review pass.
