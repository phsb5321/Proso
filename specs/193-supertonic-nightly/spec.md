# Feature 193 — Firefox Nightly reads through desktop Supertonic

Date: 22/08/2026

## Problem

Proso 1.2.9 already supports a reader-operated synthesis host, but Pedro's daily Firefox Nightly
still points that route at the Orange Pi. The selected desktop model exposes a native and
OpenAI-shaped API, not the appliance wire contract expected by `LocalHostAudioAdapter`.

The real-host browser gate also attributes adoption by comparing returned voices to the fixture's
hard-coded Orange Pi voice ids. A conforming host with a different voice list therefore fails the
oracle before playback even when the background adopted it correctly.

## Goal

Pedro uses the installed Proso extension in his daily Firefox Nightly profile to read through the
single desktop Supertonic model, with no account, licence key, provider key, extension rebuild, or
managed synthesis request.

## Outcomes

### Daily-profile route

The existing Local synthesis host controls configure `http://127.0.0.1:5301`, obtain the runtime
host grant through an accessibility-visible user action, retain automatic language selection, and
persist `provider: local` with the route enabled. A real public Play action on an existing article
causes the desktop host to synthesize audio; Stop ends playback and further requests.

**Falsifier:** storage changes without a public control action; the host permission is absent; no
synthesis reaches the desktop service; playback cannot be stopped; or the route falls back to the
managed API.

### Contract-compatible desktop host

The one resident Supertonic model publishes the reader-operated-host surface already consumed by
Proso: `GET /health`, `GET /v1/capabilities`, and idempotent `POST /v1/tts` returning parseable WAV.
It publishes English and Brazilian Portuguese voice identities while retaining its native,
OpenAI-shaped, and chunked-stream routes.

**Falsifier:** health is not ready; capabilities publish no compatible voice; two request bodies
reuse one idempotency key without a 409; a replay resynthesizes; or the response is not WAV.

### Generic real-host gate

In real-host mode, the gate reads the actual host's capabilities during preflight and attributes
background adoption to those voice ids. Fixture mode remains tied to its own fixture voices.
Missing capabilities or an empty voice list is BLOCKED, never inferred green.

**Falsifier:** a conforming non-Orange-Pi host still fails only because its voice ids differ; or a
host that publishes no voice reaches the playback assertions.

## Requirements

- **REQ-001:** No extension production source changes; reuse `LocalHostAudioAdapter`, runtime host
  permission, settings, chunking, cache, playback, and public controls already on main.
- **REQ-002:** The synthesis service binds loopback only and publishes no default address inside the
  extension artifact.
- **REQ-003:** The daily profile is changed through public accessibility-visible controls, not by
  editing live profile storage.
- **REQ-004:** The isolated Nightly journey records a real host preflight, real capabilities,
  background adoption, decoded playback, visible highlight, and zero managed synthesis requests.
- **REQ-005:** The daily-profile check records a host synthesis request caused by public Play and
  observes no new request after public Stop.
- **REQ-006:** Evidence distinguishes the deployed CPU bridge from the successful standalone WebGPU
  benchmark; GPU acceleration is not claimed live until the service itself passes the same gate.

## Non-goals

- Persisting the transient model service declaratively across reboot.
- Shipping the desktop host address as a product default.
- Replacing Proso's local-host adapter with a second provider abstraction.
- Claiming naturalness or voice preference without Pedro's listening verdict.
- Promoting the broader `make user-gate` result from BLOCKED to PASS.
