# Response to independent BLOCK review

This is a specification revision, not a new independent verdict or runtime
acceptance receipt. All edits are confined to `specs/252-listening-queue/`.
The four public contracts remain verbatim. No code is implemented, no governance
amendment is ratified and no push is authorized.

Annex shorthand below: **Identity** = [document-identity.md](document-identity.md),
**Envelope** = [queue-envelope.md](queue-envelope.md), **Acceptance** =
[acceptance-and-privacy.md](acceptance-and-privacy.md), each normative v1.

| Finding | Disposition and concrete change |
|---|---|
| C-1 | Resolved: Identity fixes the ordered version/kind/text/parent-ordinal JSON preimage, UTF-8 encoding and SHA-256; six literal byte/hash vectors accompany it. |
| C-2 | Resolved: digest of tagged revision + ordinal gives distinct repeated blocks; stability is explicitly revision-local. Insert-resistant IDs are unnecessary because changed revisions require visible restart, not automatic remapping. |
| C-3 | Resolved: checkpoint and full audio-byte/plan/segment binding share one transaction; absent/mismatched audio discards the hint. |
| C-4 | Resolved: explicit expansion version and spokenPlanKey include locale/lexicon/mapping; mismatch rebuilds and invalidates affected heard evidence and unsent intent. |
| C-5 | Resolved: block end is its UTF-16 length; surrogate split rounds backward, invalid bounds restart the block, unknown identity quarantines; repairs cannot create completion. |
| C-6 | Resolved: metadata-only differences preserve revision; exact exclusions are enumerated. |
| H-1 | Resolved: REQ-004/006 and plan mandate one IndexedDB transaction, awaited completion and no separate checkpoint store. |
| H-2 | Resolved: Envelope specifies schema, ranges/manifests, sessions/generations/epochs, terminal evidence and intent metadata/invariants. |
| H-3 | Resolved: awaited ≤5 s audio-time commits, ≤10 s playback segments, compatible replay ≤15 s; invalid/missing artifact exceptions are explicit rather than an unbounded “current segment”. |
| H-4 | Resolved: persisted pending/sending/retry-wait/sent/held/exhausted/cancelled lifecycle, three attempts across restarts, expiry and manual Retry mark-read. |
| H-5 | Resolved: 0.5×–2× rate preserves eligibility and media-time bound; wall-time examples supplied; silence skipping disabled and forward seek leaves gaps. |
| H-6 | Resolved: mark-read is idempotent status re-assertion, never a toggle or inverse unread operation. |
| P-1 | Resolved: budget is global across connections/documents; old item's unsettled reservations constrain next-item overlap. |
| P-2 | Resolved: consumption means handoff to the sole playback owner; exact expanded length is trued up before dispatch; cancelled requests retain reservations until settled. |
| P-3 | Resolved: canonical synthesis units/keys exclude budget and playback slices; changing admission cannot reshape units, bypass cache or duplicate in-flight synthesis. |
| P-4 | Resolved: table/default and all accounting use UTF-16 units of expanded text; markup/metadata excluded, spaces/punctuation included. |
| P-5 | Resolved: explicitly an outstanding-work budget, with no cumulative synthesis/cost cap; long-session intent is disclosed beside the setting. |
| R-1 | Resolved: Acceptance enumerates roles/names/values, keyboard actions, focus, disabled/busy states, live announcements, contrast/zoom and every transition. |
| R-2 | Resolved: AC-2 covers all REQ-001–013 through named checks and task mappings; SERVER-252-001 alone is explicitly outside scope. |
| R-3 | Resolved: REQ-013 is testable client source/epoch/sender isolation; future authenticated bridge ownership is separately scoped SERVER-252-001. |
| R-4 | Resolved: consolidated Result code → visible state → recovery table covers source, speech, acknowledgement, storage/migration and purge. |
| R-5 | Resolved: no legacy migration/conversion; separate sections and independent progress, explicit saved owner handoff and duplicate-URL consequence. |
| R-6 | Resolved: v1 initialization, consecutive transactional upgrades, fixtures, rollback/backup/expiry, read-only future-version handling and no automatic downgrade. |
| R-7 | Resolved: no remote telemetry; local diagnostics ≤1 MiB/24 h; keyed English/pt-BR strings and placeholder/accessibility checks. |
| R-8 | Resolved: requirement ownership table gives each concern one owner; spec/plan reference the annex invariants instead of redefining competing rules. |
| R-9 | Resolved: numeric limits cover segments, cadence, replay, rates, attempts/deadlines/backoff, pages/body/queue/audio/range sizes, retention, feedback, fuzz and soak. |
| S-1 | Resolved: exact configured origin/port/path, no cookies, redirect:error; reject every 3xx before any target forwarding, including same-origin redirects. |
| S-2 | Resolved: named parse5 7.3.0 data-AST + source-text allowlist v1, explicit tags/attribute removal/coverage, no network parse hooks or executable DOM; future direct dependency promotion is tasked. |
| S-3 | Resolved with explicit physical-retention limitation: exact Disconnect/clear/Remove matrix, tombstone crash recovery, 7-day expiry and ≤60 s running/startup purge. Reject an unconditional wall-clock disk-erasure promise while Firefox is closed: it requires an external process outside scope. |
| S-4 | Resolved: only entry_ids with one validated integer and status:"read" in the body; token is header-only, all other fields forbidden. |
| S-5 | Resolved: article list/get only at the configured instance; never fetch publisher/canonical URLs or trigger “fetch original article”. |
| G-1 | Resolved: one threshold, before live source traffic. Production real adapters/probes/retries remain hard-disabled until governing amendment/exception lands; enumerated offline/synthetic scaffolding may precede it. |

## Document validation and remaining gates

The revision checks preserve the four contract lines against starting commit
`42d81ec`, validate local links and all 32 finding IDs/13 requirement mappings,
recompute six golden vectors using Node's JSON.stringify/UTF-8/SHA-256
independently of their Python generation, and run `git diff --check`.
The vector check compares preimage bytes, revision and every block ID; changing
a vector's expected value must fail. These checks validate the documents/data,
not an implementation of the feature.

Future implementation is tracked by T032–T038 in [tasks.md](tasks.md), alongside
the existing backlog. Runtime, migration fault injection, public Firefox,
fuzz/soak, full verify and a fresh different-family review remain outstanding.
The supplied BLOCK verdict is not represented as cleared by self-review.
