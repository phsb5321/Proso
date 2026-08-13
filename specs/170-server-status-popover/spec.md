# Feature 170 — Settings server-status popover must remain visible and accessible

**Status**: in progress (13/08/2026)
**Owner**: Dokku deploy seat `w2:pJ` (fleet w2 proso pane)
**Branch**: `170-server-status-popover` (from `8b8a6b6`)
**Plane target**: #17 (popover z-layer + narrow visibility)

## Problem (hypothesis)

The server-status detail is trapped/clipped by a header/container stacking or
overflow context despite `z-index: var(--z-popover)`, so hover/focus cannot
reliably place it above adjacent settings controls at desktop/mobile widths.

## Measured reality (built page, real Firefox-nightly via geckodriver, 13/08)

The hypothesis was **wrong about the mechanism and right about the symptom**.
Measurements of the built page served over HTTP (never file://):

| State | Before fix | After fix |
|---|---|---|
| desktop 1024 | header 73px, detail 80–184 unclipped, topmost over the first card | unchanged (no desktop defect) |
| narrow 375 | **header 1812px; status at y=943, theme select at y=1827; page auto-scrolled 648px** — the popover and the entire header landed mid-page | header 173px; status y=60; detail 116–220, unclipped, topmost |
| narrow 320 | same breakage | same fix |
| aria-hidden | **static `"true"` even while visible** — the popover content was invisible to assistive tech | reflects real visibility (hover/focus reveal → false; blur/leave → true) |

**Root cause (measured, not guessed):** the base `.container` declared no
`grid-template-areas`, while `.header`/`.settings-sidebar`/`.main-content`/
`.footer` all carry `grid-area` names. With no declared areas at ≤768px the
names do not resolve and Firefox drops each item into an **implicit** track —
the header landed in an implicit ~1812px row (measured
`containerRows: "0px 0px 0px 0px 1812.67px"`, `computedCols` 3 tracks),
stretching `justify-content: space-between` across the void and scattering
the header children down the page. The popover inherited that placement.

## Solution

1. **CSS (root cause):** declare single-column named areas in the base
   `.container` (`"header" "sidebar" "main" "footer"` with
   `auto auto 1fr auto` rows) so the `grid-area` names resolve at every
   width; the ≥769px media query keeps its desktop areas/rows unchanged.
   No z-index escalation — none was needed.
2. **JS (a11y):** the controller now syncs `aria-hidden` on the detail to
   its real CSS-driven visibility via `pointerenter`/`pointerleave`/
   `focusin`/`focusout` on the status container. `role="status"` on the
   container is preserved; the refresh button stays 44×44; reveal stays
   hover + `:focus-within` (no popover/dialog conversion, so no Escape
   contract change).

## Regression

`scripts/server-status-popover-gate.mjs` — loaded built extension in a real
dedicated Firefox profile (raw geckodriver; no host Playwright). Asserts
across desktop/narrow/zoom-150%/dark: header sanity, single column,
populated popover revealed by keyboard focus, unclipped, topmost at overlap
points (`elementFromPoint` probes), `aria-hidden` reflection under real
pointer hover and focus, 44px refresh target.
`scripts/server-status-popover-plants.mjs` — proves each assertion catches
the planted break: `grid-areas` (injected pre-170 CSS → header 1812px →
RED) and `aria-static` (static aria-hidden → RED). Makefile targets:
`server-status-popover-gate`, `server-status-popover-plants`.

## Acceptance criteria

1. Gate PASS (all 11 assertions) on the built loaded extension.
2. Plants PASS (3 caught, 0 missed — control + 2 planted breaks).
3. Narrow header ≤300px, single column, popover unclipped and topmost.
4. `aria-hidden` mirrors visibility; role/status semantics preserved.
5. Settings accessibility suite (axe) stays zero critical/serious.
6. `make verify`, `make quality`, security/dependency gates, extension
   lint/type/build/fuzz all pass.
7. Browser receipt recorded in the handoff (light/dark/narrow/zoom).
