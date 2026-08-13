# Feature 153 — Licence wallet settings

## Goal

A customer who already has a Proso licence key can configure it through the
extension's public settings journey, see the paid plan and current credit
balance that the server actually confirms, and keep using the last working key
when a replacement attempt fails.

## User outcomes

### Configure a purchased licence

A reader opens settings through the extension's public browser controls, finds
a labelled password field, enters the key they received, and invokes one
explicit **Save & validate** action. Success names the paid tier and remaining
credits only after the candidate key has been accepted and independently read
back as the key for a paid subscription.

### Keep the last working licence

A typo, unknown key, contradictory Free subscription, timeout, server error, or
local persistence error leaves both the durable key and the currently running
reader on the previously working key. The failure line names what happened and
states which configured state remains.

### Reopen without revealing the credential

After closing and reopening settings, the page says a key is configured, shows
only a fixed-width mask plus a short suffix, and re-reads the current tier and
credits. The input stays empty. The raw key is absent from page text, URLs,
telemetry, console output, and extension logs.

## Requirements

- **FR-001:** The paid-account section has an accessible name and description, a
  labelled password input, an explicit **Save & validate** button, and a polite
  live status region. It also states that reading through a reader-operated host
  or BYOK needs no account or licence key.
- **FR-002:** Validation sends the candidate only in the validation request body.
  A previously configured key is not added to that public request, and no key is
  put in a URL, query string, log, telemetry event, or rendered error detail.
- **FR-003:** Success requires all of: `valid:true`, a paid tier with managed
  synthesis entitlement, an authenticated subscription readback for the same
  candidate, and a finite non-negative credit balance whose remaining value is
  no greater than its total. The readback tier and balance are what the UI
  reports; optimistic or fallback values do not count.
- **FR-004:** Candidate adoption and durable persistence behave as one serialized
  operation from the user's perspective. Every failure leaves the prior live
  client state and prior storage unchanged. A failed durable write is a
  visible failure, never partial success.
- **FR-005:** A successful write is visible immediately to the live API client
  and survives a close/reopen through the same browser storage key read at
  extension startup.
- **FR-006:** Reloaded settings never hydrate the raw key into the field. Short
  keys disclose no suffix; longer keys disclose at most four characters and no
  key length.
- **FR-007:** The retained Firefox actor opens settings through the Unified
  Extensions button, the Proso browser action, and the popup control named
  **Open settings**. After setup it uses only public controls to enter, save,
  close, reopen, and retry. Missing Firefox, geckodriver, control, accessible
  name, or observable state is BLOCKED rather than skipped.
- **FR-008:** Deterministic plants catch an unknown key, a paid validation
  contradicted by a Free subscription, a network failure, missing persistence,
  overwrite-after-failure, and renamed public controls. A dead gate is CRASH,
  never a caught plant.
- **FR-009:** Existing account-free local-host and BYOK journeys remain
  unchanged.

## Non-goals

- Selling, minting, claiming, or retrieving a licence key.
- Adding checkout or account creation to the extension.
- Changing server, site, deployment, or either status ledger.
- Claiming fixture acceptance proves the production money path or a real sold
  key; this feature proves the extension side once a valid key exists.

## Acceptance

Each statement is independently falsifiable and runner-backed; this repository
has no maintained Gherkin runner, so the native Jest and Firefox gates are the
acceptance layer.

- The focused handler/API/status suites pass and include storage-failure,
  contradictory-subscription, concurrency, masking, and header-boundary cases.
- `FC_SEED=20260730 FC_NUM_RUNS=2000` reproduces the licence mask campaign.
- The built Firefox extension completes `scripts/license-settings-gate.mjs`
  through public settings controls and writes a receipt bound to the tested
  commit/build.
- `scripts/license-settings-plants.mjs` reports every planted break caught,
  including CRASH self-detection.
- Removing candidate adoption or durable persistence makes the corresponding
  deterministic assertion fail before the change is restored.
