# Plan — Feature 252

## Hypothesis and falsifier

**Hypothesis:** a source adapter and durable document queue can reuse Proso's
existing playback, spoken-plan, prefetch, and cache paths once tab ownership
and natural completion are made explicit, without changing page-reading callers.

**Falsifier:** a Miniflux item needs an article tab, uses a separate synthesis
pipeline, resumes by paragraph index, or can be acknowledged after a skip,
failed chunk, stale event, or crash without durable completion evidence.

## Code evidence and reuse decisions

All paths below are relative to the repository root and describe this worktree,
not a claim about deployed behavior.

| Existing surface | Observed behavior and planned seam |
|---|---|
| `packages/extension/src/core/playback/playback-service.ts` | `start(paragraphs, tabId, pageUrl)` always shows a tab footer. State/timing publication is largely guarded by `activeTabId`; add a document session without a fabricated tab ID and a separate progress/completion observer. Preserve the page signature. |
| Same service: `generateAndPlayParagraph`, `generatePrefetchAudio`, `isParagraphCached` | Serial playback and prefetch share spoken text and `ICacheStore`; retain these paths. Current `CacheKey` includes URL hash, paragraph index, provider, voice, and spoken content hash; it is not a checkpoint format. |
| Same service: `setupAudioEventListeners`, `runNext`, `drainChunkQueue` | Natural end and manual Next converge on `next()`/`stop()`. A producer exception can end in done-and-empty state. Add successful-range/terminal evidence before queue acknowledgement; stopped status and empty chunk buffers are insufficient. |
| `packages/extension/src/core/content-extraction/*`, `ports/text-extractor.port.ts`, `ports/reader.port.ts` | Paragraph extraction has no revision/coverage contract. `ITextExtractor` accepts HTML strings; `IReader` expects a DOM document. Reuse extraction at the adapter boundary and add a pure normalized-document mapper; no synthetic article tab. |
| `packages/extension/src/core/speech/spoken-plan.ts` | `buildSpokenPlan` and `projectCharTimings` retain printed-source alignment through number/date/acronym/lexicon expansion. Reuse that mapping; document revision and `SPOKEN_PLAN_REVISION` have different meanings. |
| `packages/extension/src/ports/*` | Existing Result/error, cache, settings, highlighting, and player ports are the conventions. `IAudioPlayer` exists but this PlaybackService uses `Audio` directly; do not claim an injected player is already wired or rewrite all playback for this feature. |
| `packages/extension/src/composition/factories.ts`, `composition/container.ts` | Factories select real/fallback adapters; the container wires prefetch callbacks back into PlaybackService. Extend that composition, keeping one active playback owner. |
| `packages/extension/src/utils/queue/{store,types,player}.ts`, `handlers/queue.handlers.ts` | URL-hashed local queue, `lastParagraphIndex`, legacy wrappers; `playNext()` marks the current item complete. Preserve compatibility, but never treat these messages/callbacks as Miniflux completion authority. |
| `packages/shared/src/*` | Existing Result helpers, Zod boundaries, API and provider/credit contracts; no reading-source contract. Add only the four reusable document contracts and related schemas/exports; keep credentials and extension-only queue orchestration out. |

## Constitution Check

| Principle | Draft assessment |
|---|---|
| I — Privacy First | **BLOCKED for live enablement:** v2.1.0 enumerates synthesis destinations only. Miniflux authentication and read-status transmission introduce a source destination; the local-synthesis permission does not cover it. A documented exception or ratified amendment is required. |
| II — Security by Default | Design conforms with HTTPS, exact configured destination checks, local extension credential storage, inert HTML, no token logging, and unchanged transactional TTS accounting. Verification remains outstanding. |
| III — User Experience | Public keyboard controls, truthful privacy/coverage/progress, bounded recovery, and both themes are acceptance requirements. |
| IV — Modular Architecture | New source/store ports, real and fallback adapters, pure queue transitions, Result errors, composition-only construction. Existing DOM coupling in playback is a compatibility seam, not a precedent for new framework imports. |
| V — Critical Paths | Unit, common adapter contracts, integration, loaded-artifact/public Firefox, fuzz and crash-window checks are ordered in tasks.md. |
| Business invariants | No new Proso account gate or entitlement change; BYOK, credit periods, cache accounting, and unmetered client playback remain required. Shared legacy browser-provider constants do not authorize restoring browser TTS. |

