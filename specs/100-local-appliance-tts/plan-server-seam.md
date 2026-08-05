# Implementation Plan (server-side seam): local appliance behind the Proso API

**Branch**: `100-server-seam-plan` | **Date**: 05/08/2026 | **Spec**: [spec.md](./spec.md)
**Status**: sibling plan, not a replacement. [`plan.md`](./plan.md) remains the extension-direct
plan and is not softened here. Neither seam is chosen in this document.

**Why this exists**: the spec records the seam fork under
[Unresolved: which seam carries the audio](./spec.md#unresolved-which-seam-carries-the-audio--a-maintainer-decision)
but only designs one side of it. A fork where one branch has a plan and the other has a paragraph
is not a real choice. This is the other branch, to the same depth, so the decision can be made in
one sitting.

Source of the recorded decision throughout:
`~/Documents/Notes/2. Areas/🧙 Merlin Unlock/projects/orangepi-audio-appliance/RESEARCH.md`
(31/07/2026), cited by line.

## Summary

Page text goes browser → Proso API → a new server-side `AudioApplianceTTSAdapter` → the appliance
on the tailnet. The extension is unchanged except for provider selection: it keeps posting whole
paragraphs to `POST /api/v1/tts/synthesize` through `ServerTtsAudioAdapter`, exactly as it does for
every other provider today. This is the seam RESEARCH.md fixes at lines 56-60 and restates at
line 428, and it satisfies lines 74, 423 and 442 by construction — no Pi networking in the client,
no Pi hostname in the extension, and the centralization from commit `d033edd` preserved.

The cost is stated up front, because it is the crux of the fork: RESEARCH.md line 434 requires
"owner-only routing/entitlement", so the server must know the request comes from the owner before
it will route to the appliance. **A route that must recognise the caller is not account-free.**
FR-1 as written in the spec does not survive this seam unchanged; the honest replacement is stated
under [What FR-1 becomes](#what-fr-1-becomes) rather than papered over.

## Technical Context

**Language/Version**: TypeScript 5.9, strict, Node ESM with explicit `.js` import suffixes
**Primary Dependencies**: NestJS 10 + `@nestjs/platform-express`, Zod 3.x; no new runtime dependency
**Storage**: existing Postgres via Prisma 7 (`@prisma/adapter-pg`); existing `CacheStorePort` for audio
**Testing**: Jest 29 `*.spec.ts` mirroring source; contract suites per port; the two Prisma contract
suites still need a Postgres this host lacks
**Target Platform**: the Dokku-deployed `proso-api` container, plus Firefox 109+ unchanged
**Constraints**: appliance bounds unchanged — 8,192 UTF-8 bytes per request, 900 s idempotency
retention, 60 s max audio, **no response streaming**, effective TTS admission 4 behind a single
inference worker
**Scale/Scope**: one server adapter, one provider identity, one entitlement clause, one deployment
networking change that is not ours to make

## Where the adapter sits

`TTSProviderPort` (`packages/server/src/ports/tts-provider.port.ts`) is an abstract class with
`providerId`, `supportedLanguages`, `synthesize(TTSSynthesizeParams)` and `getVoices(language?)`,
returning `Result<T, TTSError>`. `AudioApplianceTTSAdapter` implements it beside the four existing
adapters in `packages/server/src/adapters/tts/` (`openai-tts.adapter.ts`, `elevenlabs-tts.adapter.ts`,
`groq-tts.adapter.ts`, `cartesia-tts.adapter.ts`).

Registration is the existing `TTS_PROVIDERS` map — `@Inject('TTS_PROVIDERS') providers: Map<TTSProvider, TTSProviderPort>`,
consumed by both `TtsController` and `core/tts/tts.service.ts`. The adapter joins that map **only
when the appliance base URL is configured**, so an unconfigured deployment behaves exactly as today
and `getVoices` on the new provider 400s with the existing "not configured on this server" message.

`TTSProvider` in `@proso/shared` gains an `AudioAppliance` member. RESEARCH.md line 432 forbids
masquerading as OpenAI, Groq, Cartesia or ElevenLabs, so this is a required identity, not a
convenience: `X-Provider` on the response, the cache key, and any future receipt must all say
`audio-appliance`. `VALID_PROVIDERS` in `tts.controller.ts` and the schema enum in
`@proso/shared/schemas` change with it.

### What the router and entitlement path must do

Two modules decide today, and they are deliberately separate:

- `core/routing/provider-router.ts` — `selectProvider(tier, language, preferredProvider, availableProviders)`.
  Its own header says it "answers 'which provider?', never 'is the caller entitled?'".
- `core/tts/tts.service.ts:155` — the entitlement gate,
  `if (!FEATURE_MATRIX[request.tier].managedTts) return Err(creditError(ErrorCode.InsufficientCredits, …))`,
  which sits **above** the cache probe on purpose and is the 402 the extension branches on.

The appliance must not be reachable through either path as they stand:

1. **It must never enter a fallback chain.** `TIER_PROVIDER_ORDER` in `core/routing/fallback-chain.ts`
   maps each tier to an ordered provider list; adding `AudioAppliance` to any of them would route a
   stranger's paragraph to Pedro's Pi the moment a cloud provider hiccuped. The appliance is
   selectable only as an explicit `preferredProvider`, and only for the owner. RESEARCH.md line 440
   allows "one pre-dispatch fallback provider; no fallback after ambiguous dispatch" — that is the
   appliance falling back *to* a cloud provider before dispatch, never the reverse.
2. **It must bypass the credit gate without bypassing entitlement.** Line 434 requires "zero
   managed-credit debit". The `managedTts` check is a tier flag, so the appliance needs its own
   branch placed *beside* it, not inside it: if the resolved provider is `AudioAppliance` and the
   caller is the owner, skip credit preflight and commit entirely (`creditsUsed: 0`), and if the
   caller is not the owner, return the same 402-class refusal rather than a 503 — the caller is not
   entitled, the provider is not broken.

`selectProvider` therefore gains no appliance knowledge at all. The service gains one guarded
branch before routing. That keeps the router's stated contract intact and puts the entitlement
decision where the other entitlement decision already lives.

## Owner-only routing — the clause that decides FR-1

RESEARCH.md line 434 is one line and it carries the whole product consequence. "Owner-only" needs a
definition of owner, and the server has exactly one identity mechanism today:
`LicenseKeyGuard` (`packages/server/src/infrastructure/guards/license-key.guard.ts`) reads
`X-License-Key` and attaches it to the request; `TtsController.synthesizeAudio` is reached with
`userId` optionally present, and treats its absence as Free tier — the comment there cites INV-001
explicitly.

Three candidate definitions, with their consequences:

| Definition of owner | Mechanism | Consequence for FR-1 | Consequence for privacy |
|---|---|---|---|
| **A. License key** | existing `X-License-Key`, matched against a configured owner id | account-free read is **lost** — the reader must hold a key | unchanged |
| **B. Server-side allow-list of user ids** | `APPLIANCE_OWNER_USER_IDS`, checked after subscription lookup | account-free read is **lost** — requires an authenticated `userId` | unchanged |
| **C. Network identity** | the appliance itself is tailnet-only; the *server* is the only caller, and any Proso request that reaches the appliance is already inside the tailnet boundary | account-free read **survives**, but "owner-only" is then enforced by the tailnet, not by Proso — any anonymous Proso caller would be routed to Pedro's Pi | inverted: an unauthenticated stranger's page text would reach Pedro's hardware |

C is the only one that keeps FR-1, and it is the one that makes the requirement meaningless: if the
server routes anonymous callers to the appliance, "owner-only" is not being enforced anywhere, and
a public deployment would synthesize strangers' article text on a machine in Pedro's house. This
plan therefore does not propose C, and states plainly that A or B **ends the account-free read**.

### What FR-1 becomes

Under this seam, the spec's FR-1 — "no account, no license key, no provider key" — cannot be met.
Its honest replacement:

> **FR-1′.** A recognised owner reads a full article with no provider key and no credit debit.
> Recognition is by license key (A) or configured user id (B). The read is free of charge and free
> of provider credentials; it is not free of identity.

Falsifier for FR-1′: a credit transaction attributable to an appliance synthesis; a request without
owner recognition routed to the appliance; a refusal for a recognised owner that reports 503 rather
than an entitlement error.

**This is the fork's real cost, and it should be read next to what the extension-direct seam costs:
a Pi hostname in extension configuration and a manifest host permission.** One seam spends the
product claim, the other spends the client boundary. That trade is Pedro's to make, and neither
this plan nor `plan.md` makes it.

## FR-7 once the browser is out of the loop

The physics do not change with the seam, and the spec now says so per-seam: the appliance cannot
stream, so time-to-first-audio equals full synthesis of whatever is requested, and a single-shot
paragraph is **8 seconds of silence — measured, 7.5–8.3 s for 656–727 bytes**. Only the owner of
the work moves.

The extension keeps posting whole paragraphs to `/api/v1/tts/synthesize`, so **all of FR-7 moves
inside `AudioApplianceTTSAdapter`**:

- **Chunking**: sentence-boundary splitting measured in UTF-8 bytes (`Buffer.byteLength`, not
  `String.length`), each chunk under 8,192 bytes, a single over-long sentence refused rather than
  truncated.
- **Reassembly**: the adapter returns one `TTSSynthesizeResult` with a single `audio: Buffer`, so
  it must concatenate chunk audio into one playable stream. This is where the seam is genuinely
  harder than the client one: concatenating WAV files byte-wise yields one valid header followed by
  embedded headers. The adapter must strip subsequent headers and fix the `RIFF`/`data` sizes, or
  emit a container the client already decodes. That work does not exist on the extension-direct
  side, where each chunk is played in sequence and never merged.
- **Per-chunk idempotency keys**: derived server-side from `(chunk text, voice, speed)`, 16..128
  characters. The extension's key, if it ever sends one, covers a paragraph and cannot address a
  chunk.
- **Concurrency**: one in-flight synthesis plus at most one prefetch, and — unlike the client seam —
  the cap must hold **across concurrent callers**, not across one popup. The appliance admits 4 TTS
  requests behind a single inference worker, so the adapter needs a process-wide semaphore, and a
  multi-instance Dokku deployment would need the cap to hold across instances or to accept 429s.
- **Latency**: the API hop is added on top of full synthesis. Time-to-first-audio is strictly worse
  than the client seam by one round trip through the cloud host.

### The retry defect this seam inherits

RESEARCH.md lines 435-436 record the requirement and the existing defect together: "stable
end-to-end `Idempotency-Key` propagation — the extension currently retries synthesis POSTs without
it."

Under the extension-direct seam that defect is fixed by construction: the client derives the key
(spec D-6) and a retry reuses it.

Under this seam it is **relocated, not removed**. The client keeps retrying paragraph POSTs with no
key, while the server holds per-chunk keys underneath. A retried paragraph re-enters chunking, and
whether it replays the appliance's retained audio (measured 0.112–0.120 s) or re-synthesizes from
scratch depends entirely on whether the server's per-chunk derivation is byte-stable across
requests. It is a server-side correctness problem with a client-side cause, and it needs one of:

1. propagate an end-to-end `Idempotency-Key` header from the extension through the controller into
   the adapter — which is a client change, so this seam does not leave the extension untouched
   after all; or
2. make the server derivation depend only on `(chunk text, voice, speed)` and nothing
   request-scoped, so an unkeyed retry is idempotent by construction.

Option 2 is the smaller change and is what this plan proposes. It also makes the server's
`CacheStorePort` entry and the appliance's own retention window agree, which is what INV-006 needs.

## Dokku → tailnet: Pedro's infra, not ours

RESEARCH.md line 441 requires "Dokku container MagicDNS/host mapping and native environment
configuration". The appliance is published by Tailscale Serve at a MagicDNS name reachable only
from inside the tailnet. The Proso API runs in a Dokku container which, today, has no tailnet
membership and no resolver that answers that name — `packages/server` has `Dockerfile`, `Procfile`
and `app.json`, and nothing in them touches host networking.

Reaching the appliance from the container needs one of: a Tailscale sidecar or userspace client in
the container with its own auth key; a host-level `tailscaled` plus container DNS pointed at the
tailnet resolver; or a Tailscale Funnel/subnet-router arrangement. **Every one of these is a change
to Pedro's host, a new auth key, and a new device on the tailnet.** None is a change to this
repository, none can be tested from a worktree, and a wrong choice exposes the appliance beyond the
boundary that is currently its only access control.

That is why this is stated as a blocking dependency and not a task: the repository work can be
written and unit-tested against a stub, but the seam cannot be demonstrated end to end until Pedro
makes a networking decision on his own infrastructure. The extension-direct seam has no equivalent
dependency — the browser is already on the tailnet.

## FRs that disappear or change

| FR | Under this seam |
|---|---|
| **FR-1 account-free** | **Lost as written.** Becomes FR-1′, owner-recognised. See above |
| FR-2 opt-in, off by default | Survives, relocated: default is the appliance absent from `TTS_PROVIDERS` unless configured. The client-side proof (no request issued without opt-in) becomes a server-side proof (provider absent from the map) |
| **FR-3 configurable base URL** | **Changes owner.** No longer a user setting in the options page; becomes server configuration (`APPLIANCE_BASE_URL` in the Dokku environment). The "no hostname in shipped source" falsifier still applies, now to the server image rather than the extension bundle |
| FR-4 honest fallback | Survives, but the reason must survive the API hop — the 402/503 body must carry why the local route was not used, or the reader sees a bare failure |
| FR-5 no fabricated word timings | Unchanged. RESEARCH.md line 439 says `wordTimings: null` until the mark gate passes, which matches spec D-3 |
| **FR-6 permission honesty** | **Disappears entirely.** No optional host permission, no `browser.permissions.request`, no manifest change. This is the requirement the recorded decision exists to eliminate (line 442) |
| FR-7 bounds and chunking | Survives, moves server-side, and grows reassembly. See above |
| FR-8 derived idempotency | Survives, moves server-side, and must additionally absorb the client's unkeyed retries |
| FR-9 privacy | **Weaker in one direction, stronger in another.** Page text now transits a cloud host before reaching a machine on the reader's own network — strictly more exposure than the client seam. In exchange, no reader ever holds the appliance address |
| FR-10 invariants | INV-006 unchanged. INV-001 is the casualty (FR-1′). Constitution Principle I is **satisfied without amendment** — the first-party API stays the only destination — so **PR #92 would be withdrawn** |
| FR-11 time to first audio | Survives, harder: full synthesis plus one API round trip. The two-second clause still binds to time-to-first-audio at sentence granularity, and the added hop eats part of that budget |

## Slice B: what transplants, what is discarded

Slice B is PR #95, `LocalApplianceAudioAdapter` plus 58 adapter tests, merged into nothing yet.

**Eng's own assessment of the transplant was not published at the time of writing.** PR #95's body
covers its local gates and an 11/11 planted-break proof and does not discuss the server seam, and
the PR has no comments. Rather than attribute a position to eng that does not exist yet, the
judgement below is made from the diff itself, and should be replaced by eng's assessment when it
lands — including wherever eng disagrees with it.

Read from `packages/extension/src/adapters/audio/local-appliance-audio.adapter.ts` as it stands in
PR #95:

**Transplants unchanged (pure, framework-free, and about the appliance rather than the browser):**

- `parseWavDurationMs` — walks `RIFF`/`fmt `/`data` chunks, returns `null` on malformed input.
  Satisfies RESEARCH.md lines 437-438 ("real duration … rather than estimating duration from MP3
  byte length") on either side of the boundary.
- `utf8ByteLength`, and the bound constants `APPLIANCE_MAX_TEXT_UTF8_BYTES = 8192`,
  `IDEMPOTENCY_KEY_MIN_LENGTH/MAX_LENGTH`, `APPLIANCE_TTS_ADMISSION_LIMIT = 4`,
  `APPLIANCE_RECOMMENDED_CONCURRENCY = 1`.
- `deriveIdempotencyKey` — SHA-256 over `input\0voice\0speed`. It takes `subtle` as an injected
  dependency, so Node's `webcrypto` substitutes for the browser's without touching the function.
- `APPLIANCE_ERROR_CODES` and the whole problem+json mapping: the `switch (problem.code)` dispatch,
  the 429 `retry-after` / `retryAfterMs` / `retry_after_ms` reading, and the
  `engine_failed`-is-503-but-not-retryable distinction.
- Voice/language matching by primary subtag.
- The 58 adapter tests, minus the ones that assert `IAudioGenerator` shape.

**Discarded or rewritten:**

- The `implements IAudioGenerator` shape itself — `generateAudio`/`getVoices`/`validateCredentials`
  become `synthesize`/`getVoices` under `TTSProviderPort`, and the extension-side `AudioError`
  factories become `TTSError` via `ttsError(code, msg)`.
- `FetchLike` injection stays useful, but the abort path changes: the browser's `AbortSignal` from
  a popup no longer reaches the adapter, so cancellation must be expressed as an HTTP client
  disconnect on the Express request or dropped.
- `ProviderId = … | 'local'` in `packages/extension/src/core/shared/errors.ts` and the
  `provider.handlers.ts` and `browser-settings.adapter.ts` changes — all client-side plumbing for a
  provider the client would no longer address directly.
- Everything slice C would have added: settings model, options UI, `browser.permissions.request`.

**Where I would expect to disagree with eng**, flagged now so the disagreement is visible rather
than silent: I read the reassembly problem as *new work created by this seam*, not as a transplant
cost — nothing in PR #95 merges chunk audio, because the client plays chunks in sequence. If eng's
assessment scores the transplant as near-total, that is the line I would push on. Concatenating WAV
correctly, or choosing a container the client already decodes, is the one piece of this seam with
no prior art in either package.

## Sequencing, and the gate that governs both seams

RESEARCH.md line 489 makes this seam **step 5** of its delivery sequence, after step 4 (Lectrice's
Rust seam), and line 495 states: "No client PR should start before steps 1–3 establish the stable
contract."

Steps 1 and 2 shipped 31/07/2026 (NixOS #1481, #1487, #1496). Step 3 (line 486) is "burst,
cancellation, idempotency, sustained thermal, and human speech acceptance". Slice E measured burst,
idempotency and latency on 05/08/2026. **Sustained thermal behaviour and human speech acceptance
remain unmeasured**, so step 3 is incomplete and line 495 gates client work under *either* seam.
That is not an argument for one side of the fork; it is a constraint on both, and it is already
recorded in the spec.

Work order under this seam, once the fork is decided and step 3 completes:

1. `TTSProvider.AudioAppliance` in `@proso/shared`, with the schema enum and `VALID_PROVIDERS`.
2. `AudioApplianceTTSAdapter` under `TTSProviderPort`, transplanting the list above; the existing
   TTS provider contract suite runs against it unmodified.
3. Chunking, WAV reassembly, per-chunk keys, process-wide concurrency cap — with the reassembly
   proven by decoding the merged output, not by asserting its byte length.
4. The owner branch in `tts.service.ts`: entitlement beside `managedTts`, zero credit debit,
   entitlement-class refusal for non-owners, and the appliance kept out of every fallback chain.
5. Extension: provider selection only. No host permission, no host field.
6. Dokku networking — **Pedro's infra**, blocking end-to-end demonstration but not the code.
7. Journey oracle against the server route, and acceptance against FR-1′ rather than FR-1.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| A provider that must never appear in a fallback chain | Every other provider in `TIER_PROVIDER_ORDER` is a cloud vendor; this one is a machine in a house | Adding it to the tier orders is one line and routes a stranger's paragraph to Pedro's Pi on the first cloud hiccup |
| An entitlement branch beside `FEATURE_MATRIX.managedTts` rather than inside it | Line 434 requires routing **and** zero credit debit; `managedTts` is a tier flag and the appliance is not a tier | Reusing `managedTts` would either charge credits for a free local synthesis or hand a paid feature to a tier that lacks it |
| WAV reassembly in the server adapter | The port returns one `Buffer` and the appliance cannot stream | Returning chunk boundaries to the client would push chunking back into the extension, which is the seam this plan is not describing |

## What this plan does not do

It does not choose. It does not soften [`plan.md`](./plan.md), which remains the extension-direct
plan with its own trade-offs intact. It does not restate INV-005, and it does not treat FR-1's loss
as acceptable — it states it as the price of this seam, next to the price of the other one, and
leaves the decision to Pedro.
