# Feature 179 plan — provider-sync uncommitted-edit guard

## Goals / non-goals

- **Goal:** the settings page never rewrites the local-host URL field while
  the reader has an uncommitted edit in it (no caret jump from the page's own
  debounced write, no clobber of an in-flight edit from a cross-tab write).
- **Goal:** cross-tab sync of the other provider fields is untouched.
- **Goal:** a merely focused-but-unedited field still receives cross-tab
  values — a save fired by a *different* control (voice/enable `change`) must
  never persist a stale field back over a cross-tab change.
- **Non-goal:** changing the debounce/save shape, the permission flow, or any
  other field's sync behavior.

## Approach

1. **Guard in the pure module.** `ProviderUI.isLocalHostUrlDirty?: () =>
   boolean`; `syncProviderUI` skips the `localHostUrl.value` write when the
   guard is true (absent ⇒ previous behavior). Keeps the module pure and
   directly unit-testable.
2. **Dirty bit in the controller, not focus.** `controller.ts` keeps a module
   `localHostUrlDirty` flag: set by the URL field's real `input` listener,
   cleared only after a committed save (`saveLocalHostSettings` success). The
   guard closure reads the flag lazily. `document.activeElement` is NOT the
   guard: a focused-but-unedited field must keep receiving cross-tab syncs, or
   the stale-write-back path (a later save from another control persisting the
   out-of-date field value) reopens.
3. **Commit-boundary ordering.** The post-save `syncProviderUI` runs while
   dirty is still true (it skips the URL write — the field already holds what
   was persisted, so a write-back would only move the caret), then the bit
   clears so a *future* cross-tab sync writes the field again.
4. **Runnable regression** in the existing `provider-state.test.ts`:
   - Direction A (dirty): sync must not reassign the in-flight value.
   - Direction B (not dirty / no guard): stored URL still lands.
   - Direction C (focused-but-unedited): the cross-tab value still lands — the
     stale-write-back hole the review gate found in the focus-keyed draft.
   - Shield: provider/enable/voice still sync while the URL field is guarded.

## Risks / mitigations

- An in-flight edit intentionally goes stale on a cross-tab write until the
  next save — that is the correct trade: the reader's uncommitted edit wins,
  and their next save writes it. The guard is keyed on the EDIT (input since
  last save), so mere focus never extends this window.
- The dirty bit is module state; a page reload resets it to false, which is
  correct (an uncommitted edit does not survive a reload anyway).

## Slice

Single atomic diff: `provider-state.ts` + `controller.ts` + tests + specs. One
service (extension settings page); one `git revert` undoable.
