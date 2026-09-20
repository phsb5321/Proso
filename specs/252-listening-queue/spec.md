# Feature 252 — Listening queue

**Status:** Draft; implementation and acceptance evidence are outstanding.
**Scope:** Miniflux documents played by the Firefox extension without opening
article tabs or the Miniflux web UI. Firefox must remain running; a standalone
player that works with Firefox closed is outside this feature.

## Problem

Proso can synthesize, prefetch, and cache extracted paragraphs, but its playback
entry point is tied to a reading tab. The existing URL queue stores paragraph
indices and treats a manual next-item action as completion. Neither behavior
can safely represent a persistent Miniflux listening session or authorize a
remote mark-read operation.

## Goal

Connect an explicitly configured Miniflux instance using an API token held in
the reader's vault, import its unread items, and listen through Proso's existing
playback pipeline. Preserve source-relative progress across restarts and mark
items read only after genuine, durably recorded completion.

## Proposed contracts

These four contracts are preserved verbatim:

```text
SourceRef{provider,connectionId,itemId,canonicalUrl}
ReadableDocument{source,title,author,language,revision,blocks,coverage,fetchedAt}
Block{id,kind,originalText,sourceAnchor?,parentId?}
Checkpoint{documentRevision,blockId,sourceOffset,audioOffsetMs}
```

Semantics and boundary validation:

- `SourceRef.provider` is `miniflux` for this adapter. Identity is the tuple
  `(provider, connectionId, itemId)`, never the URL alone. `connectionId` is an
  opaque local identifier, not a token; `itemId` is an opaque string validated
  by the adapter. `canonicalUrl` is display/source metadata, never an automatic
  fetch target. Equal URLs on different connections remain distinct items.
- `ReadableDocument.title` is a string; unknown `author` and BCP-47 `language`
  are null. `blocks` is an ordered immutable sequence. `fetchedAt` is a Unix
  epoch timestamp in milliseconds. `revision` is a deterministic digest of
  normalized source content, structure, and normalization version, excluding
  fetch time, read status, voice, and spoken-plan revision.
- `Block.id` is unique and stable for a given document revision, including
  repeated identical text. `kind` initially covers paragraph, heading, and list;
  unsupported structures receive an explicit coverage limitation. `originalText`
  is sanitized, decoded source text before speech expansions. Optional anchors
  are inert source references; optional parents must resolve without cycles.
- `coverage` describes the supplied content, not listening progress: full,
  partial, or unknown, with reasons for omissions/truncation. “Full” means the
  supplied Miniflux body was represented, not that a publisher's complete
  article was independently fetched. Empty/unreadable content is an error.
- A checkpoint is stored under source identity and `documentRevision`;
  `blockId` locates its block and `sourceOffset` addresses UTF-16 code units in
  that block's `originalText`. Offsets are bounded and never split a surrogate
  pair. Position identity is revision plus source offset within the named
  block, never paragraph index or spoken-text offset. `audioOffsetMs` is a
  nonnegative position within the current audio segment, usable only with the
  matching audio identity recorded in the queue envelope.

Queue ordering, status, playback generation, heard ranges, audio identity,
completion evidence, and acknowledgement retry metadata live in a separate
versioned queue envelope. They do not change these four contracts.

## Product outcomes

### Connect and listen without article tabs

The reader configures an HTTPS Miniflux address and imports a vault-held API
token into extension-local credential storage. “Vault-token based” means the
vault is the credential source; this feature does not assume an extension can
execute `rbw` or read an unlocked host vault. There is no OAuth, browser-session
login, or Proso account prerequisite for connecting the source. Existing TTS
entitlements and provider configuration still apply.

Through public, keyboard-reachable controls the reader refreshes the unread
list, sees title/source/coverage, and plays an item. Closing the popup or all
article tabs does not stop queue audio. Reopening the popup displays the active
item and position. Permission denial, rejected credentials, and empty lists
produce distinct, actionable states.

**Falsifier:** an article tab/content script is required; connecting starts
synthesis; a list/get operation marks an entry read; credentials reach a page,
log, or TTS request; or closing the popup destroys playback ownership.

### Resume the source after restart

