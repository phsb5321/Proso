# Feature 153 — Plan

**Branch**: `153-license-settings` | **Date**: 12/08/2026 | **Spec**: [spec.md](spec.md)

## Summary

Finish the existing licence plumbing with one small paid-account settings
surface. Keep the raw credential in the background, validate before mutation,
confirm the candidate through the authenticated subscription route, commit the
live client plus browser storage transactionally, and prove the journey in a
real loaded Firefox through the popup's public **Open settings** control.

## Technical context

- **Language/runtime:** TypeScript 5.9, Node 22, WXT 0.20, Firefox MV2 first.
- **Dependencies:** Existing WXT browser APIs, handler registry, API client port,
  config storage, Jest/fast-check, raw geckodriver harness. No new dependency.
- **Storage:** Existing `browser.storage.local` `licenseKey` entry read by the
  composition root at startup.
- **Targets:** Firefox 109+ behavior; Firefox, Chrome, and Edge builds remain
  compilable.
- **Verification:** Focused Jest, seeded fuzz, delivery floor/full gate, real
  Firefox actor and planted-failure sweep, different-family DeepSeek review.

## Constitution check

| Principle | Effect on this plan |
|---|---|
| I — privacy | The options page never receives a raw stored key. Validation carries only the candidate body; authenticated readback carries only the candidate header. No telemetry or logging is added. |
| II — security | The key stays in extension-local storage/background state, never content/page context or a URL. Untrusted server error detail is not rendered because it could echo the credential. |
| III — UX | Save gives immediate loading state, specific failure, paid tier and remaining credits, plus honest configured/offline states. Native controls and the live region preserve keyboard/screen-reader access. |
| IV — hexagonal architecture | The UI talks only to registered handlers. The handler uses the existing API-client port and storage boundary; the composition root wires the exact API client used for synthesis. |
| V — critical paths | Unit tests cover transaction ordering and rollback; the built-extension Firefox actor covers the public path; plants prove the gate can fail. |
| INV-001 / INV-002 | Paid settings explicitly preserve the account-free local-host and BYOK choices. No key becomes a precondition for reading. |

No constitutional exception is required.

## Implementation sequence

1. Preserve and audit the failed seat's entire dirty tree; capture the focused
   unit/type/browser baseline and name proof gaps before editing.
2. Add the tracked spec, plan, and tasks required by repository governance.
3. Harden the API boundary so public validation does not attach an old key.
4. Make licence mutation serialized and rollback-safe across validation,
   authenticated readback, durable storage, and live-client adoption. Report
   subscription readback values only; reject missing or impossible balances.
5. Keep the UI minimal and incumbent: paid-account accordion, labelled password
   field, one Save & validate action, live status, fixed-width masked reload.
6. Make the Firefox actor open settings publicly through Unified Extensions →
   Proso → Open settings, then close/reopen through that same path. Predetermine
   fixture failures so the observer never edits fixture state mid-journey.
7. Add plants and source-level falsifiers for missing controls, false paid
   success, missing persistence, and overwrite after failed validation.
8. Run focused checks, seeded fuzz, both extension builds, existing local-host
   regression journey, full deterministic delivery floor, and the Firefox gate.
9. Commit, rebase onto `origin/main`, re-run affected post-rebase gates, obtain
   DeepSeek-family Sentinel review, repair every blocking finding, then push and
   open a PR without merging.

## Key design decisions

- **Subscription readback is authoritative.** Validation's tier/credits are not
  used as a fallback; success without current readback credits would report an
  unobserved value.
- **No raw server detail in licence errors.** Status and local error categories
  are actionable enough, while arbitrary response text can echo a submitted
  secret.
- **Serialize in the background, not only the page.** Button disabling cannot
  protect two settings tabs or repeated runtime messages.
- **Use direct extension storage for the licence transaction.** It is the same
  key the composition root reads and avoids the legacy settings cache updating
  before its own persistence promise succeeds.

## Risks and mitigations

- **Partial commit:** storage fails or an unconfirmed candidate reaches the live
  client. Keep the old client key until storage succeeds; regression-test both states.
- **Concurrent tabs:** two candidates interleave on one mutable API client.
  Serialize status/validation operations and prove no overlap.
- **False public actor:** privileged navigation directly to `settings.html`
  bypasses the user journey. Use it only for pre-journey fixture setup; every
  settings open/reopen in the actor phase comes from the popup control.
- **Fixture mistaken for production:** receipt explicitly says it proves only
  the extension side and records the process-model relaxation.
