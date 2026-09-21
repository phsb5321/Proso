# Queue envelope — normative annex v1

Governs REQ-004 persistence, REQ-006 recovery, REQ-007 completion, REQ-008
acknowledgement and REQ-009 scheduling. It extends none of the four public
document contracts. Times are Unix epoch milliseconds; audio time is decoded
media milliseconds before playback-rate adjustment.

## Records and invariants

| Persisted field/group | Required invariant |
|---|---|
| `schemaVersion`, `minReaderVersion`, `commitSequence` | Initially 1, 1, 0; sequence increments once per successful transaction; safe nonnegative integers, overflow blocks writes |
| `settings`, `order`, `activeOwner`, `connectionEpochs` | Four validated settings; source-tuple keys unique; one active page/queue owner; disconnect/reconnect changes epoch so old work cannot use replacement credentials |
| Each item: `source`, `snapshot`, `normalizationVersion`, `createdAt`, `expiresAt` | Snapshot digest validates under document-identity v1; identity cannot be reassigned by a refresh; expiry does not slide on reads |
| `checkpoint`, `audioBinding`, `expansionVersion`, `spokenPlanKey` | Validated together under document-identity v1; checkpoint has no independent store or write path |
| `sessionId`, `generation`, `requiredRanges`, `heardRanges`, `producerManifest` | Fresh random 128-bit session per coordinator start; monotonic generation per start/seek/stop/owner replacement; ranges and manifest belong to source/revision/plan |
| `listeningState`, `completedRevision`, `completionId`, `advanceConsumed` | States queued/paused/playing/changed/failed/listened; persisted playing always restores paused; completionId unique per eligible completion; automatic advance consumes it once |
| `ackIntent` | Optional immutable source/connection epoch/revision/completionId plus lifecycle fields below; no token, article text or mutable “current item” pointer |
| `deletionTombstones`, `migration` | Restartable purge/migration state; no outgoing work from a tombstoned, incompatible or quarantined record |

Required ranges are half-open UTF-16 source intervals for every nonempty spoken
unit, excluding only normalization whitespace that yields no speech. Heard
ranges are sorted, merged, nonoverlapping subsets. Each addition requires a
successful natural end proof for an expected segment; bind proof to source,
revision, plan key, session, generation, unit/segment ID and audio digest. A
segment interrupted by seek/stop/error certifies no new interval. Approximate
timing may place a checkpoint but cannot fabricate a heard range. Across a
restart, retain committed proofs, never accept events from the old session.

The producer manifest fixes all expected synthesis units and bounded playback
segments before terminal success. Completion requires every required interval,
all expected segment ends, normal producer termination, no unresolved fault,
and full extraction coverage of the pinned snapshot. Refresh cannot upgrade
partial coverage into completion without revalidating that evidence. At most
10,000 blocks, 100,000 source ranges/manifest entries per item; exceeding either
fails with LIMIT, never truncates into successful completion.

## One transaction, one completion authority

Use one extension-owned **IndexedDB transactional database**, with the existing
Dexie dependency where useful. A transaction owns queue settings, checkpoints,
audio bindings, heard evidence, completion, intent/retry state, owner/generation,
order and commitSequence. No parallel `browser.storage.local` checkpoint store.
Credentials remain in extension-local credential storage; cached audio stays
in the existing cache and is addressed by immutable content digest.

Write audio bytes before publishing their binding. A cache miss/orphan after
crash is safe: ignore the hint, never infer completion from cache presence. The
completion transaction commits final checkpoint + proofs + completedRevision +
completionId + optional pending intent together. Send or auto-advance only after
transaction completion, never after an individual put resolves. Abort means
the entire previous state remains. One writer serializes transitions and checks
the expected commitSequence/session/generation/connection epoch in-transaction.

Require strict durability where supported and verify the chosen Firefox
transaction path in the crash tests; unsupported durable commit semantics block
this adapter rather than silently using relaxed writes. See the
[transaction durability API](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction).
The acceptance guarantee covers process/browser crashes, not damaged storage
hardware. InMemory has the same all-or-nothing fault-injection contract but is
test-only for resumability; do not silently fall back to it after storage failure.