### Complexity Tracking

The source destination needs an explicit governance decision; this plan does
not grant itself an exception. Proposed narrow allowance: user-entered HTTPS
reading source, off by default, runtime permission, token sent only to that
source, list/get and item-specific completion acknowledgement only, no telemetry.
Follow the constitution's rationale, impact report, version bump, and propagation
procedure in a separate authorized change. This drafting task changes neither
the constitution nor any live permission. An optional bridge would need its
own privacy/credential decision as well; it is not a workaround for this block.

## Binding annexes and review response

The implementation follows [document-identity.md](document-identity.md),
[queue-envelope.md](queue-envelope.md) and
[acceptance-and-privacy.md](acceptance-and-privacy.md), all normative v1.
[review-response.md](review-response.md) records all 32 supplied findings.
Keep the four public contracts verbatim; envelope fields never leak into them.
The revised persistence choice is a single IndexedDB transaction, replacing
this draft's earlier browser.storage.local snapshot proposal. Credentials remain
in extension-local storage and audio in the existing cache.

The gate threshold is **before enabling live source traffic**. Until a ratified
amendment or reviewed exception lands, production composition hard-disables all
real-adapter entry points, credential probes and retries. A user-toggle alone
cannot enable them. Offline contracts, migration/store logic, UI previews,
playback seams and gated real-adapter code tested against isolated synthetic
fixtures may land before that decision; real credential import and transmission
may not. Record the governance commit before removing this gate (T003).

## Delivery plan

### 1. Contracts and source adapter

Add readonly document types and Zod schemas under `packages/shared/src/domain/`
and `schemas/`, with named exports and `.js` imports. Keep existing TTS schemas
unchanged. Add `ports/reading-source.port.ts` and typed reading-source errors.
Each adapter instance binds one validated connection. Proposed signatures:

```text
list(query, signal?) -> Promise<Result<ReadingSourcePage, ReadingSourceError>>
get(source: SourceRef, signal?) -> Promise<Result<ReadableDocument, ReadingSourceError>>
acknowledge(source: SourceRef, signal?) -> Promise<Result<void, ReadingSourceError>>
```

`ReadingSourcePage` contains source summaries and an optional opaque continuation
cursor; publication time used for ordering is summary/envelope metadata. Enforce
page/document size limits, connection identity, and cancellation. Errors include
not-configured, permission, unauthorized, not-found, invalid-response, timeout,
rate-limit, network, and aborted; messages never echo tokens or raw bodies.

