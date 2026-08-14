# Feature 167 plan — hidden grant row

## Goals / non-goals

- **Goal:** the popup grant row honors the platform `hidden` attribute; a fresh
  reader never sees an empty, focusable Grant-access action; the
  permission-needed state remains visible, named and actionable.
- **Goal:** the grant action actually works (first-await `permissions.request`).
- **Non-goal:** any new state system, storage change, or manifest change.

## Approach

1. **CSS-only fix for visibility.** `.proso-popup__grant[hidden] { display:
   none }` in `style.css`. Reuses `hidden`; no JS state.
2. **Controller fix for actionability.** Cache `pendingGrantOrigin` in
   `maybeShowGrantAffordance`; make `handleGrantAccessClick` call
   `browser.permissions.request` as its first await (measured requirement:
   any preceding await throws in real Firefox).
3. **Regression check (both directions, runnable).** jsdom test against the
   checked-in `index.html` + `style.css` + `main.ts`:
   - Direction A: `hidden` attr present, computed `display:none`,
     `offsetParent === null`, no `tabindex` hack; the planted pre-fix CSS
     makes this FAIL (`display: flex`).
   - Direction B: controller-equivalent unhide with nonempty reason →
     `display:flex`, reason named, button named + enabled; plus a source guard
     that `permissions.request` is the first await in the click handler.
4. **Firefox journey** (`scripts/popup-hidden-grant-gate.mjs`):
   - Direction A: real popup panel (Unified Extensions → browser action),
     fresh profile: names exclude "Grant access", row hidden + 0×0; real Tab
     cycle on popup-as-page never focuses the grant button.
   - Direction B: enable host1 via the settings public controls (real grant),
     switch the configured origin to an un-granted host, Play → gate fails
     with the marker → affordance visible+named (real panel); popup-as-page
     same failure → trusted WebDriver click on "Grant access" → the origin
     materialises in `permissions.getAll()` and the row hides.

## Risks / mitigations

- **Firefox user-activation:** synthetic clicks cannot grant; the journey uses
  the trusted WebDriver element click on the popup-as-page window (the same
  mechanism that grants in the settings page). Documented limitation: the
  post-grant retry runs against the popup page (no active article tab), so the
  journey asserts grant + hide, not audio; real audio after a grant is covered
  by the shared local-host-journey-gate.
- **`<all_urls>` materialisation:** a runtime reload materialises the
  content-script `<all_urls>` grant and makes the gate pass for every origin;
  the journey therefore never reloads after the settings Enable (measured).
- **Biome pre-existing warnings:** 70 warnings in 10 untouched src files are
  identical at base; no new warnings from the diff.

## Slice

Single atomic diff: style.css + popup/main.ts + the regression test + the
journey gate + Makefile target + specs. Safe class: 1 service (extension
popup), one `git revert` undoable.
