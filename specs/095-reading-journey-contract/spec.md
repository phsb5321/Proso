# Feature 095 — Reading journey outcome contract

## Problem

The existing loaded-Firefox smoke proves a useful downstream diagnostic route,
but it invokes Firefox's internal `shortcuts.onCommand()` entry point and reads
around the sticky footer's closed shadow root. It cannot establish that a reader
can use Proso through public controls, nor that all product invariants survive
real-world failures.

## Goal

Make the acceptance contract for a user-visible reading feature outcome-based,
observable, replayable, and fail-closed. A command may be part of the evidence,
but no command passing is itself an acceptance criterion.

## Product outcomes

### Fresh free-tier reading (INV-001)

Given a fresh Firefox profile with no account, license key, or BYOK credential,
a reader opens a deterministic article and begins playback through a public
browser or extension control. The reader observes ready/loading then playing,
ordered article text is synthesized by the configured Proso fixture, and the
visible highlight advances without an authentication prompt.

**Falsifier:** an auth/key prompt, entitlement refusal, missing synthesis
request, text mismatch, or non-advancing public state. Current `main` is
therefore blocked: Free managed requests return 402 and browser TTS is absent.

### Accessible public controls

Every playback control is located and invoked by its public role and accessible
name, including through keyboard traversal. The reader can:

- pause, with the visible reading position holding;
- resume, with the position advancing;
- move to the previous and next paragraph;
- set speed, with visible playback state reflecting the new value;
- seek, with the position changing; and
- stop, with audio, highlight, and player state clearing.

The observer records deterministic state before and after each action. A
closed-shadow internal DOM query, handler invocation, extension message, or
storage mutation is not an actor action.

**Falsifier:** any listed control is absent, unreachable by keyboard, invoked
internally, leaves the expected public state unchanged, or leaves stale audio
or highlighting after stop.

### Privacy, BYOK, and accounting (INV-002, INV-004, INV-005, INV-006)

The observer retains sanitized fixture records proving that page text is sent
only to the configured Proso fixture during managed synthesis; free requests
contain neither a license key nor BYOK secret; malformed or failed synthesis
does not charge; and a cached repeat does not charge again. For BYOK, the Proso
API may receive the key only for the explicit synthesis request, may forward it
only to the selected provider, and must neither retain nor log it; managed
credit remains unchanged. Any future client-only route is never metered.

**Falsifier:** text or key reaches another destination, the API retains or logs
the key, the wrong provider is called, a terminal failure or cache hit charges,
the successful provider is charged incorrectly, or client-only playback
touches the ledger.

### Recoverable anomalies

Corrupt schema, audio, or credit metadata; 4xx, 5xx, and 429 responses;
disconnects and delays; playback interruption; and browser/background restart
must each produce either visible actionable error feedback or bounded recovery.
They must never leave stale audio or highlight state, silently charge, or leave
the reader indefinitely loading.

**Falsifier:** a fault hangs, silently charges, leaks a secret, resumes stale
audio/highlight state, or requires an internal actor action to recover.

### Replayable state campaigns

Default and explicit seeds drive rapid valid playback/navigation sequences. A
bounded soak repeats extract, start, pause, resume, seek, stop, and reload, and
fails on crash, hang, listener growth, unbounded request rate, or resource
growth. Every first anomaly is retained and replayed at least twice without an
LLM.

**Falsifier:** a replay crashes or hangs, request rate exceeds its declared
bound, or listeners, processes, file descriptors, CPU, or RSS grow beyond the
receipt's declared tolerance.

## Requirements

- **REQ-001:** The actor uses only public browser-visible or
  accessibility-visible interactions after the journey begins.
- **REQ-002:** The observer uses an isolated profile and fixture, and does not
  carry out actor actions.
- **REQ-003:** Deterministic assertions decide the verdict; agent prose,
  screenshots, and build success cannot override them.
- **REQ-004:** Each reader-facing control has role/name, keyboard, state, and
  before/after acceptance assertions.
- **REQ-005:** The managed free-tier, BYOK, failure, client-only, allocation,
  and cache accounting outcomes explicitly trace to INV-001, INV-002, INV-004,
  INV-005, and INV-006.
- **REQ-006:** Fault, fuzz, restart, and soak cases have bounded timeouts and
  replayable input.
- **REQ-007:** One receipt binds exact HEAD/build; Firefox, geckodriver,
  profile, and fixture identities; seed and run count; public action trace;
  replay command; assertions; sanitized HTTP records; console, background, and
  process logs; resource samples; artifacts; anomalies; timestamps; and exit
  status.
- **REQ-008:** Missing browser, driver, fixture, public selector, observable
  state, or receipt field fails the gate; none may be silently skipped.

## Non-goals

- This contract does not claim WebDriver can prove Firefox's parent-process
  shortcut matcher. The existing internal-command smoke remains a downstream
  diagnostic and must be named as such.
- It does not replace the existing deterministic unit, contract, or property
  suites; it adds a user-outcome boundary over them.
- It does not upload source or test data to a hosted service.

## Acceptance criteria

Feature delivery is accepted only when the five product outcomes above have
independent deterministic traces that do not trigger their falsifiers, in a
single receipt conforming to REQ-007.
The public-control trace must run against the built, loaded Firefox extension,
and anomalous paths must demonstrate either bounded recovery or actionable
visible feedback. A run that directly invokes an extension handler, message, or
shortcut dispatcher is diagnostic-only and cannot satisfy REQ-001.
