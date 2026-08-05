# Implementation Plan: Local appliance as a TTS provider

**Branch**: `100-local-appliance-tts` | **Date**: 05/08/2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/100-local-appliance-tts/spec.md`

## Summary

Add a reader-configured, off-by-default TTS provider that synthesizes against an HTTP appliance on
the reader's own network, so an article can be read with no account and no credential. The
provider is a new `IAudioGenerator` adapter behind the existing port, selected ahead of the server
route only when the reader enabled it, and falling back to that route — visibly — whenever the
appliance is absent, not ready, busy, or unable to serve the page's language. It supplies no word
timings and does not touch the credit ledger.

Because the appliance cannot stream a response, the adapter synthesizes at sentence granularity
and keeps one chunk ahead of playback rather than requesting a paragraph and waiting ~8 s for it.
That pipeline, not a size check, is what makes the latency criterion reachable at any article
length.

## Technical Context

**Language/Version**: TypeScript 5.9, ES2020 target, strict
**Primary Dependencies**: WXT 0.20.x (extension), Zod 3.x, Dexie 4.x; no new runtime dependency
**Storage**: `browser.storage.local` for settings; IndexedDB audio cache (schema change, see below)
**Testing**: Jest 29 (unit, contract, integration projects); seeded properties via `make fuzz`;
real-Firefox journey via `make smoke-reading` and the Feature 095 public-control gate
**Target Platform**: Firefox 109+, Manifest V3 baseline
**Project Type**: browser extension within a pnpm monorepo
**Performance Goals**: first audio within two seconds of a warm appliance, and no starvation
thereafter (spec FR-11). The research doc's RTF clause is already met and length-invariant
(measured 0.195–0.276 against a 0.5 bound); its two-second clause is met at sentence granularity
and fails at paragraph granularity, which is why the pipeline is chunked
**Constraints**: appliance-published bounds — 8,192 UTF-8 bytes per request, 900 s idempotency
retention, 60 s maximum audio; **no response streaming**, so time-to-first-audio equals full
synthesis time of whatever is requested; **effective TTS admission is 4 and there is a single
inference worker**, so client concurrency is one synthesis plus one prefetch; responses are
`audio/wav` or a `+json` envelope; errors are RFC-9457 `application/problem+json`
**Scale/Scope**: one adapter, one settings surface, one permission flow, one cache-schema field

### External contract (re-verified 05/08/2026 17:50 BRT)

`GET /health` → `{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}`.
`GET /v1/capabilities` publishes the limits above and exactly two voices, `pt_BR-faber-medium`
(pt-BR) and `en_US-ljspeech-medium` (en-US), both with `markKinds: []`.

`POST /v1/tts` requires an `Idempotency-Key` header of 16 to 128 characters inclusive, a
`content-type` of `application/json` — **parameter-tolerant**, so `; charset=utf-8` is accepted
with a 200 — and an `accept` that matches `audio/wav`, `audio/*`, or `*/*` for raw WAV. The body
accepts exactly `input`, `voice`, and `speed`; any additional field is a 422 `unknown_field` and a
missing `speed` is a 422 `invalid_speed`. Server source of truth:
`~/NixOS/pkgs/audio-appliance/src/audio_appliance/app.py` (outside this repository).

Measured error surface (review actor, 05/08/2026), which supersedes the master brief where the two
disagree:

| Condition | Status | `code` | `retryable` |
|---|---:|---|:--:|
| input over 8,192 bytes | 413 | `payload_too_large` | false |
| unknown voice / unknown field / missing speed / empty input | 422 | `unknown_voice`, `unknown_field`, `invalid_speed`, `invalid_input` | false |
| missing or out-of-bound idempotency key | 422 | `idempotency_key_required`, `invalid_idempotency_key` | false |
| same key, different body | 409 | `idempotency_key_reused` | false |
| unacceptable `accept` | 406 | `unsupported_representation` | false |
| unsupported `content-type` | 415 | `unsupported_media_type` | false |
| queue full | 429 | `queue_full` | true, with `retry-after: 14` and `retryAfterMs` |
| engine starting / timed out | 503 | `engine_not_ready`, `engine_timeout` | true, with `retry_after_ms` |
| engine failure | 503 | `engine_failed` | **false** |

Validation runs before the idempotency lookup, and `retryable` alone is not a sufficient signal:
`engine_failed` is a 503 that must never be retried.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Privacy First | **FAIL — needs maintainer resolution** | The principle permits page content to leave the browser only to the first-party Proso API or to a BYOK provider the reader selected. A reader-operated appliance is a third destination. See Complexity Tracking and spec's open decisions. |
| II. Security by Default | PASS with conditions | HTTPS only; the tailnet origin terminates TLS. No credential is stored for this provider. The host setting is validated and never interpolated into a template. Article text is not logged. |
| III. User Experience Excellence | PASS | Every failure mode in the spec maps to a stated, actionable message; the fallback is never silent. |
| IV. Modular Architecture | PASS | One new adapter behind the existing `IAudioGenerator` port, instantiated only in the composition root, returning `Result<T, E>` with `try/catch` confined to the adapter boundary. |
| V. Test Coverage for Critical Paths | PASS | The new adapter runs the existing port contract suite; each failure mode gets a planted-break proof; the storage migration gets a regression test. |
| Business invariants | CONDITIONAL | INV-001 and INV-006 are satisfied by construction (no ledger interaction). INV-005's wording predates the removal of browser TTS; the spec refuses to restate it and leaves it to the maintainer. |

The amendment that would resolve the Principle I row is [PR #92](https://github.com/phsb5321/Proso/pull/92),
"docs: permit a user-operated synthesis host in Principle I" (2.0.0 → 2.1.0, MINOR, adding a
reader-configured synthesis host as a third permitted destination). The row above stays **FAIL**
until that pull request merges — an open amendment is an intention, not a ratified principle.

Principle I is a real gate failure, not a formality. Slices B and D may proceed because an adapter
and an oracle prove behaviour without shipping a data flow to a user, under the documented
exception in [Complexity Tracking](#complexity-tracking) as the interim authority. Slice C — the
settings surface that lets a reader actually send page text to a third destination — must not
merge until the maintainer either ratifies the amendment or accepts that exception.

## Design

### Provider selection order

`createAudioGeneratorAdapter` currently maps every provider onto `ServerTtsAudioAdapter` and
throws when no server is configured (`packages/extension/src/composition/factories.ts`). The local
provider becomes a distinct branch taken only when the reader selected it, and it composes with
the existing route rather than replacing it: a `LocalApplianceAudioAdapter` wrapped by a
fallback decorator that holds the server adapter as its secondary. The decorator, not the
appliance adapter, owns the decision to fall back, so the adapter stays a faithful mapping of one
HTTP contract and the fallback policy is testable on its own.

Order: local (if enabled, configured, permitted, ready, and language-capable) → existing server
route → `NoOpAudioGeneratorAdapter` with the reason string, which is today's behaviour when
nothing is configured.

`reconfigureAudioGenerator` (`packages/extension/src/composition/container.ts:234`) is the
existing seam for a settings change and needs no new mechanism, only the new branch.

### Adapter behaviour

- `providerId` is the new `ProviderId` member; `supportsWordTiming` is `false`;
  `supportedLanguages` is `['pt-BR', 'en-US']` derived from a capabilities fetch, cached for the
  session, not hardcoded as truth.
- `generateAudio` sends exactly `{ input, voice, speed }`, with `accept: audio/wav`,
  `content-type: application/json` (a charset parameter is safe), and the derived
  `Idempotency-Key`; it honours the incoming `AbortSignal` by passing it to `fetch`.
- The adapter synthesizes one chunk per call and stays deliberately unaware of the pipeline; the
  chunking and prefetch policy lives above it, so the adapter remains a faithful mapping of one
  HTTP contract.
- Duration comes from the WAV header (`ByteRate`, data-chunk size), not from a byte-size
  heuristic. `AudioResponse.wordTimings` is always `null`.
- Every non-2xx is parsed as `application/problem+json` and mapped to the existing `AudioError`
  factories; a body that is not a problem document is still an error, never a success.
- `validateCredentials` maps to a `/health` probe reporting `ready`, since this provider has no
  credential — the port's method name is the existing readiness seam.

### Error mapping

| Appliance response | `AudioError` | Retry | Fallback |
|---|---|---|---|
| connection refused / DNS failure | `network` | one bounded retry | yes |
| `/health` `ready: false` | `providerError('not_ready', …)` | no | yes |
| 406, 409, 413, 415, 422 | `providerError(code, …)` | no — the request shape is wrong | yes |
| 429 `queue_full` | `rateLimit(retryAfterMs)` | one wait of the stated `retryAfterMs` (14 s observed), never a blind backoff | yes |
| 503 `engine_not_ready`, `engine_timeout` | `providerError(code, …)` | one retry after the stated `retry_after_ms`, **reusing the same idempotency key** so the appliance coalesces it | yes |
| 503 `engine_failed` | `providerError('engine_failed', …)` with `requestId` | **no** — permanent despite the 5xx | yes |
| abort | existing abort path, no error surfaced | no | no |

Dispatch is a switch on `code`, with the status used only to decide that an error occurred. A
switch on status class would retry `engine_failed`.

### Chunking, prefetch, and concurrency

The appliance returns a whole WAV, so requesting a paragraph means waiting for all of it before
any sound plays — measured at 7.5–8.3 s for 656–727 bytes. The pipeline therefore splits at
sentence boundaries and requests chunk *n+1* while chunk *n* plays. At the measured RTF near 0.2
the producer runs about five times ahead of the consumer, so after a first chunk of roughly
1.2–2.0 s playback does not starve, at any article length.

Length is measured with `TextEncoder().encode(text).length`, never `String.length`. A single
sentence exceeding 8,192 bytes is refused with an explicit message rather than truncated; nothing
else should ever approach the bound once chunking is in place, so a 413 in practice means the
chunker is broken.

Concurrency is **one in-flight synthesis plus at most one prefetch**, enforced by a semaphore
shared with `packages/extension/src/utils/playback/prefetch.ts`. This is deliberately far below
the advertised `queueCapacity: 8`: that figure is TTS plus STT combined, the per-class split is
never exposed by the API, measured TTS admission is 4, and the appliance runs a single inference
worker with no preemption — so client concurrency above one buys no throughput and only converts
queueing into 429s.

### Permission flow

The manifest gains an `optional_host_permissions` declaration; it gains no new
`host_permissions`. Enabling the provider in the options page calls `browser.permissions.request`
from the click handler — Firefox requires a user gesture — for the exact configured origin. A
denial leaves the provider disabled and says so. `browser.permissions.contains` is checked before
each session's first request so a later revocation disables the route instead of producing a
stream of failures.

### Settings

`AppConfig` (`packages/extension/src/utils/config/schema.ts`) gains a nullable local-appliance
base URL and an explicit enable flag, both defaulting to off/null, validated as an `https://`
origin. The `ISettingsStore` `Settings` shape gains the same two fields. Defaults are asserted by
a test that fails if any request is issued without opt-in — configuration-state assertions alone
do not satisfy FR-2.

