# Acceptance, errors and privacy — normative annex v1

## Requirement ownership and named checks

Each concern has one owning requirement; other requirements reference its
rules rather than redefining them. The named checks below are **future checks**,
not receipts. AC-2 requires all rows, including UI/privacy/client isolation.

| Owner | Sole concern | Named acceptance check and falsifier | Tasks |
|---|---|---|---|
| REQ-001 | Source port/adapters and list/get transport | `source-adapter-contract`: HTTP/InMemory/NoOp share validation and errors; NoOp sends nothing; list/get never mutate status | T005, T008 |
| REQ-002 | Credentials, host permission and redirect confinement | `source-destination-isolation`: denied/disabled makes zero requests; second origin sees no token under every redirect class | T013, T036 |
| REQ-003 | Normalization, revision, IDs, sanitization, coverage | `document-golden-vectors`: literal hashes/IDs match; malicious HTML causes no network or execution; unsupported content cannot be full | T004, T006, T007, T032, T036 |
| REQ-004 | Envelope atomicity, schema migration, size/quota recovery | `queue-store-crash-migration`: abort at each put/commit/version step yields whole old/new state; downgrade preserves bytes; quota never reports saved | T010–012, T033, T034 |
| REQ-005 | Existing playback/cache reuse and page compatibility | `tabless-playback-cache`: no article tab; one player/cache; repeated canonical unit avoids synthesis across budget changes; original page journey passes | T015, T016, T019, T024 |
| REQ-006 | Source checkpoint/hint validity, cadence, replay | `resume-audio-time-bound`: restart at 0.5×/1×/2×, surrogate repair, changed plans/bytes and stalled writes; compatible replay ≤15 s media | T007, T018, T032, T033 |
| REQ-007 | Heard coverage, terminal evidence, completion eligibility | `heard-range-completion`: seek gaps, stale sessions, interrupted expansion, missing chunk or non-full coverage create zero eligible completions | T017, T021, T028, T033 |
| REQ-008 | Intent creation/delivery/retry lifecycle and set-read effect | `ack-crash-resend`: every crash window, 3 attempts across restarts, held/exhausted/manual resend, exact payload, no toggle/double advance | T009, T021, T022, T035 |
| REQ-009 | Four settings, order/continuation, global prefetch admission | `settings-overlap-budget`: all settings round-trip; expansion true-up, A→B overlap, cancelled requests, zero/lowered/fluctuating budgets satisfy annex | T014, T020, T023, T035 |
| REQ-010 | Public controls, accessibility and error presentation | `queue-public-accessibility`: each control/transition below passes keyboard, role/name/state, focus, live-region, contrast and error assertions in both themes | T025–027, T037 |
| REQ-011 | Disclosure, removal/retention, telemetry and i18n | `privacy-retention-strings`: displayed destinations match fixture records; exact deletion matrix survives interrupted purge; expiry and local-only diagnostics hold; strings externalized | T026, T036, T037 |
| REQ-012 | Legacy URL queue coexistence and offline test compatibility | `legacy-queue-coexistence`: data/messages unchanged, no import/migration or ack authority, owner switch saves/pauses; deterministic tests need no live service | T012, T024, T025, T034 |
| REQ-013 | Client source binding and message authorization | `client-connection-binding`: unknown/substituted tuple/epoch and content-script raw ack/credential requests rejected; no source bridge request reaches Proso API | T008, T025, T038 |

`SERVER-252-001` is explicitly **out of scope**: a later source bridge must bind
every connection, credential, cache, job and retry to the server-authenticated
user, deny cross-user access before secret resolution, reject arbitrary proxy
URLs/SSRF, and have a `bridge-cross-user-denial` acceptance suite in its own spec.
No server implementation or deployment is needed to pass Feature 252. Client
connection IDs alone are routing keys, never server authorization.

AC-1/AC-3/AC-4 execute the relevant named checks through a loaded Firefox
extension with synthetic HTTPS source/TTS endpoints. AC-5 runs seed **252001**,
**2,000 model traces × 100 commands maximum**, and a **30-minute soak with 20
restart cycles**; replay each first anomaly twice. Receipt includes actual
seed/count, exact build/HEAD, commands, assertions, artifacts and failures per
Feature 095. Missing tools or public selectors are BLOCKED. AC-6 retains the
existing verify/user/different-family gates without changing their semantics.

## Public controls and transitions (REQ-010)

