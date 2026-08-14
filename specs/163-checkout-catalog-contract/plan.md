# Feature 163 — Plan

**Branch:** `163-checkout-catalog-contract`
**Date:** 13/08/2026
**Tracker:** Plane PROSO-41

## Summary

Declare the checkout catalog once in the existing static
`checkout-config.js`, consume it in `checkout.js`, and make deploy readiness
load the shipped checkout page to prove every runtime control and selectable
period is represented. Extend the existing checkout-surface oracle with a
specific drift plant.

## Technical context

- Static HTML/CSS/vanilla JavaScript only.
- Node.js gate code uses existing `vm`, filesystem, and jsdom dependencies.
- No production token, price, API, database, framework, or package change.
- Existing checkout surface and mutation runner remain the acceptance harness.

## Constitution check

- **Privacy:** PASS — no new data flow, analytics, or external request.
- **Security:** PASS with executable gate — an unenumerated money-taking control
  must fail closed before deployment.
- **UX:** PASS — shipped disabled controls and visible reasons are unchanged.
- **Architecture:** PASS — the source of truth stays at the static checkout
  boundary and Node gates consume it; no domain/runtime dependency inversion.
- **Critical-path tests:** PASS with plant — the near-miss is required to fail
  and name catalog drift.
- **Spec tracking:** PASS — spec, plan, and tasks ship with the implementation.

## Implementation

1. Add a frozen `catalog` declaration to `checkout-config.js` next to the empty
   price matrix.
2. Make `checkout.js` accept only catalog tiers and catalog periods while
   preserving monthly/yearly toggle behavior.
3. Make deploy readiness validate the canonical catalog, scan the shipped
   pricing controls/selectable periods, and derive completeness/liveness from
   that catalog.
4. Add a focused gate assertion and plant that introduces a runtime-visible
   paid tier outside the readiness catalog.
5. Run clean/plant gates, delivery floor, security/dependency checks, then a
   direct DeepSeek immutable-head review.

## Complexity tracking

No constitution exception. A dedicated shared TypeScript module would require a
static-site build pipeline that does not exist; placing the plain-data catalog
inside the already canonical, browser-loaded checkout config is the smallest
single source of truth for both vanilla runtime and Node readiness.
