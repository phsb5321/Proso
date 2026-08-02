# Fleet owner map — authoritative

Updated: 02/08/2026 13:50 BRT.

This map supersedes per-worktree ownership claims. Per-worktree blackboards are
operational logs only; they do not reassign work. Do not reset, stash, delete,
or move another seat's worktree.

The active rows use the native Codex panes in HERDR session `side-projects`.
References to `home` panes below are preserved predecessor history, not active
assignments.

| Active pane | Role | Exclusive worktree / branch | Scope | Status |
|---|---|---|---|---|
| `w2:p3` | Engineer | `proso-098-ops-parity` / `098-ops-parity`; retain `proso-82-extension-402` / `096-tts-boundary-hardening` unchanged | Sole implementation owner for Feature 098: retain clean-bootstrap RED, change only the `smoke-server-boot` dependency filter, retain GREEN, and run focused checks. Do not mutate 093/094/095/096, workflows, packages, Notes, or sync. | 098 assigned test-first after `OPS-PARITY-AUDITED`; PR #86 stays draft/CLEAN at `33ba614` and untouched |
| `w2:p1` | Orchestrator | `proso-094-fleet-orchestration` / `094-fleet-orchestration`; SpecKit bootstrap only on `proso-098-ops-parity` | Maintain this map, create/publish the 098 SpecKit contract, dispatch exact work, and own safe PRs through merge. No feature implementation. | PR #83 is OPEN/CLEAN at `995fd2a`; the 098 bootstrap slice is the independently reversible repair for its clean-build blocker |
| `w2:p2` | Product | None (exact-HEAD reviewer) | Review Feature 098's P0–P3 classes, default-deny vault audience, zero-telemetry current contract, cache/retention decisions, and public Firefox accessibility oracles. Do not implement worker/runtime/public-policy/Notes slices. | Ops-parity audit complete; public policy publication, runtime privacy changes, and no-key Free entitlement remain separately gated |
| `w2:p4` | Quality | Retained `proso-093-user-simulation-gate` (inactive); exact-HEAD reviewer only | Preserve retired 093, validate Feature 098's clean RED/GREEN falsifier and scope, and confirm no workflow/browser/sync expansion. Do not repeat Firefox/fuzz. | Ops-parity audit complete; Semgrep/CodeQL/evidence/security-budget work is split into later local slices; workflow/Sonar changes stay `[pending] Pedro` |

## Operational-parity audit and first slice — 02/08/2026

`OPS-PARITY-AUDITED` was emitted before the 098 worktree or any parity-related
repository mutation. Product, Engineer, and Quality each supplied a read-only
evidence/falsifier matrix. The reconciled classification is tracked in
`specs/098-ops-parity/research.md` on branch `098-ops-parity`.

The first slice is deliberately one implementation line: select
`@proso/server...` in `smoke-server-boot` so pnpm builds the existing shared
workspace dependency before the server in a fresh worktree. Engineer owns the
worktree after Orchestrator publishes the SpecKit bootstrap. Product and Quality
are read-only exact-HEAD reviewers.

The following remain independent follow-ups, not hidden scope on 098: root
security/threat/secret/retention documentation; durable evidence manifests;
Semgrep OSS; local CodeQL; complexity/function/file/performance budgets;
AGENTS/CLAUDE drift and atomic/stale-aware coordination. GitHub Actions, Sonar,
action pins, Notes mutation, public privacy publication, new repo/token/service/
secret, and any sync activation stay `[pending] Pedro`.

## Lossless migration receipts — 02/08/2026

- Engineer captured predecessor `w2C:p1`, exact Feature 096 HEAD `33ba614`,
  clean owned worktree, PR #86 gates, and no running heavy process.
- Product captured predecessor `w2C:p3`, confirmed merged PR #85 and no owned
  worktree, then completed a read-only 093/096 acceptance audit.
- Quality captured predecessor `w2C:p4`, confirmed merged PR #84 and the clean
  retained 093 worktree, and did not repeat Firefox/fuzz evidence.
- Orchestrator captured predecessor `w2C:p2`, then re-read its final delta after
  the predecessor advanced 094. Final source state: idle at `72074e`, clean and
  tracking origin; PR #83 OPEN/CLEAN on base `444a09e`, GitGuardian passed,
  Sonar skipped, and no reviews/comments.

## Superseded operational history (preserved)

The following rows came from the merged PR #84 blackboard. They are preserved
as migration evidence and are not additional active owner assignments.