Use native controls where possible. Every enabled control is reachable with
Tab/Shift+Tab in visual order, has visible focus and a nonempty accessible name
matching its visible label; buttons activate once with Enter or Space. Disabled
controls expose native disabled/aria-disabled and cannot dispatch work. Never
rely only on color. Assert 4.5:1 normal-text contrast and 3:1 control/focus contrast
in both themes, no clipping at 200% text zoom, and zero jest-axe violations.

| Control(s) / public name | Role, value and testable action/state |
|---|---|
| Miniflux address, API token, Connect, Disconnect, Refresh | Labelled URL/password inputs and buttons; token remains masked; invalid fields expose aria-invalid + associated explanation; loading sets aria-busy and blocks duplicate submit; denial/auth/empty are distinct |
| Listening queue, item title/source/coverage | Named list with listitems; each item exposes its title, full/partial/unknown text and listening/ack status; active item exposes aria-current; empty state says “No unread items” |
| Play / Resume, Pause, Stop | Named buttons; Play/Resume becomes Pause while playing, disabled during commit/start; Pause/Stop produce paused state only after durable save; reopening restores the correct names/states |
| Skip, Remove | Named buttons containing item title in accessible name; Skip creates no completion; Remove stops current owner before deleting; focus goes to next item, previous item if last, or Refresh if empty |
| Move up / Move down | Named buttons containing title; disabled at boundaries; keyboard action updates DOM/list order and announces position (for example “2 of 4”); focus stays on that item's move control |
| Retry playback, Restart this item, Retry saving | Distinct named buttons shown only for matching faults; no ambiguous generic Retry for both speech and acknowledgement; retry does not silently clear evidence |
| Retry mark-read | Named button in held/exhausted state, disabled with visible reason until reconnect/not-before/new completion conditions permit; announces new pending cycle; never restarts speech |
| Queue ordering, Continuous playback, Mark read on completion, Prefetch budget | Labelled select, two checkboxes and integer number input (min 0, max 50000, step 1); value/checked state mirrors committed settings; rejected save reverts and announces failure |
| Clear local queue | Named button; confirmation dialog names affected connection and removed data, initially focuses Cancel; Escape cancels and returns focus; clear success announced only after purge completes |

Within 100 ms of handling any action, expose busy/working feedback. Async
success/failure replaces it within the operation deadline; no indefinite
spinner. Noncritical loading/paused/playing/saved/listened/pending/read/reordered
changes use one `role=status` polite live region. Errors use `role=alert` once
per new error, include recovery control, and retain focused control. Do not
announce every timer tick. Tests assert text + role + focus for every state:
disconnected, permission-needed, loading, empty, queued, playing, paused,
resumable, changed-content, playback-failed, persistence-failed, listened,
mark-read-pending, marked-read, mark-read-failed, incompatible-schema, clearing.

## Consolidated error taxonomy

Codes are stable Result discriminants; messages are localized, redacted and
never echo raw response bodies/headers. Preserve last durable state on error.
No error is proof of completion. “Retry” below means the operation-specific
public control above, never an unbounded background loop.

| Code | Operation → visible state | Recovery |
|---|---|---|
| NOT_CONFIGURED / GOVERNANCE_DISABLED | source → disconnected/unavailable | Configure after governance gate permits; no traffic |
| PERMISSION_DENIED | list/get/ack → permission-needed; ack held | Explicit Grant access/Connect, then operation-specific retry |
| UNAUTHORIZED | list/get → connection error; ack held | Replace token/reconnect; no automatic auth retry |
| SOURCE_BINDING / REDIRECT_REJECTED | any source call → connection error; ack held | Correct configured address; never follow redirect |
| NOT_FOUND | get/ack → item unavailable; ack held | Refresh or Remove; never infer read/completion |
| INVALID_RESPONSE / UNREADABLE | list/get → load failed; ack → held | Retry or remove item; repair source; no partial success |
| NETWORK / TIMEOUT / RATE_LIMIT / SOURCE_UNAVAILABLE | list/get → load failed; ack → retry-wait/exhausted | Explicit list/get retry; ack's 3-attempt policy only; show not-before |
| ABORTED | any cancelled request → prior paused/idle state | No alert for intentional cancellation; stale result ignored |
| CONTENT_CHANGED | refresh/resume/ack → changed; ack held | Restart with new snapshot and listen again |
| TTS_ENTITLEMENT / TTS_AUTH | speech (including 402) → playback-failed | Configure provider/entitlement then Retry playback |
| TTS_FAILED / DECODE_FAILED / PRODUCER_INCOMPLETE / SEGMENT_LIMIT | speech → playback-failed | Retry playback or Skip; no terminal proof for failed segment |
| STALE_EVENT | playback callback → no state change | Ignore and count in local diagnostics; never certify progress |
| CHECKPOINT_REPAIRED / AUDIO_INCOMPATIBLE | resume → paused with replay notice | Resume from conservative source position under identity annex |
| QUOTA / LIMIT | import/store/audio → storage-full/limit notice | Clear selected data or reduce imported items; retain committed progress |
| PERSISTENCE_FAILED | any commit → persistence-failed/paused; outgoing ack blocked | Retry saving; no “saved”, send or auto-advance until committed |
| CORRUPT / SCHEMA_TOO_NEW / MIGRATION_FAILED | storage open → restore blocked | Compatible upgrade or explicit Clear local queue; preserve bytes |
| ACK_EXHAUSTED / ACK_EXPIRED | acknowledgement → mark-read-failed | Retry mark-read for exhausted; expired requires new listening |
| PURGE_FAILED | clear/disconnect → clearing failed, connection disabled | Retry clear; resume deletion tombstone on startup |

