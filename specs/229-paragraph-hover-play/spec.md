# Feature 229 — Hover a paragraph and click it to start playing

## Problem

Paragraph clicks only start or seek playback after content extraction has
happened, and extraction happens exclusively as a side effect of popup queries
or a first playback start. On a page the reader has not interacted with yet,
hovering a paragraph shows no affordance and clicking it does nothing, so the
reader cannot pick an arbitrary paragraph as the reading start. The hover-based
selection UI (`ParagraphSelector`) exists but is disabled again the moment
playback starts, so even mid-session there is no visible "start from here"
affordance.

## Goal

Make every extracted paragraph visibly playable all the time: a paint-only
hover affordance signals "click to play from here", clicks start playback from
that paragraph when idle and seek there during playback, and extraction happens
once at content-script idle so the affordance exists without any popup
interaction.

## User stories

### US1 — Hover affordance on every readable paragraph

As a reader, when I hover a content paragraph on an article page I see a
hover-only affordance (pointer cursor, subtle tint, inset accent bar) that
signals the paragraph can start playback. The affordance changes paint only —
no layout shift, no per-paragraph icons inserted, no elements made positioned.

**Independent test:** load an article page, wait for idle extraction, hover a
paragraph: computed `cursor` is `pointer` and the hover class is present while
page layout is unchanged (same paragraph boxes).

**Falsifier:** the affordance requires opening the popup first, disappears
when playback starts, shifts text (inline icon reflow), or appears on pages
with no readable content.

### US2 — Click a paragraph to play from there, in any playback state

As a reader, clicking a hovered paragraph starts playback from that paragraph
when idle, and seeks the running session there while playing, paused, or
stopped. Clicks on links, buttons, and form controls inside a paragraph keep
their native behavior, and finishing a drag text-selection does not trigger
playback.

**Independent test:** with extraction done, click page paragraph N with no
session running: playback starts with paragraph N as the first spoken
paragraph. With a session running, click paragraph M: highlight and audio move
to M.

**Falsifier:** the click is ignored before the first popup open, a link or
button click also triggers playback, releasing a text selection starts
reading, or a paused session seeks but the reader cannot resume.

## Requirements

- FR-1: At content-script idle, if the page has readable content, extract once
  and add the hover-affordance class to every extracted paragraph.
- FR-2: Pages with too little text (login shells, empty apps) are skipped and
  keep zero ambient cost; extraction through the popup or playback is unchanged.
- FR-3: The affordance is CSS-only (paint on hover): cursor, background tint,
  inset accent. No DOM insertion, no `position` changes, no layout impact.
- FR-4: The paragraph click path treats a non-collapsed text selection as
  "the reader is selecting, not playing" and ignores the click.
- FR-5: Clicks originating on interactive elements (`a`, `button`, form
  controls, `contenteditable`, ARIA button/link roles) never trigger playback
  jump; one shared guard covers all paragraph-click branches.
- FR-6: Selection mode (popup-triggered play icons) keeps its existing
  behavior and precedence over the ambient affordance.

## Business invariants

- INV-004 (local-first content): ambient extraction reads page DOM in the
  content script only; no new network traffic or telemetry.
- Privacy First: no page text leaves the tab in this feature; it only warms
  the existing extraction cache.

## Out of scope

- Per-paragraph floating play icons for the ambient state (selection-mode
  icons remain the explicit picker).
- SPA soft-navigation re-extraction (same lifetime as the existing extraction
  cache).
- Resuming a paused session on paragraph click (seek keeps the session paused;
  resume stays a footer control).

## Amendment — 21/09/2026: prior origin engagement

Pedro reported a teal hover band over a YouTube watch-page title (screenshot)
although the reader had never been invoked there: “if we did not call the
extension, the hover thing should not appear”. Text volume alone cannot
distinguish an article from a text-rich app page.

This amendment narrows FR-1/FR-2 and the ambient parts of US1/US2: a first visit
to any origin has no ambient marking or hover paint, even on text-rich pages.
Only a successful reading-session start engages that exact HTTP(S) origin.
Background playback records origins locally in `hoverPlayOrigins`, deduplicated
and most-recent-first, capped at 50; page paths, queries and text are not stored.
Failed starts do not engage an origin. Storage failures must not fail playback.

Content reads engagement at startup and listens for local storage changes.
Engagement during the current session schedules marking of the existing article
cache without changing active playback indexes. Idle and routed-content passes,
and click-time ambient extraction, remain gated. Evicted origins lose their
markers. Already engaged sites retain paragraph-click playback and the existing
prose-volume gate; explicit popup selection remains available on first visits.
Missing/malformed storage and absent/opaque origins fail closed.

Regression checks cover first-visit idle/mutation/click behavior, a live engagement
update with the footer visible, late initial reads, storage failures, exact-origin
matching, successful/failed starts through both handlers, and the 50-origin cap.
