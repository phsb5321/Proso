# Implementation Plan — Feature 228 deliberate popup design

**Branch:** `228-design-coherence-reset`
**Date:** 28/08/2026
**Spec:** `specs/228-design-coherence-reset/spec.md`

## Summary

Make the Firefox toolbar popup a deliberate current-page transport without changing behavior. Load an explicit popup role contract derived from the existing Proso identity, simplify the visual hierarchy, remove dead summary markup/code/styles, and add deterministic light/dark/first-run visual acceptance plus the existing loaded-Firefox journey.

This is the first independently shippable slice of the researched facelift roadmap. Settings, page player, and marketing remain separate features.

## Technical context

- **Language:** TypeScript 5.9, HTML, CSS.
- **Runtime:** WXT Firefox MV2/Chrome MV3 extension popup.
- **Dependencies:** existing WXT, UnoCSS, Jest/JSDOM, Playwright; no new runtime or development dependency.
- **Storage/data:** unchanged.
- **Testing:** Jest popup/accessibility suites; seeded fast-check; Docker-only Playwright popup visual suite; existing geckodriver loaded-Firefox public actor.
- **Target:** Firefox 109+ toolbar popup; Chrome compilation remains required.
- **Performance:** no new network/font/runtime dependency; less DOM/CSS and no looping decoration; popup initialization behavior unchanged.
- **Constraints:** fixed 360 CSS-pixel intrinsic popup width (Firefox starts intrinsic sizing near 20px, so `100vw` caps collapse tabpanels), intrinsic minimum height 280px, max 550px normal viewport, 200% browser zoom with an expanded outer panel and no horizontal overflow, 44px critical targets, executable contrast-pair matrix, light/dark divergence, reduced-motion parity.
- **Scope:** popup markup/style/element registry, additive shared role tokens, popup-only visual tests/snapshots, feature documentation.

## Constitution check

### Privacy — PASS

No new data collection, telemetry, destination, provider request, permission, or storage. Usage instrumentation proposed by one external critic is explicitly rejected because Principle I forbids behavioral tracking.

### Security — PASS

No credential or message-path change. First-run destination and permission language remains. Removing dead summary DOM reduces dormant attack/focus surface.

### User experience — PASS, load-bearing

The feature exists to improve hierarchy while preserving keyboard reachability, visible feedback, light/dark support, trust copy, cost/credit state, and error recovery. A style-only screenshot cannot overrule deterministic behavior/accessibility checks.

### Modular architecture — PASS

No domain/port/adapter change. Shared additions are CSS role tokens; popup remains the only consumer in this slice. Dead element references are deleted at the entrypoint boundary.

### Testing — PASS when complete

A new built-popup visual contract must fail on missing selectors, forbidden generic effects, contrast-role drift, and overflow. Existing public-control Firefox journey remains the real product gate.

## Technical approach

### 1. Explicit popup role contract

Add non-breaking brand-role tokens to `packages/extension/src/styles/tokens.css` and explicitly load tokens in the popup entrypoint. Existing settings/footer tokens retain current values until their own slices.

Popup roles:

- paper/ink/surface/line;
- on-ink spring green and on-paper deep green, with an executable allowed-pair matrix;
- primary/secondary/muted text;
- brand accents explicitly non-semantic;
- semantic success/warning/error/info with text/icon state, including credit exhaustion;
- compact spacing/type/radius/focus tokens.

The popup stylesheet consumes these roles directly instead of relying on unrelated literal fallback values. Tests compute contrast and reject spring-green-on-paper plus deep-green-on-ink.

### 2. Markup subtraction

In `popup/index.html`:

- preserve header, tabs, player, first-run, highlighting, queue, cost/credits, footer;
- mark the state-dependent play button as the primary transport role;
- remove the entire hidden AI Summary section;
- keep existing IDs/public accessible names for behavior that remains;
- use wording changes only where stale/decorative copy is explicitly called out.

In `popup/main.ts`, remove summary-only element registry entries and the runtime hide branch. No message/storage behavior changes.

### 3. Hierarchy-first CSS

Refactor `popup/style.css` in place, preserving production class names:

- flat tab rail with selected underline/edge, not a filled segmented pill;
- status + position as one typographic row with a separator, not a card;
- solid state-dependent primary transport, no gradient/glow/scale;
- visible speed row retained;
- cost/credits become secondary data rows, hidden under existing runtime rules when irrelevant;
- bounded route/error/queue containers only where content ownership warrants them;
- light paper default and equivalent ink dark mode;
- reduced motion and focus remain explicit;
- delete summary-only CSS and obsolete generic styles instead of adding overrides at the end.

### 4. Deterministic visual contract

Add `packages/extension/tests/visual/popup-page.test.js` using the existing built-page HTTP server and Firefox visual project. Abort popup JS for static visual modes, then set only documented mode classes/hidden attributes for player/first-run/permission/account fixtures. DOM/style assertions run before snapshots.

Coverage includes player light/dark with a deterministic divergence check, first-run with both routes, keyboard focus, permission repair, Queue with a long title, populated/exhausted credits/cost, reduced motion, and 200% browser zoom with the doubled outer viewport. The loaded-Firefox actor separately proves the intrinsic width produces a nonzero visible tabpanel.

The test/plant runner (whichever reuses the existing harness with less code) must prove:

- missing status/speed/Queue/focus fails;
- invalid foreground/surface pairings or brand-green semantic status fail;
- restored gradient/glow/filter/hover-scale in CSS or built JS fails;
- identical light/dark roles/renders fail;
- replacing the fixed intrinsic width with a viewport-relative cap fails the loaded-Firefox visible-panel check; 200% zoom overflow fails the static contract.

No unrelated baseline is regenerated. The built-popup test asserts tab/tabpanel roles; the existing production-controller Jest suite remains authoritative for ArrowLeft/ArrowRight/Home/End focus movement.

### 5. Existing behavior gates

Run focused popup unit/accessibility tests, full unit baseline, Firefox/Chrome builds, seeded fuzz, `make verify`, popup visual Docker run, and the real-host loaded-Firefox journey. Retain seed and exact-head receipts.

## Files

```text
specs/228-design-coherence-reset/
├── spec.md
├── plan.md
├── research.md
├── tasks.md
├── contracts/popup-visual-contract.md
└── evidence/
    ├── current-popup.png
    └── current-site.png

packages/extension/src/styles/tokens.css
packages/extension/src/entrypoints/popup/index.html
packages/extension/src/entrypoints/popup/main.ts
packages/extension/src/entrypoints/popup/style.css
packages/extension/tests/visual/popup-page.test.js
packages/extension/tests/visual/popup-page.test.js-snapshots/*.png
scripts/ or packages/extension/tests/visual/  # only if a separate plant runner is smaller
```

## Delivery order

1. research/spec/contract;
2. pre-fix capture and forbidden-style/missing-surface plants;
3. additive role tokens + explicit popup load;
4. markup/code subtraction;
5. CSS hierarchy refactor;
6. visual contract/control/plants;
7. deterministic + browser gates;
8. different-family exact-head review;
9. safe-class PR/merge and Plane/save-state update.

## Complexity tracking

No constitutional violation or new abstraction is required. The feature intentionally does **not** create a cross-surface component library: CSS role tokens plus existing semantic markup are sufficient, and a library would import another generic aesthetic while expanding runtime/dependency scope.