List/get have one 15 s attempt per explicit action, pages of at most 50 entries,
at most 2 pages per refresh (100-entry queue cap); a body response is at most
2 MiB UTF-8, a list page at most 4 MiB. Truncation/overflow is LIMIT, not full
coverage. Synthesis has a 60 s request/first-audio deadline; each streaming gap
has a 15 s deadline and a unit a 60 s total deadline. Storage waits are 5 s;
purges report failure after 15 s and remain blocked until retried. Bounds on
audio, retries, queue bytes and prefetch are owned by queue-envelope v1.

## Network and sanitization boundaries

REQ-002 permits `X-Auth-Token` only on requests constructed from the configured
HTTPS origin (scheme, hostname **and port**) and configured base path. Validate
before attaching the header. Use `redirect: error` and `credentials: omit`;
reject **every** 3xx, including same-origin redirects. Never follow Location,
forward credentials to any redirect target, or treat a post-redirect URL check
as sufficient. Changed host/base path requires a new connection/permission.
Userinfo, fragments and token query parameters are forbidden in configuration.

Fetch articles exclusively via the configured instance's list/get endpoints;
never fetch canonicalUrl, feed/publisher URLs, images, favicons, enclosures or
the Miniflux “fetch original article” endpoint. Remote article links remain
display metadata. The only acknowledgement body is JSON with exactly
`entry_ids: [validatedSafeIntegerItemId]` and `status: "read"`, sent to
`PUT <base>/v1/entries`; expect 204. No URL, text, title, progress, ranges,
revision, token, user ID or telemetry fields belong in that body. Header token
is separate. This is the existing [Miniflux status API](https://miniflux.app/docs/api.html),
used as an idempotent re-assertion, never its bookmark toggle or mark-all APIs.

REQ-003's named sanitizer is **Proso source-text allowlist v1 over parse5 7.3.0**.
[parse5](https://parse5.js.org/) parses to a data-only AST; do not send untrusted
HTML through DOMParser, innerHTML, a browsing document, jsdom resource loading,
or any parse hook that can execute scripts or perform network I/O. Promote the
already lockfile-resolved parse5 to a declared extension runtime dependency
during implementation; the existing DOM extractor alone does not establish
this boundary. This draft changes no dependency files.

Allowed structural elements: p, h1–h6, ul, ol, li, br, div, section, article,
blockquote. Allowed inline text carriers: span, a, em, strong, b, i, u, s, small,
sub, sup, code. Drop every attribute (including href/src/style/events); anchors
are optional and absent in v1. Emit paragraphs, headings and list-item blocks
in traversal order; div/section/article/blockquote are grouping containers and
bare inline runs become paragraphs. A heading's level is not separately encoded
in v1. Preserve nested lists by parent ordinal, without duplicate text.
Drop script/style/template/iframe/object/embed/svg/math and resource/form
elements with their subtrees; never reconstruct executable markup. Unknown
elements may contribute recursively extracted plain text, but produce partial
coverage with an unsupported-structure reason. Omitted meaningful text/media,
including image alt text, requires a coverage reason; do not silently claim full.
Render only strings through textContent. Synthetic hostile fixtures must show
zero subresource requests during parsing, normalization and UI rendering.

## Deletion, retention, diagnostics and strings (REQ-011)

| Action, selected connection scope | Token | Unsent intents | Snapshots/text, checkpoint, heard ranges, plan/audio bindings | Queue-owned cached audio |
|---|---|---|---|---|
| Disconnect | Delete | Cancel then delete | Delete, including order, completion history and migration backups | Delete |
| Clear local queue | Keep, so Refresh can import again | Cancel then delete | Delete, including order, completion history and migration backups | Delete |
| Remove item | Keep | Cancel/delete only for this item | Delete only this item and its backup copy | Delete this item's artifacts |

Both connection-wide actions cancel playback/source/synthesis work, revoke
session/generation, and persist a deletion tombstone **before** async cleanup.
Disconnect disables the connection immediately and deletes its credential
before reporting success; if any deletion fails report PURGE_FAILED, keep the
tombstone, and block all work for that connection. Startup processes tombstones
before opening the queue or scheduling traffic. Late results cannot recreate
deleted records. A clear does not erase the source address, nonsecret settings,
other connections or legacy URL-queue data. Audio uses a queue-owned namespace
even when the same cache port is shared; no legacy/shared audio is deleted.
Already transmitted remote writes/charges and remote caches cannot be undone
by these local actions; state that beside confirmation. No remote erase promise.

Text/snapshots, checkpoint/heard evidence, intents and queue audio have a maximum
**7-day logical lifetime from first import**, with an immutable expiresAt.
New audio for an old item inherits its expiry; access/restart never extends it.
At expiry stop the item, cancel unsent intents and purge all copies, including
backups. While running, purge at least every 60 s and before any read/play/send;
on startup purge before exposing data. A migration backup also has the shorter
24-hour maximum in queue-envelope v1. Show the expiry in item details and warn
that expired progress/unsent mark-read work is removed, with explicit reimport
available. An expired item cannot be resumed or manually resent.

**Physical-retention limitation:** while Firefox/the machine is closed or
suspended, extension code cannot delete files. Expired bytes can remain at rest
until the first successful startup purge; filesystem/browser backups are also
outside this feature. A strict wall-clock disk-erasure guarantee is rejected
because it would require an external process/host integration outside scope.
The product copy must state “Expires after 7 days; deleted within one minute
while Firefox runs, or when Firefox next starts.” Do not advertise
an unconditional physical 7-day retention promise. Credentials persist until
Disconnect; token replacement deletes the previous token. Cleanup errors remain
visible and block access rather than extending usable retention.

No remote telemetry, analytics or behavioral tracking. Optional local diagnostics
contain only error codes, operation names, counters, durations and build/schema
versions: no tokens, bodies, spoken text, URLs, titles or stable source IDs.
Keep at most 1 MiB/24 hours with the same startup purge rule; export only by an
explicit local Save diagnostics action, with no upload button/automatic sender.

All new user-visible strings, error text, accessible names and plural forms
use one keyed message catalog, English defaults and pt-BR translations. No
concatenated translated sentences or server-supplied raw messages. Tests check
key parity, placeholder parity, accessible-name updates and number formatting
in both locales. This does not require translating unrelated legacy UI.

## Legacy coexistence (REQ-012)

Show separate “URL queue” and “Miniflux listening queue” sections. No migration,
automatic conversion, merging or cross-queue continuous play. Existing URL
entries retain paragraph progress and legacy messages; their Next/completed
events have zero Miniflux acknowledgement authority. A reader must explicitly
choose an item in the other queue; changing owners durably pauses/saves the
current listening session before starting the other. A URL already present in
both sections may appear twice, with independent progress. Explain this in the
Miniflux section; Remove/clear in either queue never removes the other.

## Governance threshold (AC-6)

The threshold is **before enabling live source traffic**, not before all
implementation. Enabling means any reachable production-build path that can
authenticate, list, get or acknowledge against a real configured Miniflux
instance, including credential validation probes and background retries.
A default-off user-toggle alone is insufficient: until a ratified amendment or
explicit reviewed exception lands, the production composition must hard-disable
the real adapter and reject connection attempts with GOVERNANCE_DISABLED.

Before that decision, specs, pure contracts/normalizers, InMemory/NoOp stores,
transaction/migration logic, cache/playback seams, UI previews and real-adapter
code behind an unoverrideable production gate may land. Only synthetic fixture
traffic in isolated test builds is permitted; no real credential import,
permission probe or live transmission. Record the governing amendment/exception
commit before removing the gate. A separate governance change must handle its
impact report/version/propagation; this spec does not ratify itself.
