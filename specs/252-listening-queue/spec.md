# Feature 252 — Listening queue

**Status:** Revised draft addressing the independent BLOCK review; implementation,
acceptance evidence and a new different-family verdict are outstanding.
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

Normative annexes (all version 1): [document identity](document-identity.md),
[queue envelope](queue-envelope.md), and [acceptance/privacy](acceptance-and-privacy.md).
They specify the exact encoding, transaction and acceptance rules without adding
fields to these four contracts. [Review dispositions](review-response.md) map
every finding to its resolution.

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
  title, author, language, fetch time, read status, voice, and spoken-plan revision.
  Metadata-only differences do not change revision. The exact ordered preimage,
  encoding and golden vectors are defined in document-identity v1.
- `Block.id` is unique and stable for a given document revision, including
  repeated identical text; derive it from the revision and zero-based ordinal
  exactly as document-identity v1 specifies. Stability across revisions is not
  promised. `kind` initially covers paragraph, heading, and list;
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
  matching audio identity recorded in the queue envelope in the same transaction.
  Discard hints on mismatch; document-identity v1 defines end-of-block, malformed
  offset repair and expansion-version mismatch recovery.

Queue ordering, status, playback generation, heard ranges, audio identity,
completion evidence, and acknowledgement retry metadata live in a separate
versioned queue envelope governed by [queue-envelope.md](queue-envelope.md), v1.
They do not change these four contracts.

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
the last committed source position. For an unchanged revision/plan with compatible cached audio, replay is at most
**5 s + one bounded segment**, with segment duration at most 10 s: **15 s of
audio time**. Writes are awaited at each 5 s audio-time boundary. Missing or
changed audio/plan and repaired progress use the explicitly labelled conservative
source recovery in queue-envelope v1; the 15 s bound does not cover those cases.
No unheard content may be skipped to improve that bound.

If refreshed content has a different revision, keep the old snapshot/checkpoint
and show “Content changed — restart this item.” Restart adopts the new snapshot
at its beginning and clears old completion eligibility. Never apply the old
numeric offset to changed content. Voice or spoken-plan changes retain the
source position conservatively but invalidate incompatible audio-offset hints.
Changed expansion/lexicon plans also invalidate affected heard evidence under
document-identity v1. Prefetch budgets cannot change canonical synthesis units.

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

Persist the completed revision, final checkpoint, audio binding, heard evidence
and acknowledgement intent in **one IndexedDB transaction** before sending
any mark-read request; its completion is the sole durable commit boundary. A durable intent may be retried after restart; a crash
without that intent must never create one. Retrying after a lost response sets
the same entry to read again, without toggling, duplicate queue advancement, or
replaying synthesis. Visible states distinguish “Listened”, “Mark-read pending”,
“Marked read”, and “Mark-read failed”. The envelope fixes three attempts per
retry cycle across restarts, exhausted/held states and an explicit **Retry
mark-read** control. Set-read is an idempotent status re-assertion, never a toggle.

**Falsifier:** a failed or incomplete item is marked read; an arbitrary progress
message creates completion; a retry affects another connection/item; or a
crash window loses a committed acknowledgement intent.

### Control ordering, continuation, and speculative work

| Setting | Draft default | Behavior |
|---|---|---|
| Queue ordering | Oldest published first | Oldest/newest published first or manual order; deterministic source-identity tie-break; refresh never interrupts the current item |
| Continuous playback | Off | When enabled, natural local completion starts the next eligible item once; a playback failure pauses for Retry or Skip |
| Mark read on completion | Off | Opt-in creates acknowledgement intent only for eligible future completions; enabling is not retroactive; disabling cancels unsent intents |
| Prefetch budget | 10,000 UTF-16 units | Integer 0–50,000 UTF-16 units of expanded speculative spoken text outstanding globally; 0 disables speculative synthesis |

Prefetch applies only within the current explicitly started document. Continuous
play authorizes starting subsequent queued documents; it does not authorize
eager synthesis of the unread library. The budget is global across connections
and old/new item overlap. Count in-flight and buffered expanded spoken text,
excluding markup. True-up expansion length before dispatch; release at handoff
to playback or discard, retaining cancelled in-flight reservations until settled.
Canonical synthesis units and cache keys are independent of fluctuating budgets;
whole units wait for admission or foreground demand. Cache hits do not synthesize
again. Pause/Stop/settings changes cancel or invalidate speculative work, and
lowering the budget admits nothing until retained reservations fit. An accepted
remote request cannot be promised refundable. This limits outstanding work,
not cumulative session synthesis or cost; queue-envelope v1 fixes the rules.

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
exports, content-script messages, errors, logs, and receipts. Reject all redirects
before forwarding credentials; article bodies come only from the configured
instance, never publisher URLs. Proso source-text allowlist v1 over parse5 7.3.0
permits no network or executable DOM during parse/render. The privacy annex
specifies the exact mark-read payload, deletion matrix and retention limits.
Disconnect deletes the token and all connection queue data/audio/unsent intents;
Clear local queue deletes that data but keeps the token. Text/audio expire after
7 days, with deletion within 60 s while running or on next startup; no physical
erasure while Firefox is closed is promised. There is no remote telemetry;
local redacted diagnostics and English/pt-BR strings follow the annex. Revoking
an already transmitted request is not promised.

