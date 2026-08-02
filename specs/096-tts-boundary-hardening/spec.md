# Feature 096 — TTS boundary hardening

## Goal

Preserve entitlement failures across the server-to-extension boundary so the
reader sees an actionable refusal instead of a false network failure, and bound
the unauthenticated dynamic voice-list endpoint that can spend a provider's
rate-limit budget.

This feature does **not** restore no-key Free-tier reading. On current `main`,
`FEATURE_MATRIX[Free].managedTts` is false and browser speech synthesis is not a
fallback. Choosing a different entitlement route is a product-policy decision
outside this slice.

## User stories

### US1 — Understand why reading was refused

As a reader whose request receives HTTP 402, I see the server's actionable
message without a `Network error` or `Provider error` prefix.

### US2 — Preserve provider voice-list capacity

As the operator, I can expose voice discovery without allowing an anonymous
caller to make an unbounded number of ElevenLabs voice requests through the
server's provider account.

## Requirements

- **FR-001:** `ServerTtsAudioAdapter` must map HTTP 402 `server_error` results to
  a dedicated `AudioError` discriminator, not `network`.
- **FR-002:** The audio message boundary must carry the 402 message unchanged.
- **FR-003:** HTTP 429 must remain `rate_limit`; other server errors must retain
  their existing mapping.
- **FR-004:** The managed-TTS entitlement message must mention only routes the
  shipped extension exposes and must not suggest removed browser TTS or promise
  an unratified commercial tier.
- **FR-005:** The unauthenticated `GET /tts/voices/:provider` controller method
  must use `ThrottlerGuard` with a finite named method-level limit that the
  application actually configures.
- **FR-006:** Core error types remain framework-free and fallible boundaries
  continue to return `Result`.
- **FR-007:** Delivery evidence must not claim that the change enables fresh
  no-key Free-tier reading or satisfies Feature 093's public-control user gate.

## Acceptance

1. A 402 with message `M` reaches `audio.generate` as
   `operation_failed.message === M`; the public popup then displays `M`
   verbatim and leaves its status `stopped`, not loading or playing.
2. The same adapter maps 429 to `rate_limit` and 503 to `network`.
3. A Free managed request returns 402 before cache/provider work and its message
   does not mention browser TTS.
4. Thirty voice-list requests in one minute reach the provider; request 31 is
   HTTP 429 and does not consume provider capacity. Five key-test requests reach
   the provider; request 6 is likewise HTTP 429 without provider work.
   Reflection additionally proves both methods bind the configured `long`
   throttler at 30 and 5 requests per 60,000 ms, respectively.
5. Focused extension and server suites pass, followed by the deterministic
   repository gate and a different-family typed review.

## Out of scope and policy gate

- Changing Free-tier entitlements, credit allocation, provider funding, or
  pricing.
- Reintroducing browser `speechSynthesis`.
- Claiming Feature 093 complete while its actor invokes internal Firefox
  handlers rather than public accessible controls.
- Production deployment or store release.

`[pending] Pedro: ratify which route, if any, should make fresh no-key Free-tier
reading possible. Code and documentation currently contradict that outcome.`
