# Plan — 162 first-run onboarding

## Shape

Minimal static popup change; no new dependency, no new abstraction layer.

- `packages/extension/src/utils/first-run.ts` — pure decisions + the connect
  orchestrator with injected browser/permissions/fetch deps (unit-testable).
- `packages/extension/src/entrypoints/popup/index.html` — first-run panel as
  the first child of `#panel-player` (UX contract markup, ids/testids:
  `popup-first-run`, `popup-first-run-host-url`, `popup-first-run-host-connect`,
  `popup-first-run-host-status`, `popup-first-run-byok-*`).
- `packages/extension/src/entrypoints/popup/style.css` — panel styles
  (UX tokens; no raw colors).
- `packages/extension/src/entrypoints/popup/main.ts` — wiring only: state
  refresh at init + storage change, play-failure classifier routing, Connect
  and Use-this-key click handlers, panel visibility toggling via a
  `proso-popup__panel--firstrun` class hiding status/progress/controls.

## Failure classifier (single place)

`classifyFailure(errorMsg, {hasHost, hasByok})`:
`unconfigured | entitlement | grant-missing | host-unreachable | key-rejected`
— keys on the real markers: the local gate's
"no access to the configured host origin", the server 402 copy
("Managed TTS is not included"), payment_required, and host/key error shapes.
`FIX_ACTION` maps each class to one action.

## Connect order (R-3, synchronous from the click)

validate (https-or-loopback, no path) → grant (`permissions.request` with the
click event passed — a null/absent event fails without requesting) → test
(`GET /v1/capabilities`, ~10s abort) → save (`{localHostUrl: origin,
localHostEnabled: true, localHostVoice: null, provider: 'local'}`) → play
(panel hides, player shows, playback.start retried).

## Language (R-7)

No change to the #147 wiring: `playback.handlers` derives the effective
language before start and `service.setLanguage` carries it into every
AudioRequest; the local adapter's resolveVoice matches the primary subtag
(spec D-2). Connect stores `localHostVoice: null` so selection stays language-
driven. A regression test asserts the local-route request carries a real
language (never 'und') when the page language is known.

## Tests

- `tests/unit/utils/first-run.test.ts` — isUnconfigured, classifier classes,
  connect step order + step errors, grant-requires-event (falsifier D), no
  probe-strings in the module (falsifier E).
- Red-before/green-after: write the classifier test first, watch it fail
  (marker string absent), implement, green.
- Popup wiring source-pins: the panel markup present + the click listeners
  pass the event.
- Existing suites stay green; local-route journey asserts zero
  `/api/v1/tts/synthesize` calls (R-8).

## Gates

doctor/bootstrap → focused red/green → fuzz → extension unit suite →
local-host live journey + plants → Firefox loaded-extension journey →
chrome-mv3 diagnostics (C1–C5) → a11y markup checks → no-probe grep →
`make verify` applicable stages → Codex adversarial review → self-merge.
`make user-gate` exiting 2 is BLOCKED, never skipped-green.
