# Feature 162 — First-run onboarding (PROSO-134 / Plane #27)

**Status**: spec — planned for implementation in this slice. **Branch**:
`162-first-run-onboarding`.

## Problem

A reader with nothing configured (fresh browser: no BYOK key, no local host,
no license key) presses Play. Today the popup surfaces a server **402 about
billing tiers** — a message about money, for someone whose actual problem is
that nobody ever offered them a way to start. Measured on three browsers over
two days (PROSO-134 evidence). INV-001's delivery path (the local host, #129)
exists but was hidden behind a settings form nobody is told about.

The fix is not a better form. It is: when there is nothing configured, the
popup's first surface is the two free routes, inline, each one click from
working audio.

## Goal

A fresh reader reaches actual account-free audio from popup-only onboarding in
**≤ 3 user clicks**, never leaving the popup, never seeing the settings page.
The two honest routes: the user-operated synthesis host and BYOK. A configured
reader keeps the normal player and sees no new prompts (falsifier B).

## Requirements (binding)

- **R-1 derived state.** `isUnconfigured = !localHostEnabled && !anyByokKey &&
  !licenseKey` — computed once at popup init and re-checked on storage change.
  When true, the first-run panel replaces the player's status/progress/controls.
- **R-2 no 402 as an introduction.** Every playback-start failure routes
  through one classifier; `unconfigured` and `entitlement` (402) classes show
  the first-run panel inline — a 402 is only correct for a configured reader
  on a managed route, and even then it carries "Show free routes".
- **R-3 one gesture.** Route A Connect = validate → grant → test → save → play,
  each step reporting its own failure inline; `permissions.request()` fires
  synchronously from the Connect click (constitution 2.1.0 condition 3).
- **R-4 offer, never probe.** No mDNS/subnet/localhost sweeps, no shipped
  address. The address field prefills only from `localHostUrl` already in
  storage. `grep -ri "orangepi\|tailf59220" packages/extension/src` empty.
- **R-5 destination disclosed.** The panel states where page text goes.
- **R-6 every failure pairs with a fix action** (generalised PROSO-131):
  unconfigured→Show free routes, entitlement→Show free routes,
  grant-missing→Grant access, host-unreachable→Retry, key-rejected→Edit key.
- **R-7 language wiring (root cause).** The popup journey must produce audio:
  the effective language reaches PlaybackService through the existing #147
  wiring (playback.handlers derives it before start); the Connect flow saves
  `localHostVoice: null` (Automatic) so the host picks its matching voice by
  that language. No new masking of `unsupported_language`.
- **R-8 zero managed requests on the local route.** No `/api/v1/tts/synthesize`
  requests from the local path (server synthesis is never called).
- **R-9 no settings-page redirect** in the primary path.

## Falsifiers

- **A** — fresh Brave dev profile, Orange Pi reachable: Play → first-run panel
  → Connect → Allow → audio, ≤3 clicks, no settings page. Report the click
  count.
- **B** — configured profile (host or BYOK present): no new prompts, no
  behaviour change.
- **C** — clear storage → Play → panel shows the two routes, not a tier error.
- **D** — `permissions.request()` called from a user-initiated handler; a
  programmatic grant path fails the test.
- **E** — grep for probe patterns empty; a planted probe fails a test.

## Non-goals

Settings-page changes, discovery, server changes, credits, the offscreen
shim (do not touch — its prior rewrite was falsified), managed-route changes.
