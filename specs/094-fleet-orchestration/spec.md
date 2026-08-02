# Feature 094 — Fleet orchestration

## Goal

Maintain one evidence-backed owner map for the active Proso fleet so worktree,
branch, gate, and review collisions cannot corrupt another seat's delivery.

## Requirements

- **FR-001:** Record exactly one owner for p1 Code, p2 Orchestrator, p3 Product
  & Intent, and p4 E2E & Quality.
- **FR-002:** Bind each owner to its existing worktree and actual branch, even
  where a historical directory name differs from the branch number.
- **FR-003:** Preserve all existing worktrees and staged/untracked work.
- **FR-004:** Reserve each heavyweight browser gate to one owner and require a
  non-OpenAI external reviewer for this OpenAI-family fleet.
- **FR-005:** Record the no-key managed free-tier conflict as a Pedro-gated
  product decision; no implementation slice may silently resolve it.

## Acceptance

The owner map names all four seats, records the 096/82 and 095 naming facts,
assigns `make user-gate` only to Quality, and explicitly preserves the
historical 096 ledger worktree.
