# Feature 167 — the hidden grant row must actually be hidden

## Problem

Plane PROSO-44, observed in `/tmp/proso-161-ux-receipt.md` ANOMALY-1: in a fresh
profile with nothing configured, the popup's `#grant-access-row` is VISIBLE. A
fresh reader sees an empty, focusable "Grant access" action with empty reason
text.

## Root cause (measured, not assumed)

`packages/extension/src/entrypoints/popup/style.css` ships
`.proso-popup__grant { display: flex }`. The CSS `display` property overrides
the platform `hidden` attribute: the UA rule `[hidden] { display: none }` loses
to the author's `display: flex` on the same element. Computed in-browser:
`rowDisplay=flex`, button rect 109.5×44 at (213,161), `hidden` attribute
present. The controller (`maybeShowGrantAffordance`) toggles `hidden`
correctly; the stylesheet defeated it.

Ship date: `git log -S proso-popup__grant` → `8124831` (PROSO-131 #140) —
pre-#161, not a #161 regression.

## Falsifier (both directions, in a fresh loaded extension)

- **Direction A — fresh/unconfigured:** the row has NO layout box and is ABSENT
  from tab order. Concretely: `hidden` attribute present, computed `display:
  none`, `getBoundingClientRect()` 0×0, "Grant access" absent from the popup's
  accessible names, and a real Tab cycle through the popup never focuses the
  grant button.
- **Direction B — permission-needed:** the controller intentionally removes
  `hidden` with a nonempty reason (the local-host gate's marker
  "no access to the configured host origin"), and the row becomes visible,
  named ("Grant access") and actionable. Actionable means a real user-gesture
  click on the button makes `browser.permissions.request()` grant the exact
  origin — not merely "the button exists".

## Root-cause analysis during the gate (additional measured defect)

The Firefox journey proved that even with a trusted click, the original grant
handler could not act: `handleGrantAccessClick` awaited
`browser.storage.local.get(['localHostUrl'])` BEFORE calling
`browser.permissions.request()`. Firefox requires the request from a user input
handler; the await expires the activation and the request throws "may only be
called from a user input handler". Measured side-by-side in the loaded
extension: a request with no preceding await → `OK true`; the same request
after an `await storage.get` → throws. The grant button therefore could never
grant — a grant action that can never grant is not an action, so the
"actionable" half of the falsifier was false. Fixed by caching the requested
origin at affordance-show time so the request is the first await in the click
handler (no new state system — a module-scope variable already written by the
show path).

## Fix (smallest correct)

1. `style.css` — add `.proso-popup__grant[hidden] { display: none }` (reuses
   the platform `hidden` feature; specificity 0,2,0 beats the class rule).
2. `popup/main.ts` — cache `pendingGrantOrigin` when the affordance shows;
   `handleGrantAccessClick` calls `permissions.request` as its first await.
3. Regression check — `tests/unit/entrypoints/popup-hidden-attribute.test.ts`:
   both directions against the real markup+CSS+controller source; planted
   pre-fix CSS turns Direction A red (measured: `Expected: "none" Received:
   "flex"`).
4. Firefox gate — `scripts/popup-hidden-grant-gate.mjs` (`make
   popup-hidden-grant-gate`): real dedicated-profile journey, both directions.

## Not in scope

- No new state system, no storage-schema change, no permission-manifest change.
- No change to the settings local-host flow, the gate, or the audio adapters.
- The fixture binds IPv4-only while Firefox resolves `localhost`→`::1` first —
  the gate path needs no host I/O (coverage check only), so this is not
  addressed here.
