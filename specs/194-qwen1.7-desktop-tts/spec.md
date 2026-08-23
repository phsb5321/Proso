# Feature 194 — Desktop reading uses the largest runnable model

Date: 23/08/2026

## Problem

The desktop reader host selected Supertonic because it was the largest measured model that met a
former two-times-real-time requirement. Pedro explicitly removed that speed requirement and chose
the largest model the Radeon GPU can run instead. Leaving the smaller model active would no longer
match the requested selection policy.

## Goal

The existing reader-operated local-host journey uses one Qwen3-TTS 1.7B model on the desktop GPU,
without an account or provider key, while every published host route remains loopback-only and the
obsolete model/runtime is removed.

## Outcomes

### Largest-model selection

Exactly one 1.7B model is resident. It produces intelligible Brazilian Portuguese and publishes the
same health, capability, appliance, native, streaming, and OpenAI-shaped route families consumed by
existing clients.

**Falsifier:** the former model remains resident or deployed; Qwen does not synthesize parseable
audio; Portuguese content is omitted; or any required route disappears.

### Bounded local operation

Both the public compatibility bridge and its inference child listen only on loopback. A dropped
child recovers through the owning service, an abandoned stream cannot consume every inference slot,
and caches have explicit count, age, and byte bounds.

**Falsifier:** either listener accepts a non-loopback connection; a dead child leaves ready health;
a disconnected stream blocks buffered synthesis; or cached audio grows without a byte ceiling.

### Honest evidence and cleanup

The receipt records measured TTFA, RTF, VRAM, GPU activity, lexical round trip, deterministic replay,
and the former runtime's removed bytes. Speed below real time and the need for human listening remain
visible rather than being represented as passing.

**Falsifier:** performance is inferred from another GPU; cleanup uses global garbage collection; or
the receipt claims naturalness without a listening verdict.

## Requirements

- **REQ-001:** Preserve `GET /health`, `GET /v1/health`, `GET /v1/capabilities`, `GET /v1/styles`,
  `POST /v1/tts`, `POST /v1/tts/native`, `POST /v1/tts/stream`, and
  `POST /v1/audio/speech`.
- **REQ-002:** Keep all inference and administrative listeners on `127.0.0.1`.
- **REQ-003:** Load one model only; no fallback model may remain resident.
- **REQ-004:** Reject unsupported controls rather than silently pretending to apply them.
- **REQ-005:** Remove only the superseded isolated model tree and temporary build artifacts; do not
  run system-wide or Nix garbage collection.
- **REQ-006:** Keep the Orange Pi and the installed extension/profile unchanged.

## Non-goals

- Meeting the superseded RTF ≤0.5 threshold.
- Making the transient desktop service survive reboot.
- Claiming naturalness before Pedro listens.
- Changing extension production code or the managed Free entitlement.
