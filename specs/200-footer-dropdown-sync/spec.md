# Feature 200 — Footer controller and dropdown integration

## Problem

The page player (StickyFooter) and its speed/language dropdowns are two state
surfaces that drift apart. Verified against `main @ 8ab6936`:

1. **The footer's language choice never reaches synthesis.** `language.setOverride`
   writes the module-global `globalOverride` (`handlers/language.handlers.ts`,
   `handleLanguageSetOverride`), while `playback.start` reads only the per-tab
   `tabLanguageStates.get(tabId).override` (`handlers/playback.handlers.ts:334-338`),
   which is null by default and only ever preserved, never written. The two stores
   never meet: a reader picks `PT` in the footer dropdown, the footer label says
   `PT`, and the audio continues in the detected/default language — on this session
   and on the next start. `handleLanguageGetState` merges
   `globalOverride ?? state?.override` (inconsistent with start's read), and
   `service.setLanguage()` is called from nowhere except `playback.start`, so a
   mid-playback override applies to nothing.
2. **Footer speed changes are not persisted.** `footer.action {action:'speed'}`
   → `PlaybackService.setSpeed` mutates in-memory state and broadcasts
   (`core/playback/playback-service.ts:411`), but never writes the settings
   store, so the choice is lost on extension restart and the settings store
   keeps the stale value. The popup slider, which reads stored speed at open,
   can round-trip the stale value back.
3. **Dropdown option highlights go stale.** `StickyFooter.updateState` refreshes
   only the button text and aria-label; `.speed-option.active`/`aria-selected`
   and `.language-option.active` refresh only on a full `_render()`. After a
   speed change from the popup slider, reopening the footer's speed dropdown
   still highlights the old option.
4. **Every speed/language selection rebuilds the whole footer.** Both the speed
   action and the language-option handler call `this._render()`, which clears
   and rebuilds the entire shadow root — a full compositor-damaging re-render
   mid-reading for a one-value change, and the rebuild itself resets dropdown
   state.
5. **Escape closes only the speed dropdown; neither dropdown closes on an
   outside click.**

## Goal

One source of truth for speed and language, reflected consistently across the
footer, its dropdowns, the popup, and the settings store. Language selection
from the footer drives the audio the reader hears (live for chunked local
synthesis, and on every subsequent start). Speed selection from either surface
is persisted and reflected everywhere. Dropdown interactions are cheap (no full
re-render) and behave like real menus (Escape/outside-click close).

## User stories

### US1 — The language the dropdown shows is the language the reader hears

As a reader, when I pick a language in the footer dropdown, continuing audio and
the next reading session both use that language.

**Independent test:** with a local-host session active, pick a non-detected
language in the footer dropdown and assert (a) the footer label changes, (b) the
language sent to the synthesis host changes for the next chunk, (c) a fresh
`playback.start` uses the override, (d) `language.clearOverride` restores the
detected language. Unit-pinned via the language handlers and `playback.start`.

**Falsifier:** the footer label changes but the synthesis language does not; the
override survives in `language.getState` but a new start ignores it; clearing
the override keeps the stale language.

### US2 — Speed is one value everywhere

As a reader, the speed I set in the footer dropdown is the speed the popup
shows, the speed persisted in the settings store, and the speed a restarted
session starts with.

**Independent test:** set speed from the footer, assert the settings store and a
fresh `PlaybackService` session carry the value; set speed from the popup
slider, assert the footer's speed button and dropdown highlight reflect it.

**Falsifier:** the footer shows a speed the store does not hold; a restarted
session loses the footer-chosen speed; the dropdown highlight disagrees with
the current speed after an external change.

### US3 — Dropdown interaction is cheap and menu-like

As a reader, changing speed or language does not rebuild the whole player, and
Escape or clicking outside closes an open dropdown.

**Independent test:** assert `updateState` (not `_render`) is the only UI path
for speed/language changes, that dropdown option highlight state tracks state
updates, and that Escape/outside-click close both dropdowns.

**Falsifier:** a speed change clears other footer DOM (a full rebuild), the
dropdown shows a stale active option, or an open dropdown stays open after
Escape/outside click.