### Cache

`CacheEntry` gains a media type, `IndexedDBCacheAdapter` stores and restores it, and the Dexie
schema version increments with a migration that stamps existing rows `audio/mpeg`. Without this,
every cache hit on local audio is mislabelled (spec D-1).

### Idempotency key

`sha256(canonical({ input, voice, speed }))` hex-encoded, truncated to 64 characters, inside the
16..128 inclusive bound. Derived in `core/` as a pure function so it is directly property-testable,
with `crypto.subtle` supplied by the adapter rather than imported into the domain layer. A retry
resends the key it already used, which is what lets the appliance coalesce a retry after
`engine_timeout` instead of queueing a second synthesis, and what makes 409
`idempotency_key_reused` unreachable.

## Project Structure

### Documentation (this feature)

```text
specs/100-local-appliance-tts/
├── spec.md              # This feature's outcomes, falsifiers, and decisions
├── plan.md              # This file
└── tasks.md             # Ordered, individually verifiable work for slices B, C, D
```

No `research.md` or `data-model.md`: the external contract is re-verified inline above, and the
only data-model change is two settings fields plus one cache column, described in place.

### Source code

```text
packages/extension/src/
├── adapters/audio/
│   ├── local-appliance-audio.adapter.ts        # new: one HTTP contract, faithfully mapped
│   └── fallback-audio.adapter.ts               # new: primary → secondary policy, testable alone
├── adapters/cache/indexeddb-cache.adapter.ts   # media type stored and restored
├── core/audio/idempotency-key.ts               # new: pure derivation
├── core/shared/errors.ts                       # ProviderId gains one member
├── composition/{factories,container}.ts        # new branch; existing reconfigure seam
├── ports/{audio-generator,cache-store,settings-store}.port.ts  # media type; settings fields
├── utils/config/schema.ts                      # PROVIDERS, base URL, enable flag, migration
├── utils/messaging/{protocol,schemas}.ts       # duplicate union and zod enum
├── utils/language/mappings.ts                  # duplicate union and provider list
├── handlers/settings.handlers.ts               # provider validation lists
└── entrypoints/options/                        # enable toggle, URL field, permission request,
                                                # destination statement

packages/extension/tests/
├── unit/adapters/local-appliance-audio.adapter.test.ts
├── unit/core/idempotency-key.test.ts
├── contract/audio-generator.contract.test.ts   # existing suite, new adapter added
├── integration/reader-journey.test.ts          # existing oracle, local route added
└── regression/cache-media-type.test.ts
```

