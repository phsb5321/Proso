# Plan — 200-footer-dropdown-sync

## Root causes (verified at `8ab6936`)

| Bug | Root cause | Evidence |
|---|---|---|
| L1 — language override never reaches synthesis | `handleLanguageSetOverride` writes `globalOverride`; `playback.start` reads only `tabLanguageStates.override` (null by default). Two stores, written in one, read in the other | `language.handlers.ts` setOverride vs `playback.handlers.ts:334-338` |
| L2 — mid-playback override applies to nothing | `service.setLanguage()` is called only from `playback.start` | `playback.handlers.ts:345` |
| S1 — footer speed not persisted | `PlaybackService.setSpeed` mutates state + broadcasts, never writes the settings store | `playback-service.ts:411` |
| D1 — dropdown highlights stale | `updateState` refreshes button text only; option `.active`/`aria-selected` refresh only on `_render()` | `sticky-footer.ts` updateState |
| D3 — full footer rebuild per pick | speed action + language-option handler call `this._render()` | `sticky-footer.ts` `_handleAction('speed')`, lang handler |
| D4 — menus don't close properly | Escape closes speed only; no outside-click handler | `_handleKeyDown` |

## Fixes

1. **Language authority (L1/L2).** `setOverride` writes the active tab's
   per-tab override too, and live-applies via a new injected
   `setPlaybackLanguage` dep (wired to `PlaybackService.setLanguage`, which
   feeds every subsequent synthesis request at `playback-service.ts:757/1113/1377`).
   `clearOverride` clears both and re-applies the detected language. The
   `playback.start` read path is then correct without edits.
2. **Speed persistence (S1).** `PlaybackService.setSpeed` writes the clamped
   value through the injected settings store (idempotent with the existing
   `subscribeToSettings` application; no loop).
3. **Dropdown state sync (D1).** `updateState` refreshes `.speed-option` and
   `.language-option` active/aria-selected alongside the button text.
4. **Cheap interactions (D3).** Speed action and language selection use
   targeted `updateState` updates; `_render()` is no longer called for
   one-value changes.
5. **Menu behavior (D4).** Escape closes both dropdowns; a document mousedown
   outside the footer closes both.

## Verification

- Unit tests for each fix (language handlers, playback service, footer UI).
- `make verify` (extension suites + gates) on the branch.
- Browser-level: the loaded-Firefox public gate still passes; optionally extend
  the actor to toggle footer speed/language (gated on harness cost).
- Different-family exact-head adversarial panel before merge.
- PR → green → squash-merge → confirm MERGED.
