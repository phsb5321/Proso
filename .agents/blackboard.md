# Fleet owner map — authoritative

Updated: 02/08/2026 00:16 BRT.

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
| p3 | Product & Intent | `proso-097-reading-journey-delta` / `097-reading-journey-delta` | **Assigned at 00:15:** audit and carry only demonstrably novel, reviewed Product deltas from preserved 095 and the 096 ledger. Add explicit per-journey falsifiers and correct the BYOK proxy oracle: transient Proso API receipt is allowed only for that request; no retention/logging/wrong-provider forwarding/managed-credit debit. | In progress; fresh from merged `f217211`; no delta has yet been copied |
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
- `096-reading-journey-ledger` is a separate historical worktree at merged
  commit `f217211` (`docs(spec): define reading journey outcome contract (#82)`)
  with one uncommitted `docs/reading-journey-status.md` edit. It is not p1's
  096 TTS slice. Its one status-document correction is a p3 audit input for
  097; preserve it unchanged until the delta is classified and copied there.
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
