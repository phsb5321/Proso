# Feature Specification: Make spec-driven development load-bearing

**Feature Branch**: `092-speckit-load-bearing`
**Created**: 2026-08-01
**Status**: Implemented
**Input**: Speckit runs on Proso but leaves no evidence in the repository.

## Problem

`.gitignore:7` was `specs/` and `.gitignore:6` was `.specify/`. Therefore
`git ls-files specs/ | wc -l` returned **0** while twenty spec directories and
6.3M of content sat on one developer's disk.

Observed consequences, each verified with a command:

1. **PR #73 (`088-reading-outcome-spine`, merged 2026-08-01T05:12:45Z)** was
   dispatched with a binding instruction to drive the work through speckit as
   `specs/088-reading-outcome-spine/`. That directory does not exist on `main`
   and never could have. The work landed; the spec did not.
2. Branches `080`, `082`, `085`, `086`, `088`, `090` all merged (PRs #51, #66,
   #68, #69, #73, #74) with **no tracked spec directory for any of them**.
   Spec-directory numbering and branch numbering have fully diverged, because
   one of the two is fiction.
3. Reviewers, CI, and every future session see a diff with no spec, no plan, no
   tasks, and no Constitution Check. The chain is ceremony that leaves no
   evidence.
4. The constitution the chain gates against is titled **"VoxPage Constitution"**
   — `grep -ci voxpage` = 2, `grep -ci proso` = 0 — and describes a single
   WebExtension, while the repo ships three deployables. It also forbids the
   first-party API the product depends on.

The sibling project (`tauri-pdf-reader`) tracks 139 spec files in git. Same
operator, same workflow, opposite convention. One of the two is wrong.

## User Scenarios & Testing

### Primary story

A reviewer opens a Proso pull request. Alongside the code diff they can read the
spec that motivated it, the plan that shaped it, and the tasks it claims to
complete — in the same diff, at the same commit, without asking the author for
context that lives on the author's laptop.

### Acceptance Scenarios

1. **Given** a merged feature PR, **When** a reader checks out `main` and lists
   `specs/<branch>/`, **Then** the spec, plan, and tasks for that feature are
   present.
2. **Given** the repository at `main`, **When** anyone runs
   `grep -ci voxpage .specify/memory/constitution.md`, **Then** the result is
   `0`.
3. **Given** a fresh `git worktree add`, **When** the agent starts work,
   **Then** `.specify/` and `specs/` are already present, because they are
   tracked — not absent, as they were before this change.
4. **Given** the convention is questioned in a future session, **When** the
   reader looks for the rule, **Then** it is in a tracked file (`AGENTS.md` and
   the constitution), not in a gitignored note or a session transcript.

### Edge Cases

- **The pre-monorepo archive.** `specs/_archive/` is 4.4M of superseded
  history — 386 of the 543 files. Tracking it would bloat every clone with
  content no reviewer reads. It stays ignored, and the ignore says why.
- **`.ts` files inside `specs/`.** Eight exist. Once tracked, dead-code and
  architecture ratchets could begin scanning them as production source. The
  quality gate must be run and any new finding resolved by scoping the tool,
  not by weakening it.

## Requirements

### Functional

- **FR-001**: `specs/` and `.specify/` MUST be tracked in git.
- **FR-002**: `specs/_archive/` MUST remain ignored, with the reason stated at
  the ignore site.
- **FR-003**: The tracking convention MUST be written in a **tracked** file.
- **FR-004**: The constitution MUST be retitled to Proso, with zero
  case-insensitive occurrences of "voxpage".
- **FR-005**: The constitution MUST govern the monorepo as it exists — three
  deployables — and MUST NOT forbid the first-party API the product ships.
- **FR-006**: The amendment MUST carry a SYNC IMPACT REPORT and a semantic
  version bump justified in that report.
- **FR-007**: This feature's own spec, plan, and tasks MUST be visible in the
  diff of the PR that implements it. The chain demonstrates itself or the
  change did not work.

### Non-Functional

- **NFR-001**: `make verify` and `make quality` MUST pass unchanged. No test may
  be weakened, skipped, deleted, or re-baselined.
- **NFR-002**: The change MUST be revertible with a single `git revert`.

## Success Criteria

- **SC-001**: `git ls-files specs/ | wc -l` > 0 on `main`.
- **SC-002**: `grep -ci voxpage .specify/memory/constitution.md` = 0 on `main`.
- **SC-003**: A different-model-family adversarial review returns no unrefuted
  high or critical finding against this diff.

## Out of Scope

- Backfilling specs for the six features that merged without one. Their work is
  already on `main`; inventing a retroactive spec would be fabricating a record.
  Numbering resumes honestly from here.
- The `'browser'` TTS provider contradiction between `packages/shared` and
  `AGENTS.md`. Real, but a product question, and this slice may not silently
  pick a winner.