**Falsifier:** silent transmission to an undeclared host, active feed HTML,
secret disclosure, indefinite loading, or failed persistence reported as saved.

## Requirements

Each requirement owns the concern identified in the acceptance annex. Shared
invariants are defined once there or in the linked identity/envelope annex.

- **REQ-001:** Own the list/get/acknowledge port and list/get transport:
  `IReadingSource`, Miniflux HTTP,
  InMemory/NoOp adapters, typed Result errors and a shared contract suite.
  NoOp reports not-configured with zero network; wire limits/errors follow the
  consolidated taxonomy. Acknowledgement semantics belong to REQ-008.
- **REQ-002:** Own vault-token credentials, runtime host permission and exact
  configured HTTPS destination confinement, including rejection of all redirects.
- **REQ-003:** Own boundary validation, parse5/allowlist normalization, exact
  revision/block derivation and honest coverage under document-identity v1.
- **REQ-004:** Own the versioned queue store, migration/downgrade and capacity.
  Checkpoint, audio binding, heard evidence, completion and intent/retry metadata
  share **one IndexedDB transaction**, whose completion is awaited; there is no
  separate checkpoint store. Implement queue-envelope v1 and test-only InMemory
  semantics; quota/corruption cannot turn into a volatile successful save.
- **REQ-005:** Own tab-independent reuse of PlaybackService, its cache and audio
  pipeline, preserving page callers/highlighting and stable queue cache units.
- **REQ-006:** Own source-position recovery and audio-hint validation. Commit
  checkpoints **in the REQ-004 transaction** at ≤5 s of rendered audio time and
  before transitions, awaiting durability before further playback. Segments are
  ≤10 s; apply the replay bound and exceptions in queue-envelope v1, without
  shutdown-event dependence or stale spoken-plan/audio-offset reuse.
- **REQ-007:** Own local completion eligibility: actual heard ranges, full
  coverage and successful producer/segment termination, with source/revision/
  plan/session/generation binding. A progress value never proves completion.
- **REQ-008:** Own creation and delivery of durable acknowledgement intents,
  exact one-item idempotent set-read, three-attempt cycles, restart recovery,
  exhausted/held states and manual Retry mark-read under queue-envelope v1.
- **REQ-009:** Own the four persisted settings, ordering/once-only continuation
  and global prefetch admission/overlap/expansion accounting. Use queue-envelope
  v1; budget changes cannot reshape cache units or imply a cumulative cost cap.
- **REQ-010:** Own accessible public controls and truthful error/state feedback.
  Meet every role/name/keyboard/focus/live-region/contrast criterion and control
  transition in acceptance-and-privacy v1, including manual acknowledgement retry.
- **REQ-011:** Own destination disclosure, clear/Disconnect and retention,
  no-telemetry/local diagnostics, and catalogued English/pt-BR strings as specified
  by the privacy annex; credential transport/security belongs to REQ-002.
- **REQ-012:** Own legacy URL-queue coexistence with **no migration**, separate
  user-visible sections, independent progress and saved owner handoff. Preserve
  data/messages/verification commands; deterministic tests use synthetic services.
- **REQ-013:** Own testable client isolation: bind every list/get/ack to a locally
  configured source tuple and connection epoch; reject substitutions and
  untrusted page/content senders; never expose credentials or raw acknowledgement
  authority. Send no reading-source traffic through a Proso server bridge.

**Separately scoped SERVER-252-001:** Any future source bridge must implement
server-authenticated ownership of connections, secrets, caches, jobs and retries,
plus cross-user/SSRF denial tests in its own feature. A client connection ID is
not server authorization. No bridge implementation is required by this feature.

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
2. **AC-2 — requirement coverage:** Every REQ-001–013 maps to and passes its
   named check in [acceptance-and-privacy.md](acceptance-and-privacy.md), using
   unit, adapter-contract, integration and public UI traces. Include duplicate
   IDs across connections, golden vectors, migration/downgrade, seek gaps,
   truncated streams, privacy/accessibility and all acknowledgement crash windows.
   SERVER-252-001 alone is explicitly de-scoped.
3. The public actor changes every setting, uses keyboard playback/reordering,
   closes/reopens the popup, restarts Firefox, resumes, and observes honest
   completion/acknowledgement/privacy states. Both themes remain readable.
4. Sanitized fixture records prove allowed destinations, zero source-token
   leakage to TTS, no acknowledgement on failure, bounded prefetch/retries, and
   cache accounting invariants. No production credentials or credits are used.
5. Seed 252001 with 2,000 model traces of at most 100 commands, plus a
   30-minute soak/20 restart cycles, retains a replay command and first anomaly.
   Missing prerequisites or any failed falsifier is BLOCKED
   or FAIL, never skipped-green. Feature 095's single-receipt requirements apply.
6. Implementation passes unchanged `make verify`, the applicable public user
   gate, and the required different-family review. The constitution issue in
   [plan.md](plan.md) is resolved **before enabling live source traffic**, as
   defined in the acceptance annex: production real-adapter paths, including
   probes/retries, remain hard-disabled until the governance decision lands.
   Offline scaffolding, UI previews and isolated synthetic-fixture implementation
   may precede it. This draft is not evidence that any acceptance check passed.
