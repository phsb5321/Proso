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

Normalize detached, sanitized HTML using the existing extraction capabilities.
Audit short paragraphs, headings, nested lists, entities, repeated blocks,
tables, and truncation. Do not label dropped text “full” or reuse the existing
minimum-length validation as proof of complete source coverage. Revision
hashing covers ordered source blocks and normalization version; `fetchedAt`
and remote read status cannot invalidate an otherwise unchanged checkpoint.

### 2. Durable queue and settings

Add `ports/listening-queue-store.port.ts`, a `browser.storage.local` adapter,
and an InMemory adapter. Use a dedicated versioned `listeningQueue:v1` snapshot
key with one background writer: validated whole-snapshot replacement keeps
checkpoint, completion evidence, and acknowledgement intent together. Queue
core transitions are immutable; adapter exceptions become typed Result errors.
Serialize mutations and reject obsolete session/generation updates. Publish
“saved” only after the storage operation succeeds. Interrupted writes must
restore a valid previous or new snapshot, never a torn completion record.

Initial bounds: 100 entries, 1 MiB normalized text per document, and 5 MiB queue
snapshot; validate encoded byte size before writing and handle browser quota
errors. Evict only explicitly cleared or settled completed records, never an
active checkpoint or pending acknowledgement. If space is still insufficient,
stop import and show an actionable error. Credentials/preferences use separate
extension-local keys; audio remains in the existing cache.

Missing storage initializes disabled/empty defaults. Future or corrupt versions
are preserved and reported, not overwritten as an empty queue. Migrations must
be idempotent and retain the previous snapshot until successful. Leave existing
`queue:*` storage and message shapes intact; no migration invents revisions from
legacy paragraph indices. New queue settings are optional in old Settings
fixtures and validated/defaulted at the storage boundary.

### 3. Playback and checkpoint integration

Add a document-start path sharing PlaybackService internals with existing
`start`; retain old callers. Map the immutable ordered blocks to playback
segments and retain `(blockId, source range)` alongside transient paragraph
indices. Use an identity derived from source tuple and document revision for
queue cache namespacing; never place a credential in it. Preserve the existing
cache key shape and page-reading keys. Audio identity must additionally reject
incompatible voice/provider/spoken text and chunk plans before resume.

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

Reuse `PrefetchService.configure`, `generatePrefetchAudio`, `isParagraphCached`,
and the durable cache. Chunked synthesis currently bypasses paragraph caching
and primes `nextText` in its adapter; preserve that distinction and apply the
same speculative budget to chunk lookahead. If the adapter cannot respect zero
budget, add an optional capability/options field with legacy defaults and a
contract test; do not silently ignore the setting. There is no new cross-item
prefetch scheduler in this slice.

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

Transport retries are at-least-once with an idempotent effect. Try at most three
times per recovery pass, with per-attempt 15-second deadlines and persisted
backoff (1 second, then 2 seconds; respect bounded Retry-After, deferring longer
delays). Auth/not-found/invalid-response failures require an explicit retry or
reconnection. Do not poll indefinitely. A lost success response leaves a
durable intent; replay repeats only set-read. Disabling mark-read or disconnecting
cancels unsent work; already transmitted writes cannot be undone by cancellation.
Continuous playback advances once after local commit, independently of remote
acknowledgement latency. Failed playback pauses; explicit Skip never completes.

### 5. Public controls and privacy

Extend existing popup/options surfaces with a distinct Miniflux queue section.
Use additive, sender-validated background messages; page/content senders cannot
read credentials, create completion evidence, or invoke raw acknowledgement.
Connect/Refresh, Play/Resume, Pause, Stop, Skip, Retry, Remove, Move up/down, and
settings must have accessible names and observable states. Reuse existing theme
and settings patterns. Disconnect and clear-data behavior follow spec.md.

Vault import uses an explicit extension credential field, masked after saving;
no host shell integration is assumed. Operational setup must use Pedro's
existing rbw/bw-keyring flow before requesting a missing secret. Tests use
synthetic tokens only. This draft neither reads nor stores a real token.

No server bridge is required. If later proposed, bind every connection to the
authenticated user on the server, enforce ownership before resolving secrets
or scheduling jobs, isolate caches/retries per user, and test cross-user denial.
Reject arbitrary proxy URLs/SSRF and never accept a client-asserted user ID.
That work is a separate deployment/privacy scope, not a dependency of this MVP.

## Verification and delivery boundary

Follow [tasks.md](tasks.md) in dependency order. Use existing Jest unit,
contract, and integration projects, Zod, and fast-check; no new test framework
or runtime dependency is planned. Keep deterministic tests offline and leave
`make verify` prerequisites and semantics unchanged. Browser/soak evidence
belongs in the explicit user gate, not a new network dependency of verify.

Public acceptance follows Feature 095 and the proso-user-gate contract: isolated
synthetic source/TTS fixtures, public actor, deterministic observer, exact
build/HEAD, seed/run count, actions, replay command, assertions, redacted HTTP
records, logs, resources, artifacts, timestamps, and exit status. Missing tools
or public controls block acceptance. Internal-dispatch smoke is diagnostic only.
Use the current authorized different-family review lane; stale lower-tier
reviewer examples in older delivery docs do not override model-routing policy.

For this documentation-only draft, `make help` was inspected and `make doctor`
failed with `Prisma client is missing; run make bootstrap`. Bootstrap/builds
would write outside the allowed spec directory, so they were not run. No full
`make verify`, runtime tests, browser acceptance, or adversarial gate is claimed.
The implementation tasks remain unchecked. Suggested draft commit:
`docs: draft Feature 252 listening queue`.
