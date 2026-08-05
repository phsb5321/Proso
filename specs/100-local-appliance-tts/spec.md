# Feature 100 — Local appliance as a TTS provider

**Branch**: `100-local-appliance-tts` | **Date**: 05/08/2026 | **Status**: specification only,
nothing implemented

> Numbering note: the feature id is **100**. It was specified as 097, renumbered to 099 in PR #94,
> and corrected to 100 here, because 097, 098 and 099 are all taken — 097 by
> `specs/097-reading-journey-delta/` and a second merged branch `097-doctor-ignored-locks`, 098 by
> `specs/098-ops-parity/`, and 099 by the merged `099-fleet-ledger` work. The highest id ever used
> is 099, so this is 100. Earlier pull requests #91, #93 and #94 were authored on branches named
> for the superseded numbers; those names survive in history while the directory does not.

## Problem

Proso cannot read an article to a reader who has no account, no license key, and no provider
key. `docs/reading-journey-status.md` records why: Free managed synthesis returns 402 (commit
`7e4cda0`), and browser `speechSynthesis` was deliberately removed (commit `9797dc6`). Every
surviving route requires either a credential or a credit balance, so the product's own INV-001
outcome — the free tier never requires account creation — has no delivery path.

Pedro owns a machine on his tailnet that already synthesizes speech. `docs/research/local-reader-lab-2026-07-30.md`
proposed using it and explicitly labelled the proposal an unimplemented hypothesis.

Two further findings from the review actor's 05/08/2026 verification shape what this feature is
for:

**The account-free journey cannot be demonstrated on `main` at all.**
`packages/server/src/infrastructure/controllers/tts.controller.ts:248` returns
`HttpStatus.PAYMENT_REQUIRED` from commit `7e4cda0`, and
`docs/reading-journey-status.md:25,33` records the same alongside the removal of browser
`speechSynthesis`. `make smoke-reading` goes green only because it points the extension at a local
fixture stub rather than at a real audio source. This feature is therefore the first route in the
repository that can produce real audio with no account, no license key, and no provider key — the
acceptance of FR-1 is not merely sequenced after slice D, it is the first opportunity to run an
account-free read against real audio.

**Public-user acceptance is unimplemented, not blocked.** Firefox Nightly 154.0a1 and geckodriver
0.37.0 are present; `scripts/smoke-reading.mjs` resolves the browser without `FIREFOX_BIN` and
passed green at `00f69ad`; the popup ships public accessible names (`aria-label="Play"`,
`"Previous paragraph"`, `role="tablist"`, `aria-live="polite"`); and the chrome-context mechanism
a public actor needs already exists in the harness at `scripts/smoke-reading.mjs:90,124,201`,
currently pointed at addon install rather than at a toolbar click. The gap between the existing
internal-dispatch diagnostic and Feature 095's public-control contract is work, not missing
capability. Nothing in this feature's acceptance is BLOCKED on infrastructure.

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
| bounded input | FR-7, at the appliance's published 8,192 UTF-8 bytes, measured in bytes, with sentence-level chunking below that |
| bounded concurrency | FR-7, at one in-flight synthesis plus one prefetch — the published `queueCapacity: 8` is a combined TTS-plus-STT figure, measured TTS admission is 4, and a single inference worker means client concurrency above 1 buys no throughput |
| bounded timeout | the failure-mode table: every reachability and 5xx row is bounded and falls back rather than stalling |
| explicit optional host permission | FR-6, requested at runtime from a user gesture |
| no hard-coded tailnet addresses | FR-3, falsified by a `grep` of shipped source |
| **authenticated** | **not met at the application layer.** The appliance publishes no authentication scheme, so the extension has none to satisfy. Access control is network-layer: the host is reachable only from inside the reader's tailnet, where device identity is established by WireGuard. If a reader exposes their appliance beyond that boundary, this feature adds no credential to protect it, and neither the extension nor this specification can. Adding a shared secret is possible future work; it is not in scope here and would not change FR-1, since a secret for a reader's own machine is not a Proso account. |