## Checkpoint cadence and replay bound

Commit after at most **5,000 ms of actually rendered audio time** since the last
durable checkpoint, and before pause/stop/seek/owner change/item transition or
completion reports “saved”. Await durable completion before advancing past each
cadence boundary or starting the next segment. If persistence stalls, pause
audio at that boundary; after 5,000 ms wall time show PERSISTENCE_FAILED. Neither
unload nor a best-effort timer can be the persistence authority.

Each playback/recovery segment is at most **10,000 ms decoded media duration**.
Split longer decoded audio locally at sample boundaries into immutable slices;
do not resynthesize to meet this limit. The manifest and stored artifact permit
replay from a slice start even without word timings. If an adapter cannot expose
or slice duration safely, SEGMENT_LIMIT blocks that item. A long expansion may
span slices but earns its source interval only when all slices finish.

For an unchanged revision/plan and available compatible artifact, crash replay
is **5 s + one bounded segment (10 s), at most 15 s of audio**. Rate changes do
not change coverage eligibility: at 0.5× this is at most 30 s wall time, at 2×
7.5 s. Support queue playback rates 0.5×–2×; no zero/negative rate. Silence
skipping is disabled for this feature; seek-based skipping leaves unheard gaps.
Changed plans, invalid/corrupt checkpoints or missing/replaced audio use source
recovery and may replay more; label that case “Audio changed or unavailable —
replaying from a safe source position” and do not claim the 15 s guarantee.
Never skip unheard content to satisfy a numerical bound.

## Acknowledgement intent lifecycle

Persist `intentId`, source tuple, connection epoch, completed revision,
completionId, `state`, `attemptCount`, `retryCycle`, `nextAttemptAt`, `lastError`,
`createdAt`, `expiresAt` and last transmitted attempt ID. One intent per
completionId. States: pending, sending, retry-wait, sent, held, exhausted,
cancelled. UI labels map pending/sending/retry-wait to “Mark-read pending”, sent
to “Marked read”, held/exhausted to “Mark-read failed”; local “Listened” remains
independent of delivery.

1. Only the durable eligible completion transaction creates pending. Enabling
   mark-read never scans old completions. Disabling cancels unsent intents.
2. Before every attempt revalidate enabled setting, nonexpired intent,
   connection epoch and current source revision using get. A mismatch is held;
   failure never causes a speculative write. Recheck local validity immediately
   before dispatch, since settings may change during get.
3. Persist sending and increment attemptCount **before** any get/set-read HTTP.
   There are at most **3 attempts total per retry cycle across restarts**, each
   with a 15 s deadline for validation plus delivery. No startup reset of count.
4. Timeout/network/429/5xx retries wait 1 s then 2 s; Retry-After may increase
   either wait to at most 60 s. A longer or invalid Retry-After enters held with
   Retry mark-read available (valid longer delays show a not-before time).
   401/403, missing item, malformed response, changed content or permission loss
   enter held immediately; display the specific recovery from the error table.
5. A 204 commits sent. A crash in sending consumes that attempt and recovers
   as retry-wait or exhausted when count is 3. Lost-response retries repeat only
   the same one-item set-read, never synthesis or queue advancement.
6. At 3 failed attempts enter exhausted; no polling, restart retry or timer may
   open another cycle. **Retry mark-read** is a public, keyboard-operable manual
   resend control. After resolving auth/permission/changed-content requirements,
   it increments retryCycle, resets count to 0 and commits pending. Changed
   content needs a new listened completion, not a resend of obsolete evidence.
   Manual action must also honor a server not-before time.
7. Disable, Remove, clear or Disconnect cancels/tombstones unsent work. An
   already transmitted request may have succeeded; report that uncertainty,
   never send an inverse unread operation. Expiry deletes the intent and shows
   “Mark-read expired — listen again”; manual resend cannot resurrect it.

Set-read is an **idempotent status re-assertion**, never a toggle. Remote changes
can race revision validation; no exactly-once or remote revision-CAS guarantee
is made. Local continuous advance consumes completionId once in a transaction
that changes activeOwner. Crash after that transaction restores the selected
next item paused, without repeating the advancement or auto-playing it.

