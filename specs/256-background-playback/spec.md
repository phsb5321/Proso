# Feature 256 — Background playback

**Status:** Draft; implementation in progress. Runtime acceptance on a loaded
Firefox is outstanding and is required before this can be called shipped.

## Problem

A reader can start listening and then must stay on the page. Two code paths
actively end the session when the view goes away:

- the content script's navigation cleanup sends a global `playback.stop` on
  `pagehide`/`beforeunload` (`entrypoints/content.ts`), and
- `PlaybackService.checkHighlight` stops when the highlight synchronizer
  reports `tab_not_found` / `content_script_not_loaded`
  (`core/playback/playback-service.ts`).

A preference exists (`stopPlaybackOnTabChange`, default **stop**) and the
settings UI explains that turning it off enables background listening, but the
navigation path ignores it, the option is phrased negatively, and nothing
outside the source tab shows what is playing. A listener who switches page loses
the session or loses all orientation.

## Goal

Make "keep listening while I look at something else" an explicit, discoverable
choice that actually holds: the audio session survives leaving the page (tab
switch, window switch, navigation, reload) while the browser runs, and the
reader can always see and control what is playing.

## Outcomes and falsifiers

### The choice is discoverable and honest

One positive control — "Keep listening when I leave this page" — owns the
behavior, in settings and in the popup, with a hint stating the limits (the
browser must stay open; synthesis and prefetch continue, so text keeps leaving
the browser for the configured destination; sensitive titles may appear in
browser surfaces).

**Falsifier:** two contradictory booleans; a control whose stored value does not
match its label; a promise of playback after the browser closes or the machine
sleeps.

### Leaving the page does not end the session

With the choice enabled, tab switch, window switch, same-tab navigation and
reload detach the *view* without stopping audio. Highlight work for a vanished
view is skipped rather than fatal. With the choice disabled the current
behavior is unchanged: playback ends when the reader leaves.

**Falsifier:** audio stops on navigation; the service treats a missing content
script as a playback failure; highlight messages keep piling into a dead tab;
visual work continues while hidden.

### State reflects reality, everywhere

The popup shows the document that is actually playing even when another tab is
active, distinguishes "playing here" from "playing elsewhere / view closed",
offers Pause/Stop globally, and never presents a started request as progress.
The reading view is re-attachable: when the playing tab still exists, the popup
can return to it.

**Falsifier:** a popup that says nothing is playing while audio plays; a "playing"
state with no audio flowing; a second start silently replacing a live session.

## Requirements

- **REQ-001:** `entrypoints/content.ts` reports a *view unload* instead of issuing
  a global stop; policy decision stays in the background.
- **REQ-002:** A single policy module decides stop-vs-detach from the stored
  preference, the sender tab and the playing tab, mirroring
  `background/tab-playback-policy.ts`.
- **REQ-003:** `PlaybackService` gains an explicit detached-view state; while
  detached, lost-view highlight errors never stop playback, and re-attaching or
  starting a new document clears it.
- **REQ-004:** The setting keeps its stored key (`stopPlaybackOnTabChange`) and
  its default; a single helper owns the inversion between stored and presented
  polarity. No second boolean.
- **REQ-005:** The popup distinguishes playing-here / playing-elsewhere /
  detached, and can return to the playing tab when it still exists.
- **REQ-006:** New behavior is unit-tested: policy decisions (4 combinations),
  detached-view error handling, and the popup's cross-tab presentation helper.
- **REQ-007:** Deferred, explicitly out of this slice: durable resume after
  browser restart (Feature 252 checkpoints), OS media controls / Media Session,
  sleep timer, sidebar or PiP player.
- **REQ-008:** A quiet global toolbar badge appears only with live audio, clears
  on pause, waiting, stop or error, and has an accessible action title naming
  the original document. Added to this slice by the popup-affordances request.

## Non-goals

Silent audio, fake media or periodic network calls to defeat event-page
suspension; a second player or cache; overriding a publisher's own media
session; per-chunk or per-paragraph notifications; inferring attention from
visibility or inactivity; claiming completion from playback events.

## Known limits (must be stated in the UI, not discovered by the reader)

- The Firefox manifest is MV2 with `background.scripts` and no `persistent`
  flag; whether a playing `Audio` element prevents event-page suspension is
  **unverified** and must be measured on a loaded extension before the feature
  is advertised as reliable.
- Playback requires the browser to stay running.
- Prefetch continues while hidden: text keeps being sent to the configured
  synthesis destination, and accepted provider requests may still cost credits.
- This slice does not resume after a browser restart; that is Feature 252.

Research basis (attention management, browser mechanics, cited studies):
`3. Resources/🛠️ Tools/Read-aloud attention management — SOTA (2026-09-20).md`.
