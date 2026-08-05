# Feature 099 — Local appliance as a TTS provider

**Branch**: `099-local-appliance-tts` | **Date**: 05/08/2026 | **Status**: specification only,
nothing implemented

> Numbering note: this feature was specified as 097 and renumbered to 099 on 05/08/2026, because
> `specs/097-reading-journey-delta/` already occupied 097 and `specs/098-ops-parity/` occupied
> 098. The feature id is 099 from here on. The two pull requests that introduced this
> specification, #91 and #93, were authored on a branch named `097-local-appliance-tts` and are
> already merged, so that branch name survives in the history while the directory does not.

## Problem

Proso cannot read an article to a reader who has no account, no license key, and no provider
key. `docs/reading-journey-status.md` records why: Free managed synthesis returns 402 (commit
`7e4cda0`), and browser `speechSynthesis` was deliberately removed (commit `9797dc6`). Every
surviving route requires either a credential or a credit balance, so the product's own INV-001
outcome — the free tier never requires account creation — has no delivery path.

Pedro owns a machine on his tailnet that already synthesizes speech. `docs/research/local-reader-lab-2026-07-30.md`
proposed using it and explicitly labelled the proposal an unimplemented hypothesis.

## Goal

A reader opens an article, presses play, and hears it — with no account, no license key, and no
provider key — because the audio came from a machine the reader owns. When that machine is absent,
unreachable, or unable to serve the page's language, Proso behaves exactly as it does today and
says why it did not use the local route.

## Product outcome

Pedro opens a Portuguese or English article in Firefox, presses the public play control, and hears
the article read aloud. He supplied a host address once, in settings, and granted the extension
permission to talk to that host. He supplied no credential of any kind. The paragraph he is
hearing is visibly marked. If he closes and reopens the same article, the same audio plays without
re-synthesis and without any charge.

**Falsifier:** playback requires a credential, prompts for an account, stalls without a message,
plays audio for a paragraph other than the one marked, or charges credit for a local synthesis.

## Reconciliation with the 30/07 research constraint

`docs/research/local-reader-lab-2026-07-30.md:196-198` sets a standing constraint on exactly this
work:

> The public extension must not contact Pedro's Pi directly. A Pedro-only lab endpoint must be
> opt-in, authenticated, HTTPS, bounded by input/timeout/concurrency limits, and use an explicit
> optional host permission without hard-coded tailnet addresses.

This feature does not override that constraint; FR-2, FR-3, and FR-6 are how it is met. A shipped
public build contacts no appliance at all, because the provider is off by default (FR-2), holds no
host until its own user supplies one (FR-3), and has no permission for any user origin until that
user grants it from a click (FR-6). "Pedro's Pi" is reachable only from a build whose user
configured that host, which on the tailnet means Pedro's own. There is no discovery, no default
host, and no appliance hostname in shipped source.

The rest of the constraint maps as follows, including where it is not fully met:

| Constraint clause | Where it is met |
|---|---|
| opt-in | FR-2, and a default-off proof asserted on issued requests rather than on configuration |
| HTTPS | FR-3 rejects any non-`https://` origin for a non-loopback host |
| bounded input | FR-7, at the appliance's published 8,192 UTF-8 bytes, measured in bytes |
| bounded concurrency | FR-7, at the published queue capacity of 8, across playback and prefetch together |
| bounded timeout | the failure-mode table: every reachability and 5xx row is bounded and falls back rather than stalling |
| explicit optional host permission | FR-6, requested at runtime from a user gesture |
| no hard-coded tailnet addresses | FR-3, falsified by a `grep` of shipped source |
| **authenticated** | **not met at the application layer.** The appliance publishes no authentication scheme, so the extension has none to satisfy. Access control is network-layer: the host is reachable only from inside the reader's tailnet, where device identity is established by WireGuard. If a reader exposes their appliance beyond that boundary, this feature adds no credential to protect it, and neither the extension nor this specification can. Adding a shared secret is possible future work; it is not in scope here and would not change FR-1, since a secret for a reader's own machine is not a Proso account. |

The same paragraph also requires that offline, timeout, invalid-WAV, denied-permission, and 5xx
outcomes each call the existing server adapter **exactly once**. That is stricter than "falls
back" and is carried as a test obligation in `tasks.md`, not merely as prose here.

## Acceptance criteria and falsifiers

Each criterion below is a delivery gate. A criterion whose falsifier cannot be observed is not
satisfied, regardless of what any suite reports.

### FR-1 — Account-free reading

**Criterion:** with the appliance reachable and the provider enabled, a full multi-paragraph
article is read end to end in a fresh Firefox profile holding no account, no license key, and no
BYOK credential. Every paragraph's audio originates from the configured host.

