# Plan — Feature 256 (background playback)

## Seams in the existing code

| Concern | Module | Change |
|---|---|---|
| View unload signal | `entrypoints/content.ts` (`executeCleanup`) | send `playback.viewUnloaded` instead of `playback.stop` |
| Policy | new `background/view-unload-policy.ts` (mirrors `background/tab-playback-policy.ts`) | decide stop vs detach from preference + sender tab + playing tab |
| Message | `handlers/playback.handlers.ts` | register `playback.viewUnloaded`; keep `playback.stop` as the explicit user stop |
| Session ownership | `core/playback/playback-service.ts` | `detachVisualAttachment()`, detached flag, `checkHighlight` honesty |
| Polarity | new `utils/config/background-playback.ts` | one helper owns stored-vs-presented inversion, used by UI and service |
| Settings UI | `entrypoints/settings.html` + `entrypoints/options/controller.ts` | positive label + hint; same stored key |
| Popup | `entrypoints/popup/main.ts` | cross-tab / detached presentation + return-to-tab action |

The tab-activation policy (`init-hexagonal.ts` → `stopPlaybackForTabChange`)
already honors the same preference and is unchanged.

## Order of work

1. Polarity helper + policy module + tests (pure, no browser).
2. `PlaybackService` detached state + `checkHighlight` + tests.
3. Content script signal swap.
4. Handler registration.
5. UI: settings label/hint, popup presentation, popup toggle.
6. `pnpm -r lint`, focused jest suites; then a loaded-Firefox journey
   (tab switch, navigation, reload) that asserts audio progression — the
   event-page lifetime question in the spec is answered there, not by argument.

## Risks

- **Event-page suspension** may still cut audio after an idle period; the
  journey must measure it (audio time advancing across a >60 s hidden window).
- **Existing tests encode the old polarity** (`tests/unit/config/tab-focus-setting.test.ts`,
  a11y settings test, `tests/unit/background/init-hexagonal.test.ts`); they must
  be updated deliberately rather than deleted.
- **Navigation while unified-pipeline state is mid-chunk** must not leave a
  dangling audio element or a doubled session; the handler is idempotent.

## Popup attention slice (256b)

Publish source tab, original document title, detached state and audio liveness
through both `playback.getState` and the existing popup broadcast. Capture the
title at start so navigation cannot replace it. Broadcast and update the action
before attempting content delivery; a dead view must not suppress global state.
Keep the core browser-free: the messaging adapter owns badge/title writes.

The popup uses its own active tab to label here/elsewhere, prioritizes detached
state, checks source-tab existence and focuses the source window on return.
Fresh-start paths recheck the background and require explicit Stop for an
existing session, including Stop during the check. Resume reads authoritative
state rather than manufacturing Playing. The preference uses the existing
polarity helper and storage key, with a native button and `aria-pressed`.

Validation: popup interaction, adapter publication and service lifecycle tests;
full extension unit/contract projects, lint and TypeScript; existing Firefox
public-control regression updated for the explicit Resume name. T008 remains
separate: these checks do not prove background event-page lifetime.