The same paragraph also requires that offline, timeout, invalid-WAV, denied-permission, and 5xx
outcomes each call the existing server adapter **exactly once**. That is stricter than "falls
back" and is carried as a test obligation in `tasks.md`, not merely as prose here.

## Unresolved: which seam carries the audio — a maintainer decision

This specification describes an **extension-direct** seam: the extension talks to the appliance
itself. A prior recorded decision says the opposite, and this document does not get to supersede it
quietly.

### The recorded decision

`~/Documents/Notes/2. Areas/🧙 Merlin Unlock/projects/orangepi-audio-appliance/RESEARCH.md`
(31/07/2026) fixes the seam at line 56-60 and again at line 428:

> `ServerTtsAudioAdapter` → Proso API `/api/v1/tts/synthesize` → `TTSProviderPort` → new
> `AudioApplianceTTSAdapter` → Pi `/v1/tts`.

It then constrains the client explicitly:

- line 74 — "Do not add direct Pi networking to Proso content scripts or the Lectrice WebView."
- line 442 — "no Pi hostname permission or bearer token in the extension."
- line 423 — the repository "deliberately removed direct provider adapters and centralized premium
  TTS in commit `d033edd`. Preserve that decision."

And it orders the work. Line 489 makes "Add Proso's server adapter, explicit local provider policy,
and the gated Dokku DNS configuration" step 5, and line 495 states:

> No client PR should start before steps 1–3 establish the stable contract.