**Structure Decision**: everything lands in `packages/extension`. The server and shared packages
are untouched: this route deliberately does not involve the first-party API, which is the whole
point of the feature and also the reason Principle I needs resolving.

## Testing strategy

- **Contract**: the new adapter runs the existing `IAudioGenerator` contract suite unmodified. An
  adapter that needs the suite changed to pass has not met the port.
- **Planted break**: each of idempotency header, body field set, accept negotiation, byte bounds,
  problem+json mapping, and abort gets a test that fails when that behaviour is deliberately
  broken. A test that stays green under the planted break is not evidence.
- **Do not encode the brief's errors.** `content-type` is parameter-tolerant, so no test may
  assert 415 on `application/json; charset=utf-8`; oversize is 413, not 422; and a 5xx test must
  distinguish `engine_failed` (no retry) from `engine_timeout` (retry with the same key).
- **Default-off**: a test asserting that no request is issued with default settings, by observing
  the injected fetch, not the config.
- **Property**: seeded runs over the key derivation (collision and stability) and the sentence
  chunker (every chunk within 8,192 bytes, concatenation preserves the input, no empty chunk)
  through `make fuzz`.
- **Pipeline**: a test that the chunk after the playing one is already requested, and that no more
  than two requests are ever in flight.
- **Journey**: `make smoke-reader` covers the local route in the jsdom oracle; a planted break in
  that route must turn it red. `make smoke-reading` and the Feature 095 public-control gate remain
  the only things that can establish FR-1.

Local baselines to preserve: extension unit `1 skipped, 2314 passed`; the server suite's only
acceptable failures are the two Prisma contract suites that need a Postgres this host lacks. No
suite may be re-baselined to reach green.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Principle I — a third destination for page content | It is the only route that reads an article with no account and no credential; Free managed synthesis returns 402 and browser TTS was removed | Routing through the first-party API preserves the principle but reintroduces the account and credit requirement, which is the problem being solved. Proxying the appliance through the Proso server would satisfy the letter of the principle while sending the text further, not less far. The honest fix is an amendment naming a reader-operated destination, which is a maintainer decision, not a plan decision. |
| A fallback decorator in addition to the adapter | Fallback policy is the behaviour most likely to regress silently, and it must be provable without an appliance | Putting fallback inside the appliance adapter makes every fallback test require a stubbed second provider inside a class whose job is one HTTP contract, and makes "did it fall back and say why" untestable in isolation. |
| A storage-schema change for one field | Without it every cache hit on local audio is mislabelled `audio/mpeg` | Skipping the cache for local audio would break INV-006's spirit and re-synthesize on every re-read; converting WAV to MP3 on write adds an encode to every synthesis to avoid one field. |