Queue membership, order, normalized document snapshot, settings, checkpoint,
heard ranges, and pending acknowledgements survive background/browser restart.
Startup restores a paused, visibly resumable session; it never starts audio
without a new Play/Resume action. Matching revisions resume conservatively from
the last committed source position. At most five seconds of normal playback
may be replayed due to checkpoint cadence, plus the current segment when exact
timing is unavailable. No unheard content may be skipped to improve that bound.

If refreshed content has a different revision, keep the old snapshot/checkpoint
and show “Content changed — restart this item.” Restart adopts the new snapshot
at its beginning and clears old completion eligibility. Never apply the old
numeric offset to changed content. Voice, lexicon, or chunk-size changes retain
the source position but invalidate incompatible audio-offset hints.

**Falsifier:** restart loses committed progress, silently maps to changed text,
autoplays, or treats persisted `playing`/100% progress as completion.

### Complete honestly and acknowledge idempotently

Completion requires successful natural playback of all required speakable
source ranges in one document revision, including all chunks. Coverage must be
full before automatic acknowledgement is eligible. Partial/unknown content can
be listened to but remains visibly ineligible for automatic mark-read.

Pause, Stop, Skip item, Remove, seek-to-end, extraction failure, synthesis or
decode failure, producer exception/early exhaustion, timeout, stale events, and
crash do not certify unheard ranges. Seeking backwards and replaying is allowed;
seeking forwards leaves a gap that must later be heard. Approximate word timing
alone is not completion evidence.

Persist completed revision and acknowledgement intent atomically before sending
any mark-read request. A durable intent may be retried after restart; a crash
without that intent must never create one. Retrying after a lost response sets
the same entry to read again, without toggling, duplicate queue advancement, or
replaying synthesis. Visible states distinguish “Listened”, “Mark-read pending”,
“Marked read”, and “Mark-read failed”.

**Falsifier:** a failed or incomplete item is marked read; an arbitrary progress
message creates completion; a retry affects another connection/item; or a
crash window loses a committed acknowledgement intent.

### Control ordering, continuation, and speculative work

| Setting | Draft default | Behavior |
|---|---|---|
| Queue ordering | Oldest published first | Oldest/newest published first or manual order; deterministic source-identity tie-break; refresh never interrupts the current item |
| Continuous playback | Off | When enabled, natural local completion starts the next eligible item once; a playback failure pauses for Retry or Skip |
| Mark read on completion | Off | Opt-in creates acknowledgement intent only for eligible future completions; enabling is not retroactive; disabling cancels unsent intents |
| Prefetch budget | 10,000 characters | Integer 0–50,000 UTF-16 units of speculative spoken text outstanding; 0 disables speculative synthesis |

Prefetch applies only within the current explicitly started document. Continuous
play authorizes starting subsequent queued documents; it does not authorize
eager synthesis of the entire unread library. Reserve budget before a request,
include buffered and in-flight text, and release it on consumption or discard.
A chunk/block larger than the remaining budget waits for foreground demand.
Cache hits cause no synthesis charge. Pause/Stop/settings changes cancel or
invalidate speculative work; lowering a budget starts no new work until within
the limit. An already accepted remote request cannot be promised refundable.

Skip moves to another item without marking the skipped item completed/read.
Manual ordering affects pending items; refresh appends new entries in manual
mode and de-duplicates by source identity. A missing entry in a later unread
page is not proof of local completion and must not erase resumable work.

**Falsifier:** unstable ordering, double continuation, speculative requests over
budget, a zero-budget request, or a cached repeat triggers duplicate synthesis.

### Understand data flow and recover from faults

Before connection and first playback, and beside the prefetch setting, show a
note equivalent to:

> Proso retrieves article text from your configured Miniflux instance. Your
> Miniflux token is stored locally and sent only to that instance. Text leaves
> the browser for speech: cloud providers currently use the Proso API, which
> forwards it to the selected provider; a configured local synthesis host
> receives text at the address shown. Prefetch may send text and incur synthesis
> costs before you hear it. Mark-read sends the completed item's ID to Miniflux.

Display the actual source and synthesis destinations, including any enabled
provider fallback. A local host is not browser-local synthesis. Current managed
Free requests can return 402; queue access does not promise free managed speech
or reintroduce `speechSynthesis`. BYOK remains available (INV-002), existing
credit-period rules remain intact (INV-004), client-only playback is unmetered
(INV-005), and valid cache reuse does not charge again (INV-006).

