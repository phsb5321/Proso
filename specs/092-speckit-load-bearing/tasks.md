# Tasks: Make spec-driven development load-bearing

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)
**Branch**: `092-speckit-load-bearing`

## Phase 1 — Decide and record the convention

- [X] **T001** Verify the finding rather than inherit it:
      `git ls-files specs/ | wc -l` → `0`; `git ls-files .specify/ | wc -l` → `0`.
- [X] **T002** Measure the archive split before deciding what to track:
      543 files on disk, 386 under `_archive/`, 157 active.
- [X] **T003** [FR-001][FR-002] Rewrite the `.gitignore` header block:
      un-ignore `specs/` and `.specify/`, add `specs/_archive/` with its reason
      stated inline.
- [X] **T004** [FR-003] Document the convention in `AGENTS.md` under a new
      "Spec-Driven Development" section — tracked file, canonical for
      conventions.

## Phase 2 — Bring the constitution to the real project

- [X] **T005** Establish ground truth for the provider list before editing:
      `browser`, `openai`, `elevenlabs`, `cartesia` appear in
      `packages/shared/src`, while `AGENTS.md` records that browser
      `speechSynthesis` was deliberately removed.
- [X] **T006** [FR-004] Retitle to "Proso Constitution" and purge every
      "VoxPage" occurrence.
- [X] **T007** [FR-005] Redefine Principle I so it permits the first-party
      Proso API under named limits, instead of forbidding the server the
      product ships.
- [X] **T008** [FR-005] Widen the governed scope from one WebExtension to the
      three deployables; add the Business Invariants table and the
      Spec-Driven Development section.
- [X] **T009** [FR-005] Add the deployable-boots requirement to Principle V,
      citing the `path-to-regexp` bootstrap failure that ~2900 passing tests
      did not catch.
- [X] **T010** [FR-006] Write the SYNC IMPACT REPORT and bump 1.1.0 → 2.0.0,
      justifying MAJOR by the two backward-incompatible redefinitions.
- [X] **T011** Record the unresolved `'browser'` provider contradiction as a
      follow-up TODO rather than silently picking a winner.

## Phase 3 — Prove it

- [X] **T012** [FR-007] Ensure this feature's own `spec.md`, `plan.md`, and
      `tasks.md` are staged, so the chain appears in its own diff.
- [X] **T013** [NFR-001] `make verify` — pasted in the PR body.
- [X] **T014** [NFR-001] `make quality` — pasted in the PR body.
- [X] **T015** [SC-003] Adversarial review by a different model family
      (Anthropic ineligible; DeepInfra out of balance; Codex usage-capped →
      Groq `openai/gpt-oss-120b`), two rounds, refute-role, verdict pasted.
- [X] **T016** Open the PR; confirm `state=MERGED` by command output, not by
      assertion.

## Verification Commands

```bash
git ls-files specs/ | wc -l                              # SC-001: > 0
grep -ci voxpage .specify/memory/constitution.md         # SC-002: 0
make verify && make quality                              # NFR-001
git revert <sha>                                         # NFR-002: single commit
```
