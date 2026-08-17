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

- **Direction A (uncommitted edit):** while the URL field holds an
  uncommitted edit (an `input` fired since the last committed save), a sync
  must NOT reassign `.value` — the in-flight text and the caret survive.
  `syncProviderUI` with `isLocalHostUrlDirty: () => true` leaves
  `ui.localHostUrl.value` untouched.
- **Direction B (not dirty):** cross-tab sync must keep working — without an
  uncommitted edit, the stored URL still lands in the input.
- **Direction C (focused-but-unedited):** a field that is merely focused
  (never edited) must still receive the cross-tab value. If the guard keyed on
  focus instead, a save fired by a *different* control (voice/enable `change`)
  would read the stale field and persist it back over the cross-tab change —
  the stale-write-back hole found by the review gate in the focus-keyed draft.

## Fix (smallest correct)

- `provider-state.ts`: `ProviderUI` gains an optional
  `isLocalHostUrlDirty?: () => boolean`; `syncProviderUI` skips the
  `localHostUrl.value` assignment when it returns true. Absent guard ⇒ behaves
  exactly as before (all other call sites unaffected). No new state system.
- `options/controller.ts`: module-level `localHostUrlDirty` — set by the URL
  field's real `input` listener, cleared after a committed save. The
  post-save `syncProviderUI` runs while dirty is still true (it skips the URL
  write; the field already holds what was persisted, so a write-back would
  only move the caret), then the bit clears so a *future* cross-tab sync
  writes the field again. `OptionsElements` carries
  `isLocalHostUrlDirty?: () => boolean`, wired in `getElements()` to the flag.
  Every `syncProviderUI` call site (load, save, onChanged) inherits the guard
  automatically.

## Not in scope

- No change to the debounce, the save shape, or the permission flow.
- No change to the other synced fields (provider dropdown, enable checkbox,
  voice) — cross-tab sync of those continues to apply even while the URL field
  has an uncommitted edit (proven by the shield test).
