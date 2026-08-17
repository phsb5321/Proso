# Feature 179 plan — provider-sync focus guard

## Goals / non-goals

- **Goal:** the settings page never rewrites the local-host URL field while the
  reader is typing into it (no caret jump from the page's own debounced write,
  no clobber on a focused field from a cross-tab write).
- **Goal:** cross-tab sync of the other provider fields is untouched.
- **Non-goal:** changing the debounce/save shape, the permission flow, or any
  other field's sync behavior.

## Approach

1. **Guard in the pure module.** `ProviderUI.isLocalHostUrlFocused?: () =>
   boolean`; `syncProviderUI` skips the `localHostUrl.value` write when the
   guard is true (absent ⇒ previous behavior). Keeps the module pure and
   directly unit-testable.
2. **Wire from the controller.** `getElements()` supplies the guard from
   `document.activeElement`; all three `syncProviderUI(elements, …)` call sites
   (load, save, onChanged) inherit it with no per-site changes.
3. **Runnable both-directions regression** in the existing
   `provider-state.test.ts`:
   - Direction A (focused): sync must not reassign the in-flight value.
   - Direction B (not focused / no guard): stored URL still lands.
   - Shield: provider/enable/voice still sync while the URL field is guarded.

## Risks / mitigations

- A focused field intentionally goes stale on a cross-tab write until the next
  save — that is the correct trade: the reader's in-flight edit wins, and their
  next save writes it.
- `document.activeElement` equality is checked lazily (closure), so the guard
  reflects the moment the sync runs, not the moment `getElements()` ran.

## Slice

Single atomic diff: `provider-state.ts` + `controller.ts` + tests + specs. One
service (extension settings page); one `git revert` undoable.
