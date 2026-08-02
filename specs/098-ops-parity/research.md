# Operational Parity Audit

**Audit receipt**: `OPS-PARITY-AUDITED` emitted 02/08/2026 before repository mutation.
**Baseline**: `origin/main@444a09e`
**Specialists**: Product `w2:p2`, Engineer `w2:p3`, Quality `w2:p4`
**Reference**: live DeliCasa operational controls, adapted for Proso's single pnpm monorepo.

## Gap Matrix

| Control | Class | Evidence | Falsifier / next boundary |
|---|---|---|---|
| Loaded-extension acceptance | present | `make user-gate` and Feature 095 fail closed on diagnostic-only Firefox dispatch. | Any shortcut, handler call, screenshot, build, or missing public role/name yields completion. |
| Exact-diff gate receipt | present | `change-bundle.sh`, `write-gate-receipt.sh`, and `validate-gate-receipt.sh` bind base/head/diff. | Change base, HEAD, or diff after receipt; validation must fail. |
| Gitleaks | present | `security-check.sh` scans commit range plus tracked/untracked files with full redaction. | A planted secret stays green. |
| OpenGrep anti-defanging | present | `opengrep-check.sh` asserts five exact planted findings before scanning changed code. | Fixture count drift or scan error stays green. |
| Coverage/duplication/dead code/dependencies | present | Make targets use changed-line coverage, jscpd, Knip, dependency-cruiser, and OSV ratchets. | A new changed-code violation or expired baseline stays green. |
| Local audio retention | present | `audio-cache-store.ts` bounds age, size, count, and exposes clear. | Expired bytes or a cleared entry survive cleanup/restart. |
| Clean server bootstrap | missing | `Makefile` builds only `@proso/server`; shared exports ignored `dist/**`; recursive filter selects both packages. | Fresh target passes with no manual shared build. This feature supplies that falsifier. |
| Telemetry governance | present-but-false-green | Constitution prohibits telemetry; runtime defaults it on and declares the remote host. | Fresh profile emits no telemetry request/ID/buffer under current governance. |
| Server cache isolation | present-but-false-green | Cache key omits requester identity and uses a small text hash; no bounded TTL is supplied. | Cross-user/collision probe misses and expiry is bounded. |
| Public privacy truth | present-but-false-green | Site promises browser TTS/zero collection; browser TTS was removed and remote telemetry/server routing exist. | Public copy matches shipped route, consent, provider, and retention behavior. |
| Permissions/CSP/message boundaries | present-but-false-green | WXT declares permissions/hosts/CSP; handlers and HTTP boundaries use Zod. No ratified permission budget covers the full set. | Undeclared permission, pre-action page collection, or unnecessary `wasm-unsafe-eval`. |
| BYOK boundary | present-but-false-green | Key is local, transits Proso to selected provider, and skips managed debit; unified absence proof is missing. | Sentinel appears in logs/cache/DB/evidence/wrong provider or affects credits. |
| Sonar and hosted CI honesty | present-but-false-green | Sonar skips without host and masks coverage; CI masks audit/visual failures. | Missing reports or planted failures make required checks red. `[pending] Pedro`: workflow edits. |
| Agent-doc drift | present-but-false-green | `CLAUDE.md` contradicts canonical `AGENTS.md` about tracked SpecKit paths; `make docs` does not detect it. | A planted contradiction makes the drift guard fail. |
| Blackboard coordination | present-but-false-green | PR #83 tracks owners, but has no lock/schema/stale detector/done sentinel test. | Concurrent update or stale owner is accepted silently. |
| Lefthook installation | present-but-false-green | Root install masks `lefthook install` failure; non-package delivery files lack equivalent staged checks. | Broken hook install or staged gate script still commits successfully. |
| Security/threat/secret/retention baseline | missing | No root `SECURITY.md`, threat model, secret metadata matrix, lifecycle/deletion policy, or recovery runbook. | Future docs name real boundaries and planted misuse controls without values. |
| Semgrep OSS | missing | Only OpenGrep is wired; `semgrep` is unavailable. | Pinned Semgrep plus repo-rule negative test. |
| Local CodeQL | missing | No local SARIF severity/baseline gate; `codeql` is unavailable. | Planted high-severity SARIF result fails closed. |
| Complexity/performance budgets | missing | Complexity rules are disabled; no changed function/file/startup/bundle budget. | Planted oversized/complex changed code fails. |
| Durable evidence retention | missing | Many cited receipts live only in `/tmp`; no manifest/age/size/quarantine policy. | Evidence remains validated after `/tmp` and worktree removal. |
| Generated vault/docs sink | not applicable | No named consumer; repo is private and tracked specs/docs already carry reviewable product truth. | Revisit only when a consumer cannot use private Notes or repo docs. |
| DeliCasa submodule machinery | not applicable | Proso is one pnpm monorepo. | Revisit only if repository topology changes. |

## Product Data Classes

| Class | Examples | Audience | Never |
|---|---|---|---|
| P0 Public | Help, permission rationale, provider disclosure, synthetic examples | Public site/README/release notes after review | Private topology, identifiers, raw receipts, unpatched exploit detail |
| P1 Project-safe | Decisions, threat diagrams, schemas without values, sanitized aggregate results | Private repo and allowlisted Proso Notes root | User content, stable IDs, raw browser/HTTP evidence |
| P2 Restricted operator | Secret names/scopes/owners, private endpoints, incidents, billing operations | Pedro and explicitly authorized operators in private Notes | Repo, PR bodies, CI artifacts, external model prompts |
| P3 Restricted user/secret | Keys/tokens, page text, audio, history, account/payment/ledger rows, raw logs | Minimum runtime component for bounded purpose/retention | Notes, repo, exports, fixtures, screenshots, prompts, PRs |

## Fail-Closed Product Acceptance Oracles

- Before an explicit public start action, page content has no network egress and is not stored;
  after start, only the exact requested selection or article fragment may enter synthesis.
- Public browser-action and keyboard controls preserve focus and expose stable role/name plus a
  live `ready`/`loading`/`playing`/`paused`/`stopped`/`error` status; stop and restart clear all
  transient text, audio, and highlight state.
- Failure, BYOK, and cache-hit paths debit managed credit zero times. A successful managed
  synthesis is debited exactly once to the provider that delivered the audio, and the visible
  remaining balance equals the authoritative ledger.

Missing Firefox, public selectors, focus/status observability, or accounting evidence keeps the
corresponding outcome `BLOCKED`; internal dispatch, screenshots, builds, or private state cannot
upgrade it.

## Knowledge Model

- Source of truth for private rationale: `~/Documents/Notes/1. Projects/Proso/`.
- Shipped behavior truth: code and tracked specs/docs.
- First slice sink: none. A future local manifest/dry-run is preferred to a new repo.
- Conflict: one-way/read-only if later approved; never bidirectional or last-writer-wins.
- Default deny: only explicitly classified P1 paths may enter a future allowlist; P2/P3 never export.
- `[pending] Pedro`: Notes mutation, workflow creation, token/service/repo provisioning,
  public publication, or sync activation.

## Product Decisions Requiring Separate Ratification

1. Keep zero telemetry and disable remote collection, or ratify a MAJOR affirmative-consent amendment.
2. Define requester/tenant-scoped server-cache TTL and collision-resistant keying.
3. Define account/credit retention, export, erasure, and legally required exceptions.
4. Ratify the account-free managed-TTS entitlement before a Free journey can complete.

These decisions do not authorize runtime or public-policy edits in Feature 098.