## Prefetch accounting and stable cache units

The budget is **global to this extension's listening coordinator**, shared
across all connections/documents and old/new item overlap during continuous
play. It counts outstanding in-flight + buffered speculative expanded spoken
text in UTF-16 units, including punctuation/spaces, excluding markup, source
text that was expanded away and metadata. Foreground demand for exactly the
current synthesis unit is excluded; future units cannot be relabelled foreground.

Before dispatch, build the spoken plan and true-up any estimate to the exact
expanded length atomically with reserving budget. Expansion growth without room
waits; shrinkage releases the difference. No request uses a stale estimate.
Release on consumption means **handoff to the sole playback owner**, not end of
audibility. Buffered/in-flight work otherwise retains its reservation until
discarded; cancelled in-flight requests remain charged to the outstanding budget
until settlement/deadline (60 s maximum). Do not recycle their reservation early.
An old item's reservations therefore constrain the next item, including late
responses; invalidate/discard those responses before release.

Planning uses canonical synthesis units fixed by source/revision, spoken-plan
key and explicit segmentation-policy version/provider limits. Budget changes
may only admit or defer whole units; they cannot split or merge text. Keys
include source namespace, revision, plan/spoken-content digest, canonical unit
range, provider/model/voice and synthesis options; they exclude budget, session,
playback-slice boundaries and speculative scheduling. Cache lookup and in-flight
coalescing happen before dispatch; an existing unit artifact supplies any local
playback slices without new synthesis. Preserve the existing cache port/page
keys; do not preserve chunked queue paths that bypass this invariant.

Zero budget disables speculation but permits foreground playback. Lowering a
budget cancels excess work and admits nothing until retained reservations fit.
Continuous play admits the next item's work only after committed local
completion changes the active owner. No unread-library prefetch. The budget is
an outstanding-work limit, **not a cumulative cost cap**: a long session can
synthesize more than 50,000 units in total. No session cap is included; disclose
that beside the setting. Cache hits cost no new synthesis reservation/charge.

## Schema migration, downgrade and capacity

Database name is `proso-listening-queue`; initial schema/envelope version is 1.
No pre-v1 listening envelope is shipped by this draft.

This annex itself evolves additively within v1: new optional fields and new enum
members may be added without a version bump, because an older reader ignores
them under the version check above. Any change to an existing field's semantics,
to a required invariant, or to the transaction boundary is breaking: it takes a
new annex version and the same migration, downgrade and fixture rules as the
store it governs. Missing database creates
empty disabled defaults. Legacy `queue:*` is a separate feature, never a v0
source for conversion. Newer versions must ship pure consecutive N→N+1
transforms, schemas, fixture input/output pairs and failure/restart tests.

Open gates validate version before any playback or acknowledgement. Use one
IndexedDB versionchange transaction for a migration's transformed records,
settings and version marker; failure/termination rolls the transaction back.
Retain one previous validated snapshot in a migration-backup store, within the
same database and purge scope, until successful startup validation (maximum
24 hours while running). Reserve space for both versions first. Re-running an
already committed migration is a no-op; migration never upgrades completion
evidence, invents revisions or schedules remote writes.

Unknown future version/minReaderVersion, checksum corruption, failed migration
or an older binary opening a newer database enters read-only blocked mode.
Preserve bytes, disable queue mutation/playback/ack, show “Queue needs a newer
version” or “Queue data could not be restored”; offer compatible upgrade or
explicit Clear local queue. Never overwrite with defaults or automatically
downgrade. Legacy URL queue remains usable. No generic down migration promised.

Limits: 100 entries, 1 MiB UTF-8 normalized text per item, 5 MiB serialized
envelope data, 10 MiB including one migration backup, 256 MiB queue-owned audio.
Validate size before committing; quota/limit failure stops import/synthesis and
shows recovery. LRU eviction of disposable queue audio may invalidate a resume
hint but never source progress; surface the replay-bound exception above.
Text, backup and audio expiry/purge rules are defined by REQ-011 in
[acceptance-and-privacy.md](acceptance-and-privacy.md). Never silently evict a
live checkpoint or pending intent for space; explicit clear or expiry is required.