Steps 1 and 2 shipped 31/07/2026 (NixOS #1481, #1487, #1496). **Step 3 — burst, cancellation,
idempotency, sustained thermal, and human speech acceptance, with published actual bounds (line
486) — has not run in full.** Slice E measured burst, idempotency and latency on 05/08/2026 but not
sustained thermal behaviour or human speech acceptance. So Feature 100 both picks the other seam
and starts ahead of the gate that governs either seam.

### Server-side seam — extension → Proso API → `AudioApplianceTTSAdapter` → Pi

For it: it honours the decision as recorded, and it needs no constitution amendment at all — the
first-party API remains the only destination page text reaches, so Principle I is untouched and
**PR #92 would be withdrawn rather than merged**. It reuses `ServerTtsAudioAdapter`, so the
extension keeps one TTS path instead of two. It keeps the appliance hostname, and any future
bearer token, out of a shipped artifact that runs on every reader's machine.

Against it: it needs Dokku-container-to-tailnet DNS mapping (line 441), which is Pedro's infra and
not a repository change. And "owner-only routing/entitlement" (line 434) means the server must
recognise the owner before it will route to the appliance — so the read is **no longer literally
account-free**. It becomes free-of-charge and free-of-provider-key for a recognised owner, which is
a different product claim from FR-1's. Page text also travels browser → cloud host → tailnet
rather than staying on the tailnet.

### Extension-direct seam — the one this specification describes

For it: it is the only variant that delivers a read with **no account and no credential of any
kind**, which is FR-1 and the reason this feature was opened at all. Page text never leaves the
reader's own tailnet — it does not transit a cloud host on the way to a machine sitting on the same
network as the browser. It needs no infra change from Pedro and no server deployment.

Against it: it contradicts the recorded decision on three explicit points (lines 74, 423, 442), it
puts a reader-supplied Pi hostname into extension configuration and an optional host permission
into the manifest, and it requires the Principle I amendment in PR #92 to merge before slice C can
ship. Mitigations already in this specification — off by default (FR-2), user-supplied host
(FR-3), runtime permission (FR-6), no hostname in shipped source — narrow the exposure but do not
reconcile it with a decision whose wording is a flat prohibition.

### What each seam invalidates

| Slice | Server-side seam | Extension-direct seam |
|---|---|---|
| B — adapter (PR #95) | **Invalidated as located.** The adapter moves to `packages/server` behind `TTSProviderPort`; its HTTP contract mapping, idempotency derivation and problem+json handling survive the move, its `IAudioGenerator` shape does not | stands |
| C — settings, permission, wiring | **Largely invalidated.** No optional host permission, no host field, no manifest change; replaced by server-side configuration, owner entitlement, and Dokku DNS | stands |
| D — journey oracle | Rewritten against the server route rather than a local fixture | stands |
| E — acceptance | FR-1 cannot be demonstrated as written; the criterion becomes owner-recognised rather than account-free | stands |
| PR #92 — constitution amendment | **Withdrawn.** No third destination exists | required to merge before slice C |
| FR-3, FR-6, FR-7 client bounds | Move server-side; FR-6 disappears | stand |
| RESEARCH.md | unchanged | needs an amendment recording the reversal, with rationale |

Slice B's adapter work is not wasted under either seam — the appliance contract, the error mapping,
the derived idempotency key and the chunking policy are identical on both sides of the boundary.
Only where the code lives and what permission it needs differ.

### Status

Both seams are now designed to the same depth, so the choice can be read in one sitting:
[`plan.md`](./plan.md) is the extension-direct plan, [`plan-server-seam.md`](./plan-server-seam.md)
is the server-side one.

**This is Pedro's decision, and this specification does not make it.** It is recorded here rather
than resolved because picking either seam silently would either supersede a written decision
without a rationale, or abandon FR-1 without saying so. Independently of the fork, line 495 gates
any client work on step 3 completing, and step 3 has not completed — sustained thermal behaviour
and human speech acceptance are both unmeasured.

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

### FR-7 — Chunked synthesis within measured bounds

The appliance cannot stream: it returns a whole WAV or a JSON envelope, so time-to-first-audio
equals full synthesis time for whatever is requested. A paragraph sent in one piece is therefore
~8 seconds of silence before anything plays (measured, see FR-11). Bounds enforcement alone does
not fix that; chunking does.

**Criterion:** text is synthesized at sentence granularity, and the next chunk is requested while
the current one plays. Input is measured in UTF-8 bytes, never in JavaScript string length, and no
request body exceeds 8,192 bytes. **At most one synthesis request is in flight at a time, plus at
most one prefetch** — not the published `queueCapacity: 8`, which is a combined TTS-plus-STT
figure whose per-class split the API never exposes, and which a single inference worker cannot
exploit anyway.

**Falsifier:** a whole paragraph is sent as one request; a request body exceeding 8,192 bytes
leaves the extension; a bound enforced on `String.length`; more than two concurrent requests
observed in a playback or prefetch burst; a `queue_full` 429 caused by the extension's own
concurrency rather than by another client; playback that starves waiting for a chunk that was not
requested early enough.

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

### FR-11 — Time to first audio, at the granularity the criterion binds to

The research falsifier (`docs/research/local-reader-lab-2026-07-30.md:38`) rejects the integration
if representative input misses **either** a warm full-synthesis time of two seconds **or** a
real-time factor of 0.5. The review actor measured both on this appliance on 05/08/2026: RTF is
0.195–0.276 across every input size, comfortably inside the bound and effectively length-invariant;
wall-clock time is 1.162 s at 68 bytes, 1.996 s at 150 bytes, and 7.5–8.3 s at paragraph size
(656–727 bytes).

That is not a measurement gap, it is an ambiguity in the criterion, and the specification resolves
it rather than reporting both numbers and moving on. At a fixed real-time factor, wall time grows
with input, so *any* positive RTF fails a fixed two-second bound for long enough text — a
paragraph-level reading of the clause is unsatisfiable by construction, for this or any
synthesizer. The research doc's own baseline rows used inputs of roughly five seconds of audio,
so the clause was calibrated to sentences.

**Decision: the two-second clause binds to time-to-first-audio, at sentence granularity.** It does
not bind to whole-paragraph synthesis time, and it does not bind to whole-article time.

**Criterion:** after the reader presses play, the first audio begins within two seconds of a warm
appliance, and playback thereafter does not starve at any article length. At RTF near 0.2 the
producer runs roughly five times ahead of the consumer, so a chunk pipeline that starts one
sentence ahead stays ahead.

**Falsifier:** first audio later than two seconds from a warm appliance; any gap in playback
attributable to a chunk not yet synthesized; a delivery claim that reports RTF while omitting that
the wall-clock clause fails against paragraph-sized input; a receipt that states this criterion is
met without measuring time-to-first-audio specifically.

## Failure modes and required results

Every row is a required user-visible outcome. "Fallback" means the existing server route is
attempted with the reader's existing entitlement, which on current `main` will itself refuse for
a Free user — the reader must then see that refusal, not an empty state.

Statuses and `code` values below are measured, not assumed — the review actor probed each one on
05/08/2026. Where they differ from the master brief, the measurement wins. Dispatch is on `code`,
**never on status class**: `engine_failed` is a 503 with `retryable: false`, so an adapter that
retries on `5xx` would retry a permanent failure.

| Condition | How it presents | Required user-visible result |
|---|---|---|
| Provider disabled (default) | no request issued | today's behaviour, unchanged |
| Host not configured | enable attempted with empty URL | settings refuses to enable; states what is missing |
| DNS unresolvable / tailnet down | connection error before response | one bounded retry, then fallback with "local reader unreachable" |
| Permission not granted or revoked | request blocked by the browser | local route disabled, reader prompted to re-grant, fallback |
| `/health` reports `ready: false` | 200 response, `ready` false | no synthesis attempted; "local reader is starting"; fallback |
| Oversize input | **413 `payload_too_large`**, `retryable: false` | must never occur — FR-7 chunks below the bound; if it does, it is a client defect: log, do not retry, fallback |
| Missing or malformed idempotency key | 422 `idempotency_key_required` / `invalid_idempotency_key` | client defect: log, do not retry, fallback |
| Same key, different body | **409 `idempotency_key_reused`**, `retryable: false` | unreachable with a derived key (D-6); if observed, the derivation is broken — fail loudly, do not retry, fallback |
| Malformed body | 422 `unknown_field` / `invalid_speed` / `invalid_input` | client defect; the request shape is wrong, retrying cannot fix it; fallback |
| Unknown voice | 422 `unknown_voice` | fallback, message names the unavailable voice |
| Accept negotiation failure | 406 `unsupported_representation` | client defect; fallback |
| Wrong content type | 415 `unsupported_media_type` | client defect; fallback. Note the header is parameter-tolerant — `application/json; charset=utf-8` succeeds |
| Queue full | **429 `queue_full`**, `retryable: true`, `retry-after: 14` header and `retryAfterMs` | honour the stated delay, one retry, then fallback with "local reader busy". Never a blind backoff, and never caused by our own concurrency (FR-7) |
| Engine starting or timed out | 503 `engine_not_ready` / `engine_timeout`, `retryable: true`, `retry_after_ms` stated | one retry after the stated delay, **reusing the same idempotency key** so it coalesces rather than queueing a second synthesis; then fallback |
| Engine failure | **503 `engine_failed`, `retryable: false`** | no retry — it is permanent; fallback with the reported `requestId` |
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
appliance's 16 to 128 character bound (inclusive; 15 and 129 characters both measure as 422
`invalid_idempotency_key`), over a canonical serialization of exactly the fields the appliance
accepts: input text, voice id, and speed. Nothing else — no URL, no chunk index, no timestamp —
participates, so the same sentence on a re-read reuses retained audio. A retry after
`engine_not_ready` or `engine_timeout` reuses the key it already sent, so the appliance coalesces
the retry instead of queueing a second synthesis.

Deriving the key is also what makes 409 `idempotency_key_reused` — same key, different body —
structurally unreachable: two different bodies cannot produce one key except by digest collision.
A random key would make that failure reachable and the retained-audio replay impossible.

**Falsifier:** two distinct request bodies collide on a key in a seeded property run; the same
body produces different keys across two extension restarts; the key length falls outside 16..128
inclusive; a retry sends a fresh key; a 409 `idempotency_key_reused` is ever observed.

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

3. **Which seam carries the audio.** Extension-direct, as specified here, or server-side through
   `TTSProviderPort` as recorded in RESEARCH.md on 31/07/2026. The trade is stated in full under
   [Unresolved: which seam carries the audio](#unresolved-which-seam-carries-the-audio--a-maintainer-decision).
   Resolving it decides whether PR #92 merges or is withdrawn, and whether slices B and C stand as
   written. RESEARCH.md line 495 also gates any client work on step 3, which has not run in full.

Questions 1 and 2 do not block slices B or D: an adapter and an oracle can be built and proven while
the wording is settled. Question 3 does — it decides where the adapter lives. Shipping the provider
to users without resolving all three would be a violation.

## Non-goals

- Speech-to-text. The appliance exposes transcription; this feature ignores it.
- Provisioning, deploying, or supervising the appliance. It is assumed to exist.
- Discovery. There is no scanning for hosts and no default host.
- Multi-host failover, load balancing, or a second local backend.
- Voice cloning, voice download, or model management from the extension.
- Making the local route the default for anyone other than a reader who enables it.

## Evidence

Nothing in this feature is implemented, so no claim about the extension's behaviour is verified.
The appliance rows are measured, and the measurements below supersede the master brief wherever
the two differ.

| Claim | Status | Evidence |
|---|---|---|
| The appliance is reachable over the tailnet and reports `ready: true` | verified 05/08/2026 17:50 BRT | `GET /health` → `{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}` |
| Published limits are 8,192 UTF-8 bytes, 900 s idempotency retention, 60 s maximum audio | verified 05/08/2026 17:50 BRT | `GET /v1/capabilities` |
| Both voices publish `markKinds: []` | verified 05/08/2026 17:50 BRT | `GET /v1/capabilities` |
| Real-time factor is 0.195–0.276 across every input size, well inside the 0.5 bound | measured 05/08/2026 17:49–18:00 BRT | review actor, 8 runs, EN and PT, WAV duration parsed from each response's own `fmt `/`data` chunks rather than assumed |
| Wall-clock synthesis is 1.162 s at 68 bytes, 1.996 s at 150 bytes, 7.5–8.3 s at 656–727 bytes | measured, same runs | the two-second clause holds at sentence size and fails at paragraph size; FR-11 resolves which granularity it binds to |
| The appliance cannot stream a response | measured and source-confirmed | only a whole WAV or the JSON envelope is offered; time-to-first-audio equals full synthesis time, which is why FR-7 chunks |
| TTS admission is 4, not the advertised 8, and there is a single inference worker | measured | a 12-way burst admitted 4 and returned 429 `queue_full` for 8; the per-class split is never published, and completions serialized at 1.148 / 2.106 / 3.146 / 4.167 s |
| Idempotent replay returns byte-identical audio in ~0.11–0.12 s | measured | EN 0.112 s and PT 0.120 s on a repeat of the same key and body |
| The master brief's 5.475 s cold English figure | **not reproduced** | a comparable warm request took 1.162 s and no cold-load penalty appeared in any run; treated as a one-off model load and deliberately not carried into this specification as a latency characteristic |
| `content-type` is parameter-tolerant | measured | `application/json; charset=utf-8` returns 200; the master brief's "exactly, else 415" was wrong, and a test asserting 415 on a charset parameter would encode the error |
| Audio quality is acceptable to a listener | unverified | never assessed; the research doc says so explicitly |
| Firefox, geckodriver, fixture, public selectors, and the chrome-context mechanism all exist | verified 05/08/2026 | Firefox Nightly 154.0a1, geckodriver 0.37.0, `scripts/smoke-reading.mjs` green at `00f69ad`; public acceptance is unimplemented, not blocked |
| The extension can synthesize against the appliance | not implemented | no adapter exists |
| Fallback, bounds, chunking, permission, and abort behaviour | not implemented | specified above, built in slices B and C |
| The account-free journey works end to end | not implemented | slice E is the only thing that can establish it, and this feature is the first route that makes it possible at all |

## Acceptance

This feature is delivered when FR-1 through FR-11 each have an independent deterministic trace
that does not trigger its falsifier, produced against the built extension in a real Firefox with
the appliance live, and when the two open decisions above have been resolved by the maintainer. A
missing appliance, browser, or fixture makes the gate BLOCKED. It does not make it green.
