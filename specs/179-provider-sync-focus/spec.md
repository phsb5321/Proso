# Feature 179 — stop syncProviderUI clobbering an input the reader is typing into

Slice #22 in `docs/reading-journey-status.md` ("Next verified slices").

## Problem

`syncProviderUI` (utils/options/provider-state.ts) reassigns
`ui.localHostUrl.value = state.localHostUrl ?? ''` on every sync. The settings
page's `storage.onChanged` listener
(`setupStorageChangeListener`, options/controller.ts) fires for the page's OWN
writes too — the local-host URL field has a debounced save-on-input
(600 ms), so while the reader types:

1. the input event schedules `saveLocalHostSettings`,
2. that write triggers `onChanged`,
3. the listener calls `syncProviderUI`,
4. `.value` is reassigned to the same string → the caret jumps to the end.

Before PR #147 the written-back value could be stale and destroyed the typed
address outright; since #147 the value is the same string, so the damage is
cosmetic — but a listener that clobbers a focused input is still wrong, and it
also clobbers the field on a genuine cross-tab write while the reader is
editing.

## Falsifier (both directions, runnable)

- **Direction A (focused):** while the URL field is focused (the reader is
  typing), a sync must NOT reassign `.value` — the in-flight text and the caret
  survive. `syncProviderUI` with `isLocalHostUrlFocused: () => true` leaves
  `ui.localHostUrl.value` untouched.
- **Direction B (not focused):** cross-tab sync must keep working — without a
  focused field, the stored URL still lands in the input.

## Fix (smallest correct)

- `provider-state.ts`: `ProviderUI` gains an optional
  `isLocalHostUrlFocused?: () => boolean`; `syncProviderUI` skips the
  `localHostUrl.value` assignment when it returns true. Absent guard ⇒ behaves
  exactly as before (all other call sites unaffected). No new state system.
- `options/controller.ts`: `OptionsElements` carries
  `isLocalHostUrlFocused?: () => boolean`, wired in `getElements()` to
  `document.activeElement === elements?.localHostUrl`. Every `syncProviderUI`
  call site (load, save, onChanged) inherits the guard automatically.

## Not in scope

- No change to the debounce, the save shape, or the permission flow.
- No change to the other synced fields (provider dropdown, enable checkbox,
  voice) — cross-tab sync of those continues to apply even while the URL field
  is focused (proven by the shield test).