Tokens are excluded from document snapshots, source refs, general settings
exports, content-script messages, errors, logs, and receipts. Untrusted HTML
cannot execute scripts or fetch images/trackers. Disconnect cancels source
requests, removes the local token and unsent acknowledgements, and provides a
clear-local-queue action. Revoking an already transmitted request is not promised.

**Falsifier:** silent transmission to an undeclared host, active feed HTML,
secret disclosure, indefinite loading, or failed persistence reported as saved.

## Requirements

- **REQ-001:** Add `IReadingSource` with list/get/acknowledge operations,
  Miniflux HTTP and InMemory/NoOp adapters, typed `Result` errors, and a common
  contract suite for every adapter. Disabled NoOp performs no network activity
  and reports not-configured, never fabricated remote success.
- **REQ-002:** Authenticate with a vault-sourced token, scoped to the configured
  HTTPS connection and runtime host permission; no OAuth or automatic bridge.
- **REQ-003:** Validate external data and normalize it to the exact contracts
  above with reproducible revisions, block identities, and honest coverage.
- **REQ-004:** Add a persistent listening queue store behind a port with an
  InMemory fallback, schema versioning, atomic completion/intent writes, bounded
  retention, and fail-closed corruption/quota handling.
- **REQ-005:** Feed normalized blocks through `PlaybackService`, its existing
  prefetch service and audio cache. Add tab-independent progress/completion
  observation while preserving existing page callers and highlighting.
- **REQ-006:** Save revision/source-offset checkpoints during playback, at least
  every five seconds and on pause, stop, item transition, and natural completion;
  restore safely without relying on shutdown/unload events.
- **REQ-007:** Derive completion only from actual successful playback coverage;
  bind events to the active source, revision, session, and generation.
- **REQ-008:** Deliver persisted acknowledgement intents with idempotent remote
  set-read semantics and bounded retries. No intent means no acknowledgement.
- **REQ-009:** Persist and validate all four settings above, including their
  interaction with pending work, restart, and current-item ownership.
- **REQ-010:** Expose accessible list, Play/Resume, Pause, Stop, Skip, Reorder,
  Retry, Remove, connection, and settings controls with visible state changes.
- **REQ-011:** Show the data-flow/privacy note and actual destinations; isolate
  source credentials from TTS credentials and all page contexts.
- **REQ-012:** Preserve legacy URL-queue data/messages and existing verification
  commands. New deterministic tests need no live Miniflux, vault, or provider.
- **REQ-013:** A future server bridge is optional and separately scoped. Every
  connection and list/get/acknowledge operation must bind to the authenticated
  user; a client-supplied connection ID or URL is never authorization. Enforce
  ownership on credentials, caches, jobs, and retries; no shared global token.

## Non-goals

- OAuth, a new hosted source service, native vault integration, multi-device
  checkpoint synchronization, and operation while Firefox is closed.
- Publisher crawling, fetching full articles behind login, enclosure/podcast
  playback, automatic mark-read for partial content, or bulk mark-all-read.
- A second TTS engine/cache, new provider entitlements, and replacement of the
  legacy URL queue or its paragraph-based public message contracts.

## Acceptance criteria

1. A loaded Firefox extension imports two synthetic unread items and plays them
   through public controls with no article/Miniflux tabs or content scripts.
2. Unit, adapter-contract, and integration traces prove REQ-001–009 and REQ-012,
   including duplicate IDs across connections, changed revisions, seek gaps,
   failed synthesis, truncated chunk streams, and every acknowledgement crash
   window (before commit, before send, response lost, after remote success).
3. The public actor changes every setting, uses keyboard playback/reordering,
   closes/reopens the popup, restarts Firefox, resumes, and observes honest
   completion/acknowledgement/privacy states. Both themes remain readable.
4. Sanitized fixture records prove allowed destinations, zero source-token
   leakage to TTS, no acknowledgement on failure, bounded prefetch/retries, and
   cache accounting invariants. No production credentials or credits are used.
5. A seeded state campaign and bounded restart/soak retain a replay command and
   the first anomaly. Missing prerequisites or any failed falsifier is BLOCKED
   or FAIL, never skipped-green. Feature 095's single-receipt requirements apply.
6. Implementation passes unchanged `make verify`, the applicable public user
   gate, and the required different-family review. The constitution issue in
   [plan.md](plan.md) is resolved before enabling the new data flow. This draft
   itself is not evidence that any of these acceptance criteria have passed.
