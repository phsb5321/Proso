# Fleet owner map — authoritative

Updated: 02/08/2026 00:26 BRT.

This map supersedes per-worktree ownership claims. Per-worktree blackboards are
operational logs only; they do not reassign work. Do not reset, stash, delete,
or move another seat's worktree.

The single merged 00:07 Product entry is retained as history: its ownership is
superseded by the authoritative correction below—p1 is Code and p3 is Product
& Intent for audited post-merge deltas only.

| Seat | Owner | Exclusive worktree / branch | Scope | Status |
|---|---|---|---|---|
| p1 | Code | `proso-82-extension-402` / `096-tts-boundary-hardening` | **Assigned at 00:12:** adopt the reviewed 096 boundary-hardening spec; finish the staged HTTP 402 server-to-extension `Result` path and the verified named-throttle selector repair. Acceptance must prove the visible actionable refusal leaves loading/playing cleanly and the effective HTTP 5/min test-key and 30/min voices limits return 429 without provider work. | In progress; do not claim a no-key free-tier restoration or Feature 093 completion |
| p2 | Orchestrator | `proso-094-fleet-orchestration` / `094-fleet-orchestration` | Maintain this owner map, reconcile worktree/PR/gate facts, and route safe merge work. No feature implementation. | In progress |
| p3 | Product & Intent | `proso-097-reading-journey-delta` / `097-reading-journey-delta` | Completed the audited Product delta: explicit per-journey falsifiers and the BYOK proxy oracle (transient receipt only; no retention/logging/wrong-provider forwarding/managed-credit debit). | **MERGED** as PR #85 at 00:24, squash `444a09e`; Meta `llama-3.3-70b-versatile` PASS FR-001..FR-007, zero findings |
| p4 | E2E & Quality | `proso-093-user-simulation-gate` / `093-user-simulation-gate` | Exclusively rework Feature 093 using Firefox's Unified Extensions panel and Proso browser action as the public start surface. Internal `ExtensionParent` dispatch stays diagnostic only; acceptance must reference merged 095 outcome categories and exact-HEAD receipts. | In progress; J-001 no-key managed journey is blocked pending Pedro, never skipped or fixture-simulated |

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