**Falsifier:** any authentication or key prompt; any request to `api.proso.com.br` carrying page
text during the run; a paragraph that produces no audio; a run that only demonstrates a single
paragraph and infers the rest.

### FR-2 — Opt-in, off by default

**Criterion:** a build with no user configuration behaves byte-identically to today's build. The
extension issues no request to any host outside the currently declared `host_permissions` until
the reader has both enabled the local provider and supplied its base URL.

**Falsifier:** a network request to a user-host origin observed with default settings; a default
settings value that names a local host; a test that proves default-off by asserting on
configuration state rather than on issued requests.

### FR-3 — Configurable base URL

**Criterion:** the host is a reader-supplied setting. Shipped source outside tests, fixtures, and
documentation contains no appliance hostname. The setting rejects a value that is not an
`https://` origin.

**Falsifier:** `grep` for the appliance hostname matches shipped source; the provider synthesizes
against a compiled-in default; a plaintext `http://` origin is accepted for a non-loopback host.

### FR-4 — Honest fallback

**Criterion:** when the appliance is absent, unresolvable, not `ready`, over its queue, or refuses
a request, playback falls back to the existing server route and the reader is told, in the UI,
that the local route was not used and why. Failure is never silent and never fabricated.

**Falsifier:** a stall with no message; a spinner that never resolves; a success state reported
without audio; a fallback that occurs with no user-visible explanation; an error message that
names a cause the response did not state.

### FR-5 — No fabricated word timings

**Criterion:** the local provider reports that it supplies no word-level timing, and it returns
none. Highlighting degrades to the behaviour the codebase already has for absent timings —
paragraph-level marking plus the existing duration-derived estimate at
`packages/extension/src/core/playback/playback-service.ts:862-866` — and no new synthetic timeline
is designed for this feature. Estimated positions are never described to the reader, in UI or in
any receipt, as measured.

**Falsifier:** the adapter returns a `wordTimings` array; a new estimator is introduced for this
provider; any artifact labels estimated word positions as provider-supplied or measured.

### FR-6 — Permission honesty

**Criterion:** the appliance origin is requested at runtime, from a user gesture, at the moment
the reader enables the provider. It is not a static install-time grant, and a user who never
enables the provider is never asked for it. Revoking the permission disables the local route
rather than producing repeated failures.

**Falsifier:** the built manifest lists a user-host origin under `host_permissions`; the
permission is requested at install or at startup; the provider stays selected and keeps failing
after the permission is revoked.

### FR-7 — Bounds enforced before the request

**Criterion:** input above 8,192 UTF-8 bytes is split or refused client-side, measured in bytes
rather than in JavaScript string length. Concurrent in-flight synthesis requests stay at or below
the appliance's published queue capacity of 8.

**Falsifier:** a request body exceeding the published byte bound leaves the extension; a bound
enforced on `String.length`; more than the published capacity of concurrent requests observed in
a prefetch or export burst; a 429 or 413 that only appears at the server rather than being
prevented.

### FR-8 — Derived idempotency

**Criterion:** the idempotency key is a deterministic digest of the exact request identity —
input text, voice, and speed — and lands within 16 to 128 characters. Re-requesting the same
paragraph within the appliance's retention window returns the appliance's retained audio rather
than re-synthesizing.

**Falsifier:** a random or time-derived key; two different bodies producing one key; the same
body producing two keys across restarts; a repeat request that re-synthesizes when it should have
been retained.

### FR-9 — Privacy

**Criterion:** page text reaches only the host the reader configured. No article content, and no
derivative of it, is sent to telemetry. The options UI states plainly, before the reader enables
the provider, where the text will go.

**Falsifier:** page text or a digest of it appears in any request to a host other than the
configured one; a log line carries article content; the UI omits the destination statement.

### FR-10 — Invariants

