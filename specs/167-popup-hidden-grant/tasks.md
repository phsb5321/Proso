# Feature 167 tasks

## 1. Fix the CSS (smallest scoped correction)

- [x] Add `.proso-popup__grant[hidden] { display: none }` to
  `packages/extension/src/entrypoints/popup/style.css`.
- Evidence: planted pre-fix CSS → regression Direction A fails
  (`Expected: "none" Received: "flex"`); fixed CSS → passes.

## 2. Fix the grant action (activation order)

- [x] Cache `pendingGrantOrigin` in `maybeShowGrantAffordance` (set on show,
  cleared on hide).
- [x] `handleGrantAccessClick` calls `browser.permissions.request` as its FIRST
  await (no storage read before it).
- Evidence: measured in real Firefox — an await before the request throws
  "may only be called from a user input handler" (the old handler could never
  grant); the fixed handler materialises the origin on a trusted click.

## 3. Regression check — both directions, runnable

- [x] `packages/extension/tests/unit/entrypoints/popup-hidden-attribute.test.ts`:
  - Direction A (fresh): hidden attr, computed display none, no layout box, no
    tabindex hack; fails on the planted pre-fix CSS.
  - Direction B (permission-needed): controller-equivalent unhide with nonempty
    reason → visible (flex), named, enabled.
  - Source guards: `[hidden]` rule present; markup keeps `hidden`;
    permissions.request is the first await in the click handler.

## 4. Firefox public journey

- [x] `scripts/popup-hidden-grant-gate.mjs` + `make popup-hidden-grant-gate`:
  - Direction A: real popup panel, fresh profile — names exclude "Grant
    access"; row hidden/0×0; real Tab cycle never focuses it.
  - Direction B: settings public controls enable host1 (real grant); configured
    origin switched to an un-granted host; Play → gate marker → affordance
    visible+named (real panel); trusted click on "Grant access" → origin
    materialises + row hides.
  - Verdict: PASS (0), FAIL (1), BLOCKED (2) — never skipped-green.

## 5. Deterministic gates

- [x] `make doctor`, focused unit tests, full unit suite.
- [x] Extension lint (no new warnings), `tsc --noEmit`.
- [x] `pnpm build` (firefox-mv2) + `pnpm build:chrome` (chrome-mv3).
- [x] `make fuzz` (seeded).
- [x] `make verify` (fast deterministic floor).
- [x] `make popup-hidden-grant-gate` (real Firefox journey).

## 6. Delivery

- [ ] `specs/167-popup-hidden-grant/{spec,plan,tasks}.md` committed with the diff.
- [ ] Commit + push branch `167-popup-hidden-grant`.
- [ ] Open PR; required checks green.
- [ ] Different-family review (Codex) ALLOW (fail-closed).
- [ ] Safe-class squash merge; confirm `state=MERGED`.
- [ ] Update Plane PROSO-44: active branch 167 + merge + readback.
- [ ] Immutable-head receipt with artifacts + the git-stash violation record.
