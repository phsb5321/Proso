# Tasks — 162 first-run onboarding

## T1 — pure module `utils/first-run.ts`
- `isUnconfigured(stored)` (R-1: localHostEnabled, 4 BYOK keys, licenseKey).
- `classifyFailure(errorMsg, {hasHost, hasByok})` + `FIX_ACTION` (R-6).
- `validateHostUrl(raw)` (https or http-loopback, no path).
- `connectLocalHost({address, event, perms, storage, fetch, notify})` — step
  order validate→grant→test→save; grant step refuses a null event (R-3, D).
- `saveByokKey({provider, key, storage, notify})`.
**Gate:** `tests/unit/utils/first-run.test.ts` red-first on the classifier
markers, then green; every step error observable; grant-requires-event.

## T2 — popup panel markup + styles
- index.html panel (UX contract markup) as first child of `#panel-player`.
- style.css panel styles; `proso-popup__panel--firstrun` hides
  status/progress/controls.
**Gate:** built popup.html contains the testids; a11y roles present
(status/live regions, labels).

## T3 — popup wiring (main.ts)
- Elements + `refreshFirstRun()` at init and on storage change.
- Play-failure routing through `classifyFailure` → panel / grant row /
  failure row with the FIX_ACTION button.
- Connect + Use-this-key click handlers passing the event; auto-play after
  connect (pending-play flag).
**Gate:** focused popup tests + source-pins; no 402 for unconfigured.

## T4 — regression + journey receipts
- Unit suite green; fuzz green; chrome-mv3 C1–C5 green; Firefox
  loaded-extension journey (local host live, click count ≤3); no-probe grep;
  local-route zero managed requests.
**Gate:** receipts pasted in the PR.

## T5 — adversarial review + merge
- Codex review (DeepSeek generator ⇒ Codex reviewer); repair findings.
- Poll required checks; self-merge when green/review-clean/safe.
