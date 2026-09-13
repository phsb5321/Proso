# Feature 243 — The reader's own controls have to work

## Problem

A reading session on a client-routed documentation site (02/09/2026, Firefox,
`docs.getdbt.com`) produced four independent failures at once, and the reader's
summary was "the extension freezes, i cannot hover over the paragraphs, i
cannot change the voice on the fly. there is nothing ready."

The screenshot pins the state exactly: the footer visible, `11/56`, the play
glyph showing, an empty progress bar, and `14:00` on **both** sides of it.

1. **Play was a no-op.** `PlaybackService.resume()` is gated on
   `canResume`, which is `status === 'paused'` and nothing else. Both `error`
   (any synthesis failure — a provider 429, a 402, a dropped connection) and
   `loading` (a paragraph transition whose fetch has not landed) draw the same
   play glyph over an audio element holding no playable clip. In those states
   the button was pressable and inert, permanently: `handleFooterAction`
   discarded the refusal and answered `success: true`, so nothing anywhere
   could report that the press had done nothing.

2. **The progress bar and the clock disagreed with the paragraph counter.**
   `state.progress` is the fraction of the *current paragraph*. The footer
   renders what it is sent as a CSS width and reports it as a 0-100 slider
   value, so a 0-1 fraction drew every bar under one percent wide. The clock
   was computed as `progress × totalParagraphs × 15s`, which reaches the total
   at the end of *any* paragraph — hence `14:00 / 14:00` on paragraph 11 of 56.

3. **Voice could not be changed while reading.** The footer has speed and
   language controls and no voice control at all, and `setVoice()` only moved
   in-memory state — the paragraph being read kept the old voice. The only way
   to change narrator was to leave the article for the settings page.

4. **Hover died after a client-side route change.** Feature 229 marks
   paragraphs from one `requestIdleCallback` at content-script start. A router
   that replaces the article without a document load never restarts the content
   script, so every routed paragraph arrives unmarked and unclickable.
   Confirmed in a real Firefox: 10 paragraphs marked on load, 0 of 6 after an
   in-place article swap.

## Goal

Every control the reader can see either does something or says why not, and
every readout describes the article they are actually listening to.

## User stories

### US1 — Play always does something

As a reader whose article stopped, pressing Play re-reads the paragraph I can
see rather than doing nothing. This holds after a synthesis failure and while
a transition is still loading.

**Independent test:** drive a session to paragraph 3, force the generator to
fail, advance (state becomes `error`), clear the failure, press Play: a new
synthesis request is issued for paragraph 3 and the status returns to
`playing`. Repeat with a generator that has not answered yet (`loading`).

**Falsifier:** Play refuses in `error` or `loading`; or a refused action still
answers `success: true`. Resuming with nothing loaded must still be refused —
Play is a retry, not a way to start from an empty state.

### US2 — The footer's readouts describe the article

As a reader, the progress bar, the elapsed clock and the paragraph counter all
describe the same position in the article.

**Independent test:** with 4 paragraphs, seek to index 2: the footer's progress
is at least 0.5 and under 0.75, elapsed is not equal to total, and elapsed
advances as paragraphs complete. At the wire, a `0.42` document fraction
arrives at the footer as `42`, and the footer draws `width: 42%`.

**Falsifier:** elapsed equals total before the last paragraph; the bar's width
is not proportional to what was sent; the bar and the counter disagree.

### US3 — Change the narrator without leaving the article

As a reader, I pick a different voice from the player and the paragraph I am
listening to is re-read in it.

**Independent test:** open the footer's voice control: it lists the provider's
voices plus a "Default" entry, requested only on first open. Choosing one
persists it and re-synthesizes the paragraph in progress with the new voice.
Choosing "Default" returns to the provider's own choice.

**Falsifier:** the choice applies only from the next paragraph; the voice list
is fetched on every footer show; a provider with no voices shows an empty
dropdown instead of saying so; an internal route repair (adopting a local
host's own voice) restarts the clip.

### US4 — Routed paragraphs stay clickable

As a reader on a site that navigates in place, paragraphs the router brings in
are hoverable and clickable like the ones the page loaded with.

**Independent test:** `make hover-affordance-gate` — a real Firefox loads the
fixture article, asserts paragraphs are marked and read as `cursor: pointer`,
replaces the article in place, and asserts the affordance reaches the new
paragraphs.

**Falsifier:** re-extraction runs while a read is in progress (paragraph
indexes are the reading position; renumbering them would move the highlight
and every click target under the reader); or the observer re-extracts on the
word spans the highlighter writes during playback.

## Non-goals

- Real clip durations in the footer clock. The estimate stays 15s per
  paragraph; only its basis is corrected. Real durations are known one
  paragraph at a time and would make the total jump around.
- A voice preview in the dropdown.
- Recovering a session across a client-side route change. The observer stands
  down while the footer is up; a reader who navigates mid-read stops the read.

## Evidence

| Claim | Evidence |
|---|---|
| All four defects reproduce before the fix | `tests/unit/core/playback-service-reader-controls.test.ts` (5 of 9 failing on the unfixed tree) and `scripts/hover-affordance-gate.mjs` (`0 of 6 routed paragraphs marked`, exit 1) |
| Play recovers from `error` and `loading` | `tests/unit/core/playback-service-reader-controls.test.ts` |
| Footer readouts describe the article | same file, plus `tests/contract/highlight-message.contract.test.ts` for the 0-1 → 0-100 conversion and `tests/unit/content/sticky-footer-coherence.test.ts` for the rendered width |
| The voice control works | `tests/unit/content/sticky-footer-voice.test.ts` |
| Routed paragraphs stay clickable | `make hover-affordance-gate` in a real Firefox |

The footer attaches a **closed** shadow root, so ordinary page scripts cannot
query it. On 13/09/2026, a platform-accessibility actor closed part of that
observation gap: `make reader-controls-gate` locates the actual footer's
Firefox accessibility roles/names, activates them, and uses native Enter/Escape.
It neither opens the shadow root nor invokes an extension handler/message.

The local-host fixture campaign proves Pause, Resume, catalog opening, Escape,
voice change during playback, native-keyboard voice selection, visible
current-sentence restart after the selected voice's audio response, a
predetermined synthesis failure, Play retry, and Close with cleared UI and no
further synthesis. `make reader-controls-plants` requires omission of Atlas
selection and omission of Play retry to fail their respective assertions; a
crash or stale receipt cannot count as a caught plant.

This does not prove full Feature 095 acceptance, real-provider narrator quality,
managed-provider voice catalogs, or the original docs site's exact freeze.
The server audio adapter currently returns an empty managed voice catalog;
the proven voice-selection route is the reader-operated local host.

Browser findings added on 13/09/2026:

- Fresh footer rendering attached button listeners twice. Status updates
  replaced the footer nodes and discarded keyboard listeners/focus. One
  listener per node lifetime and in-place play-button updates fix both;
  `sticky-footer-coherence.test.ts` has red/green regressions.
- Voice selection left the old clip playing while replacement synthesis was
  pending. Its `ended` event advanced to another paragraph before the new
  voice's first clip arrived. `applyVoiceChange()` silences it and enters
  loading (preserving an explicit pause); chunked and paused-voice regressions
  plus the browser's response/visible-restart oracle pin this race.

The bar and clock retain their deterministic service → wire → rendered-width
proof; the hover affordance remains light-DOM browser evidence.