**Criterion:** INV-001 (free tier never requires account creation) and INV-006 (cached content is
never re-charged) hold across the whole feature: a local synthesis touches no ledger, and a cache
hit on locally-produced audio charges nothing. INV-005 is addressed explicitly in
[Open decisions](#open-decisions-for-pedro) rather than being quietly re-scoped.

**Falsifier:** any credit transaction attributable to a local synthesis; a cache hit that charges;
a document that restates INV-005 without recording it as a maintainer decision.

## Failure modes and required results

Every row is a required user-visible outcome. "Fallback" means the existing server route is
attempted with the reader's existing entitlement, which on current `main` will itself refuse for
a Free user — the reader must then see that refusal, not an empty state.

| Condition | How it presents | Required user-visible result |
|---|---|---|
| Provider disabled (default) | no request issued | today's behaviour, unchanged |
| Host not configured | enable attempted with empty URL | settings refuses to enable; states what is missing |
| DNS unresolvable / tailnet down | connection error before response | one bounded retry, then fallback with "local reader unreachable" |
| Permission not granted or revoked | request blocked by the browser | local route disabled, reader prompted to re-grant, fallback |
| `/health` reports `ready: false` | 200 response, `ready` false | no synthesis attempted; "local reader is starting"; fallback |
| 422 `idempotency_key_required` | RFC-9457 problem body | treated as a client defect: log, do not retry, fallback |
| 422 `unknown_field` / `invalid_speed` | RFC-9457 problem body | same as above; the request shape is wrong, retrying cannot fix it |
| 422 unknown voice | RFC-9457 problem body | fallback, message names the unavailable voice |
| 406 accept negotiation failure | RFC-9457 problem body | treated as a client defect; fallback |
| 415 wrong content type | RFC-9457 problem body | treated as a client defect; fallback |
| 429 or queue full | `retryable` true | bounded wait, one retry, then fallback with "local reader busy" |
| 5xx | problem body or empty | no retry storm; fallback with the reported request id |
| Input over 8,192 UTF-8 bytes | detected before sending | split at a sentence boundary, or refused with an explicit message |
| Language the appliance cannot serve | no matching voice | local route declines; fallback; never substituted with another language's voice |
| Reader stops or navigates mid-synthesis | abort signalled | in-flight request aborted, no audio played, no stale highlight |
| Response is not valid audio | decode fails | discarded, not cached, fallback, reader told synthesis failed |

## Decisions

These were open questions. They are decided here so no downstream slice has to guess.

### D-1 — Cached audio must carry its media type

`packages/extension/src/adapters/cache/indexeddb-cache.adapter.ts:62` reconstructs every cache
hit as `new Blob([entry.audioData], { type: 'audio/mpeg' })`, and the `CacheEntry` contract at
`packages/extension/src/ports/cache-store.port.ts:26` has no media-type field. WAV bytes survive
the round trip; their label does not. A cache hit would hand the player MPEG-labelled WAV.

**Decision:** the cache entry carries the media type it was stored with, and the adapter
reconstructs the blob with that type, defaulting to `audio/mpeg` for entries written before this
feature. This is a storage-schema change and therefore ships with migration logic, per the
constitution's Quality Gates. Storing WAV unconverted is accepted: converting to MP3 on the write
path would add an encode to every local synthesis for a cache that is already size-bounded.

**Falsifier:** a cache hit on locally-produced audio plays nothing, plays noise, or reports a
decode error; a pre-existing cached entry stops playing after the migration.

### D-2 — Voice selection, and declining a language

Language detection returns a two-letter ISO 639-1 code
(`packages/extension/src/utils/language/detector.ts`, mapped from franc-min's ISO 639-3 output).
The appliance publishes exactly two region-specific voices, `pt_BR-faber-medium` (pt-BR) and
`en_US-ljspeech-medium` (en-US), both re-verified on 05/08/2026.

**Decision:** the primary subtag decides. `pt` selects the Brazilian voice, `en` selects the
American one. Any other detected language, and an undetermined result, causes the local provider
to **decline** — it reports that it cannot serve that language, and the reader falls back. A
reader-chosen voice override that names a voice the appliance does not publish also declines.
Serving European Portuguese text with a Brazilian voice is accepted deliberately; serving any
third language with either voice is not, because a reader who hears German read by an English
voice has been given a defect, not a degraded service.

**Falsifier:** a third-language article produces local audio; an undetermined detection silently
selects English; a declined language produces no visible explanation.

### D-3 — Highlighting without word marks

Both appliance voices publish `markKinds: []`, so no word timing exists to report. The codebase
already handles this: `packages/extension/src/core/playback/playback-service.ts:862-866` uses
provider timings when present and otherwise calls its existing estimator, gated on a positive
audio duration that it takes from the playing `Audio` element first.

**Decision:** reuse that path unchanged. The local provider reports `supportsWordTiming: false`
and returns `wordTimings: null`. The one obligation this feature adds is a real duration: the
sibling server adapter returns `durationMs: 0` for any non-MPEG content type
(`packages/extension/src/adapters/audio/server-tts-audio.adapter.ts`), and a zero duration would
disable word highlighting entirely. The local provider derives duration from the WAV header it
received. No new estimator, no synthetic per-word offsets presented as measured.

**Falsifier:** word highlighting is absent for local audio while a duration was available; the
adapter reports a duration it did not derive from the response; a new timing generator appears in
the diff.

### D-4 — MP3 export is out of scope and must say so

`Mp3Encoder.encodeArticle` concatenates paragraph blobs byte-wise
(`packages/extension/src/utils/audio/mp3-encoder.ts`, whose `concatenateBlobs` carries a TODO
naming itself a placeholder) and then decodes the concatenation. Raw-concatenating WAV files
produces one valid header followed by embedded headers, so the decode yields the first paragraph
or fails.

**Decision:** export of locally-produced audio is not delivered by this feature. Attempting it
must produce an explicit "export is not available for the local reader" message. Silently
exporting a truncated or corrupt file is prohibited. Fixing the concatenation is separate work
and does not block this feature.

**Falsifier:** an export containing locally-produced audio yields a file shorter than the article
it claims to contain, or an export attempt fails without a message.

### D-5 — A new provider identity

`ProviderId` is a closed union declared three times — `core/shared/errors.ts:13`,
`utils/language/mappings.ts:17`, `utils/messaging/protocol.ts:26` — with a matching zod enum at
`utils/messaging/schemas.ts:27`, a `PROVIDERS` constant at `utils/config/schema.ts:24`, and
hardcoded provider lists at `utils/language/mappings.ts:292`, `handlers/settings.handlers.ts:129`
and `:204`, plus switches in `composition/factories.ts`.

**Decision:** one new member is added to every one of those declarations in the same change, and
the local provider is excluded from the server-validated and BYOK-key paths, since it takes no
key. Consolidating the three duplicate unions is desirable and out of scope.

**Falsifier:** a build that type-checks while one declaration still omits the member; a settings
path that offers a BYOK key field for the local provider; a credit or entitlement path that
treats it as a metered provider.

### D-6 — Idempotency key derivation

**Decision:** the key is a hex-encoded SHA-256 digest, truncated to a fixed length inside the
appliance's 16 to 128 character bound, over a canonical serialization of exactly the fields the
appliance accepts: input text, voice id, and speed. Nothing else — no URL, no paragraph index, no
timestamp — participates, so the same paragraph on a re-read reuses retained audio.

**Falsifier:** two distinct request bodies collide on a key in a seeded property run; the same
body produces different keys across two extension restarts; the key length falls outside 16..128.

## Open decisions for Pedro

These are product-level and are not decided here.

1. **Constitution Principle I.** The constitution (v2.0.0) permits page content to leave the
   browser only to the first-party Proso API or to a BYOK provider the reader selected. A
   reader-operated appliance is a third destination, so this feature cannot pass a Constitution
   Check as written. It needs either a documented exception in the plan's Complexity Tracking or
   a versioned amendment with a SYNC IMPACT REPORT. The amendment is the honest route, because
   the destination class is permanent, not incidental to one feature.
2. **INV-005.** The constitution states it as "client-side-only playback is never metered". Audio
   from a device on the reader's own network is unmetered but is not client-side. The invariant
   is therefore either satisfied in spirit and stale in wording, or it does not cover this route
   at all. Changing a business invariant is a MAJOR amendment by the constitution's own
   Governance section. This specification does not restate it.

Neither question blocks slices B or D: an adapter and an oracle can be built and proven while the
wording is settled. Shipping the provider to users without resolving them would be a violation.

## Non-goals

- Speech-to-text. The appliance exposes transcription; this feature ignores it.
- Provisioning, deploying, or supervising the appliance. It is assumed to exist.
- Discovery. There is no scanning for hosts and no default host.
- Multi-host failover, load balancing, or a second local backend.
- Voice cloning, voice download, or model management from the extension.
- Making the local route the default for anyone other than a reader who enables it.

## Evidence

Nothing in this feature is implemented, so no behavioural claim below is verified.

| Claim | Status | Evidence |
|---|---|---|
| The appliance is reachable over the tailnet and reports `ready: true` | verified 05/08/2026 17:50 BRT | `GET /health` → `{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}` |
| Published limits are 8,192 UTF-8 bytes, queue capacity 8, 900 s idempotency retention | verified 05/08/2026 17:50 BRT | `GET /v1/capabilities` |
| Both voices publish `markKinds: []` | verified 05/08/2026 17:50 BRT | `GET /v1/capabilities` |
| Warm synthesis latency and real-time factor on this appliance | unverified | the master brief's cold figure of 5.475 s is a third-party measurement of a single request; the research doc's falsifier was measured on a different node and a different English voice (`en_US-lessac-medium`). Slice E must re-measure |
| Audio quality is acceptable to a listener | unverified | never assessed; the research doc says so explicitly |
| The extension can synthesize against the appliance | not implemented | no adapter exists |
| Fallback, bounds, permission, and abort behaviour | not implemented | specified above, built in slices B and C |
| The account-free journey works end to end | not implemented | slice E is the only thing that can establish it |

## Acceptance

This feature is delivered when FR-1 through FR-10 each have an independent deterministic trace
that does not trigger its falsifier, produced against the built extension in a real Firefox with
the appliance live, and when the two open decisions above have been resolved by the maintainer. A
missing appliance, browser, or fixture makes the gate BLOCKED. It does not make it green.