Use the Miniflux API token in `X-Auth-Token`. List unread entries through
`GET /v1/entries` with bounded pagination; retrieve a body via
`GET /v1/entries/{entryID}`. Acknowledge through `PUT /v1/entries` with exactly
one entry ID and `status: read`; expect 204. This is a set operation, not a
toggle or mark-all operation. These wire details come from the
[Miniflux API reference](https://miniflux.app/docs/api.html).

The adapter uses injected fetch/clock boundaries and rejects unsafe numeric ID
conversion, malformed payloads, redirects, embedded URL credentials, and origins
other than the configured one. The base URL may have a path prefix. Firefox host
patterns cannot scope ports, so validate the exact origin/port on every request
in addition to the runtime scheme/host permission. No token in query strings.
Use no cookies and no publisher/subresource fetches. Verify header isolation
with a second fixture origin. NoOp returns not-configured; InMemory simulates
list/get/set-read and injects repeatable faults without networking.

Normalize with Proso source-text allowlist v1 over the data-only parse5 7.3.0
AST; promote that existing lockfile dependency to direct runtime use in a future
implementation commit. Reuse existing pure extraction helpers where compatible;
DOM-based extraction is not the sanitization boundary. The privacy annex names
all allowed elements, dropped attributes and coverage effects; no network or
executable DOM is allowed during parse/render. Test short text, nested lists,
entities, repeated blocks and unsupported/truncated structures.

Implement the exact ordered JSON/UTF-8 revision and revision-plus-ordinal block
hashes in document-identity v1. Parent ordinals avoid circular hashing. Consume
identity-vectors.json as literal expected values and test metadata-only stability,
Unicode offset repair and expansion-version changes. IDs are stable only within
a revision; inserting a block requires the existing visible restart flow.

### 2. Durable queue and settings

Add `ports/listening-queue-store.port.ts`, an IndexedDB adapter using the
existing Dexie dependency where appropriate, and an InMemory test adapter.
Implement queue-envelope v1: one transaction owns queue settings, order,
checkpoint/audio binding, heard evidence, completion and acknowledgement state.
Await transaction completion and verify strict durable behavior on supported
Firefox before publishing “saved”, continuing or sending. Reject stale sequence,
session, generation and connection epochs within the transaction. A persistence
failure pauses and cannot silently fall back to volatile storage.

Follow the annex's 100-entry, 1 MiB/item text, 5 MiB envelope, 10 MiB migration
working set and 256 MiB audio limits. Handle quota before publishing new state.
Credentials stay outside the envelope; write immutable cached audio before its
binding, and treat missing bytes as an invalid hint. Text/audio expiry is 7 days,
checked before access and within 60 s while running, or on startup when closed.
No physical disk-erasure claim is made while Firefox cannot execute.

Implement v1 initialization, consecutive transactional schema upgrades, one
previous-version backup, validation, fault rollback and idempotent replay exactly
as the annex specifies. Future/corrupt versions block read-write use and retain
bytes for upgrade or explicit clear; no automatic downgrade. Keep `queue:*`
legacy data/messages untouched, with separate UI sections and no conversion of
paragraph progress. Queue settings live in the transactional envelope, with
validated defaults; any old general-settings fixtures remain compatible.

### 3. Playback and checkpoint integration

Add a document-start path sharing PlaybackService internals with existing
`start`; retain old callers. Map the immutable ordered blocks to playback
segments and retain `(blockId, source range)` alongside transient paragraph
indices. Use an identity derived from source tuple and document revision for
queue cache namespacing; never place a credential in it. Reuse the existing
cache port and preserve page keys. Canonical queue synthesis units and keys are
independent of prefetch budgets and local playback slices; coalesce in-flight
requests. Bind audio-byte digest, decoded duration, source range and spoken-plan
key to the checkpoint transaction; discard any incompatible hint before resume.

Publish position, successful played ranges, terminal success, and errors to
the queue independently of `activeTabId`. Build source timing even with no tab,
including prefetched and chunked paths; a NoOp highlight adapter alone cannot
fix the current tab guards. Retain real highlighting for page sessions.
Opening a page session replaces the queue session only after saving its
checkpoint; old media events cannot complete or advance the new owner.

The queue tracks actually heard ranges, not a maximum percentage. A seek creates
a discontinuity and cannot certify the skipped region. Require normal producer
termination with the expected chunks and natural media completion. Persist
enough evidence to continue range coverage across restart; incomplete evidence
is conservatively replayed. Full-document completion is a distinct event before
ordinary stop/reset, bound to source/revision/session/generation and deduplicated.

Map playback timings through the spoken plan back to originalText. Prefer
conservative word/segment starts when timings are approximate or unavailable.
On recovery load the saved snapshot, select the segment before generating or
playing audio, then apply a compatible audio offset after metadata is ready.
Do not briefly play block zero while seeking to the checkpoint. A stale audio
hint restarts the containing segment; changed document revision requires the
visible restart flow specified in spec.md.

Enforce at most 5 s rendered audio between awaited commits and at most 10 s per
recovery segment. Slice longer decoded artifacts locally, preserving cached bytes
and the producer manifest; do not resynthesize due to the bound or budget. Pause
at cadence boundaries while commits are pending. Test 15 s media replay at
0.5×/1×/2× and distinguish the missing/changed-artifact recovery exception.
Disable silence skipping in queue sessions. Spoken-plan mismatch rebuilds mapping
and invalidates affected heard evidence/unsent intent, not just audio timings.

Reuse `PrefetchService.configure`, `generatePrefetchAudio`, `isParagraphCached`
and the cache. Existing chunk paths that bypass caching must gain canonical-unit
cache reuse for queue sessions. Apply the single global speculative budget to
paragraph and chunk lookahead, including old/new continuous-play overlap. Exact
expanded UTF-16 length is reserved before dispatch; release on playback handoff
or settled discard. Budget fluctuations defer whole units instead of splitting
text again. Add an optional adapter capability with legacy defaults only when
necessary to enforce zero budget; prove it in a contract test. There is no
library-wide speculative scheduler or cumulative session cost cap.

### 4. Completion and acknowledgement recovery

Keep listening state separate from acknowledgement state. Local completion
requires full extraction coverage and all speakable ranges heard. In one queue
commit record the completed revision, final checkpoint, and, if enabled, a
pending acknowledgement. Persistence failure prevents sending or continuing
automatically and produces a retryable visible error.

Only the background queue coordinator consumes those intents. Before sending,
verify current connection ownership, setting/intent validity, and source
revision with `get`; a known changed revision holds the intent for user recovery.
Miniflux set-read has no revision compare-and-set in the documented endpoint:
completion refers to the pinned snapshot, not a guarantee that an external edit
cannot race the final request. Do not claim transactional exactly-once delivery
across the browser and Miniflux.

Transport retries follow queue-envelope v1: at most three total attempts per
persisted retry cycle across restarts, a 15 s validation/delivery deadline per
attempt, 1 s/2 s waits increased by valid Retry-After up to 60 s. Longer waits
enter held with a not-before time; auth/permission/not-found/invalid-response/
changed-content faults require visible recovery. Persist attempt consumption
before sending; recovery never resets count. Exhausted means no more automatic
traffic until **Retry mark-read** explicitly creates a new cycle. Expired intents
require new listening; a lost response repeats only the exact idempotent set-read.
Disabling/removal/clear/disconnect cancels unsent work and cannot undo transmitted
writes. Continuous advance consumes completionId exactly once after local commit,
independently of acknowledgement latency, restoring paused after a crash.

### 5. Public controls and privacy

Extend existing popup/options surfaces with a distinct Miniflux queue section.
Use additive, sender-validated background messages; page/content senders cannot
read credentials, create completion evidence, or invoke raw acknowledgement.
Connect/Refresh, Play/Resume, Pause, Stop, Skip, Retry, Remove, Move up/down, and
settings must satisfy the per-control keyboard/role/name/focus/live-region/
contrast/state assertions in acceptance-and-privacy v1. Use its consolidated
error taxonomy and numeric deadlines. Reuse themes; add catalogued English/pt-BR
strings with placeholder parity. Implement the exact Disconnect/clear/Remove
matrix using restartable tombstones and queue-audio ownership; keep the token
only for Clear local queue. No remote telemetry; local diagnostics are redacted
and limited to 1 MiB/24 hours. Announce deletion only after cleanup completes.

Vault import uses an explicit extension credential field, masked after saving;
no host shell integration is assumed. Operational setup must use Pedro's
existing rbw/bw-keyring flow before requesting a missing secret. Tests use
synthetic tokens only. This draft neither reads nor stores a real token.

REQ-013 is a client boundary: validate source tuple/connection epoch for every
operation and message sender, reject page/content-script credential or raw-ack
requests, and send no source operations through the Proso server. The optional
bridge is separately scoped as SERVER-252-001 with authenticated ownership,
cross-user denial and SSRF tests in its own future spec. It is not a dependency
or an unchecked server deliverable of Feature 252.

## Verification and delivery boundary

Follow [tasks.md](tasks.md) in dependency order. Use existing Jest unit,
contract, and integration projects, Zod, and fast-check; no new test framework
is planned. The parse5 direct-runtime promotion is the one dependency-scope
change required by the no-network parsing contract; no manifest changes occur
in this documentation revision. Keep deterministic tests offline and leave
`make verify` prerequisites and semantics unchanged. Browser/soak evidence
belongs in the explicit user gate, not a new network dependency of verify.

Public acceptance follows Feature 095 and the proso-user-gate contract: isolated
synthetic source/TTS fixtures, public actor, deterministic observer, exact
build/HEAD, seed/run count, actions, replay command, assertions, redacted HTTP
records, logs, resources, artifacts, timestamps, and exit status. Missing tools
or public controls block acceptance. Internal-dispatch smoke is diagnostic only.
Use the current authorized different-family review lane; stale lower-tier
reviewer examples in older delivery docs do not override model-routing policy.

For this documentation-only revision, validate the four contracts byte-for-byte
against the starting commit, recompute all six golden vectors with an independent
JSON/UTF-8/SHA-256 path, check every relative annex link and finding/requirement
mapping, and run `git diff --check`. Keep all edits inside this spec directory.
The previous draft recorded `make doctor` failing on missing generated Prisma;
that is historical evidence, not a result of this revision. Do not bootstrap,
build or run gates that write outside the user's allowed directory. No runtime,
Firefox, full verify or fresh different-family PASS is claimed. Future tasks
remain unchecked. Commit convention: `docs: resolve Feature 252 spec review`;
no attribution and no push in this task.