```text
| 02/08/2026 00:02 | E2E & Quality (Codex) | `093-user-simulation-gate` | Adopt Feature 093 and execute `make user-gate`; retain deterministic evidence and diagnose any failure without weakening assertions. | In progress |
| 02/08/2026 00:06 | Code (w2C:p3) | `proso-82-extension-402` / branch `096-tts-boundary-hardening` | Finish the staged HTTP 402 server-to-extension `Result` path under its tracked spec/tests; preserve 093. Initial focused extension (63) and server (49) evidence is green. | In progress; 402 remains `payment_required`, not a free-tier restoration |
| 02/08/2026 00:06 | Product & Intent (w2C:p1) | Read-only / separate worktree | Feature 093 acceptance review is **BLOCK**: the internal command-dispatch smoke is a downstream diagnostic, not a public-actor user gate. Quality must revise outcome-level acceptance and prove public accessible controls, privacy/accounting, recoverable anomalies, replayable campaigns, and one bound receipt. | Blocked pending Quality repair |
| 02/08/2026 00:08 | Product & Intent (w2C:p1) | Read-only / separate worktree | **P0 product contradiction verified:** documented no-key free-tier managed reading conflicts with `FEATURE_MATRIX.Free.managedTts = false`, zero credits, and the server's pre-cache 402; the local fixture does not model this entitlement and browser TTS is removed. | [pending] Pedro: ratify the no-key free-tier route before any completion claim |
| 02/08/2026 00:09 | 🧭 Orchestrator | `094-fleet-orchestration` | Policy gate: choose and document the intended no-key free-tier entitlement before a user journey claims it. Code/096 must retain the current 402 `payment_required` mapping and must not silently restore managed free-tier synthesis. | [pending] Pedro: product ratification |
| 02/08/2026 00:09 | E2E & Quality (Codex) | `093-user-simulation-gate` | Rework Feature 093 from the Product BLOCK: retain the internal shortcut dispatch only as a downstream diagnostic; add a public-control actor path plus role/name/keyboard assertions, anomaly/restart/soak campaigns, and a single bound receipt. The fresh no-key managed journey remains explicitly unresolved pending policy. | In progress; cannot claim feature completion |
| 02/08/2026 00:16 | E2E & Quality (Codex) | `093-user-simulation-gate` | Verified Firefox Unified Extensions exposes the public Proso browser action. Marionette cannot enter its remote popup frame; the attempted keyboard proof did not reach an actor action. `make user-gate` now fails closed, while `make user-gate-diagnostic` retains internal-dispatch evidence. | BLOCK remains; J-001 [pending] Pedro |
```

## Numbering and preservation facts

- Directory `proso-82-extension-402` truthfully hosts branch
  `096-tts-boundary-hardening`; its directory name is historical and is not a
  reason to rename, move, or reset its staged work.
- The p3 Product seat previously stopped an attempted 096 implementation; its
  test patch applied nothing. The p1 Code assignment above is now the sole
  authorization to mutate the preserved 096 worktree.
- PR #82 / Feature 095 merged as `f217211` at 00:09. The stale 095 worktree's
  committed tree matches `origin/main`; its eight tracked modifications and two
  untracked paths are preserved candidate post-merge deltas, not content to
  resubmit. Only p3's fresh 097 branch may receive audited novel work.
- PR #85 merged the audited 097 Product delta as `444a09e` at 00:24. GitGuardian
  passed, Sonar was skipped, and no GitHub reviews/comments/threads remained.
  The anonymous/no-key managed Free entitlement remains `[pending] Pedro`; the
  merge did not change that policy gate.
- `096-reading-journey-ledger` is a separate historical worktree at merged
  commit `f217211` (`docs(spec): define reading journey outcome contract (#82)`)
  with one uncommitted `docs/reading-journey-status.md` edit. It is not p1's
  096 TTS slice. Its one status-document correction is already represented by
  current `origin/main`'s diagnostic-only Firefox ledger after PR #85; preserve
  the worktree unchanged and do not resubmit or delete it.
- The no-key managed free-tier route is a product-policy gate: Free has zero
  credits and `managedTts: false`, while browser TTS is removed. Until Pedro
  ratifies a route, no seat may claim a fresh free user can synthesize through
  the managed server.

## Gate schedule and review rule

- Only p4 runs `make user-gate` / the real Firefox journey for 093. p1 runs
  only its focused 402 checks after this 00:12 handoff; p3 and p2 do not run
  duplicate heavy gates.
- A final external review must use a **non-OpenAI** family. Sol and Terra are
  the same family and cannot review each other.
- GitHub Actions/workflow changes stay `[pending] Pedro`; no workflow change is
  folded into the safe local slices.

## Deterministic-gate blocker — verified 02/08/2026 00:20 BRT

`nix shell nixpkgs#gnumake --command make verify-full` fails after a clean
`make bootstrap`: `smoke-server-boot` builds the server before
`@proso/shared`, and the absent `packages/shared/dist` makes `@proso/shared`
unresolvable. This is not a 094 documentation regression. The falsifier was
run: `pnpm --filter @proso/shared build` followed by `make smoke-server-boot`
passes (built server present; boot routing returned HTTP 503 as expected).

Treat this as a separately scoped build-ordering repair. Do not fold it into
093, 096, or 097, and do not mark PR #83 deterministic-green until a fresh
clean-bootstrap `make verify-full` passes.

## Feature 096 delivery gates — PR #86

PR #86 is a cross-service draft at `33ba614`; extension/server tests, Server CI
lint/test/build, security audit, E2E, visual, and GitGuardian passed at 00:40.
Sonar is skipped and remains non-evidence. Before any merge it needs: (1) p4's retained,
exact-HEAD public browser-action observation of the visible 402 refusal and
clean stopped state; (2) a non-OpenAI typed review; and (3) a clear record that
the repository-wide `verify-full` failure is the separately scoped clean-
bootstrap ordering defect, not a claim of green. The cross-service gate forbids
self-merge. Sonar is skipped and is not quality evidence.

## Quality migration receipt — 02/08/2026 13:36 BRT

PR #84 merged Feature 093 at `87b2cbb`; the retained 093 worktree is clean at
`43a1a82` with its upstream branch gone. Quality made no post-migration change
and started no duplicate Firefox/fuzz run. `make user-gate` remains BLOCKED as
a completion oracle: its internal `ExtensionParent`/`shortcuts.onCommand()`
actor is diagnostic-only and its exit 2 was retained negative-control evidence.
The remaining future acceptance work is public browser-action/accessible-control
driving plus a unified anomaly/restart/soak receipt. The pre-cache Free managed
TTS 402 remains a Pedro-gated entitlement decision.
