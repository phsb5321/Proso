# Tasks: Remove AI Attribution

**Input**: Design documents from `/specs/077-remove-ai-attribution/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not applicable — this is a DevOps/maintenance task verified via shell commands.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths or commands in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Commit existing config changes and prepare tooling

- [x] T001 Commit .gitignore changes and AI file removal from git tracking on branch `077-remove-ai-attribution`
- [x] T002 Push branch `077-remove-ai-attribution` to origin with upstream tracking
- [x] T003 Verify `scripts/remove-ai-attribution.sh` is executable and has correct repo owner/name

**Checkpoint**: Branch pushed, all local config enforcement in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create backup and validate tools before any destructive operations

**CRITICAL**: No destructive work can begin until this phase is complete.

- [x] T004 Create full repo backup via `git bundle create /tmp/proso-backup-$(date +%Y%m%d).bundle --all`
- [x] T005 Verify `git-filter-repo` is available via `nix-shell -p git-filter-repo --run "git filter-repo --version"`
- [x] T006 Verify `gh` CLI is authenticated and can access the repo via `gh repo view --json visibility`
- [x] T007 Verify `jq` is installed via `jq --version`

**Checkpoint**: All tools available, backup created — execution can begin.

---

## Phase 3: User Story 1 - Clean PR Descriptions (Priority: P1)

**Goal**: Remove "Generated with [Claude Code]" and AI attribution footers from all 44 PR descriptions on GitHub.

**Independent Test**: `gh pr list --state all --limit 100 --json number,body | jq '[.[] | select(.body | test("Claude|Generated with|Anthropic"; "i"))] | length'` returns 0.

### Implementation for User Story 1

- [x] T008 [US1] Run dry-run preview via `./scripts/remove-ai-attribution.sh --dry-run` and review output
- [x] T009 [US1] Execute PR body cleanup via `./scripts/remove-ai-attribution.sh`
- [x] T010 [US1] Run PR comment cleanup via `./scripts/remove-ai-attribution.sh --comments`
- [x] T011 [US1] Verify zero AI attribution remains in PR bodies via `gh pr list --state all --limit 100 --json number,body | jq '[.[] | select(.body | test("Claude|Generated with|Anthropic"; "i"))] | length'`

**Checkpoint**: All 44 PR descriptions are clean. No "Generated with Claude Code" visible on GitHub.

---

## Phase 4: User Story 2 - Rewrite Git Commit Messages (Priority: P1)

**Goal**: Remove all `Co-Authored-By: Claude/Anthropic` trailers from 129 commits across all branches.

**Independent Test**: `git log --all --format="%b" | grep -ic "co-authored-by.*claude\|co-authored-by.*anthropic"` returns 0.

### Implementation for User Story 2

- [x] T012 [US2] Create fresh clone for filtering: `git clone git@github.com:phsb5321/Proso.git /tmp/proso-rewrite`
- [x] T013 [US2] Run dry-run of git filter-repo in `/tmp/proso-rewrite` using the message-callback from `research.md` section 3
- [x] T014 [US2] Review dry-run diff: `diff /tmp/proso-rewrite/.git/filter-repo/fast-export.original /tmp/proso-rewrite/.git/filter-repo/fast-export.filtered | head -300`
- [x] T015 [US2] Execute git filter-repo for real (no --dry-run) in `/tmp/proso-rewrite` (ran twice — first pass missed embedded lines with leading whitespace/formatting)
- [x] T016 [US2] Re-add remote: `git remote add origin git@github.com:phsb5321/Proso.git` in `/tmp/proso-rewrite`
- [x] T017 [US2] Temporarily disable branch protection on main: `gh api -X DELETE repos/phsb5321/Proso/branches/main/protection`
- [x] T018 [US2] Force push all branches: `git push origin --force --all` from `/tmp/proso-rewrite`
- [x] T019 [US2] Force push all tags: `git push origin --force --tags` from `/tmp/proso-rewrite`
- [x] T020 [US2] Re-enable branch protection on main via GitHub Settings > Branches
- [x] T021 [US2] Verify zero AI attribution in commit messages: `git log --all --format="%b" | grep -ic "co-authored-by.*claude\|co-authored-by.*anthropic\|Generated with.*Claude"` = 0

**Checkpoint**: All 129 commits are clean. No Co-Authored-By trailers visible on GitHub.

---

## Phase 5: User Story 3 - Prevent Future AI Attribution (Priority: P2)

**Goal**: Ensure AI config files are invisible on GitHub and no-attribution rules are enforced going forward.

**Independent Test**: `git ls-files | grep -iE '(claude|\.mcp|specs/)' | wc -l` returns 0.

### Implementation for User Story 3

- [x] T022 [US3] Verify `.gitignore` contains all AI tool patterns: `.claude/`, `CLAUDE.md`, `.mcp.json`, `.opencode/`, `.specify/`, `specs/`, `.copilot/`, `.cursor/`
- [x] T023 [US3] Verify `CLAUDE.md` contains "MANDATORY: No AI Attribution in Git or Code" section at top
- [x] T024 [US3] Verify `.claude/skills/proso-git-workflow/SKILL.md` contains rules 5-6 (no Co-Authored-By, no AI mentions)
- [x] T025 [US3] Verify `.claude/skills/proso-git-workflow/pr-template.md` has no "Generated with" footer
- [x] T026 [US3] Verify `git ls-files | grep -iE '(claude|\.mcp|specs/)' | wc -l` returns 0 (on 077-remove-ai-attribution branch)

**Checkpoint**: All prevention measures in place. Future sessions will not produce AI attribution.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Re-clone, restore local files, verify everything works end-to-end

- [x] T027 Reset working directory to rewritten remote: `git fetch origin && git reset --hard origin/077-remove-ai-attribution` (avoided full re-clone since gitignored files survive reset)
- [x] T028 Verified local-only files survived: `.claude/`, `CLAUDE.md`, `.mcp.json` all present
- [ ] T029 Install dependencies: `cd Proso && pnpm install` (deferred — not needed for verification)
- [ ] T030 Verify extension dev server starts: `pnpm --filter @proso/extension dev` (deferred)
- [x] T031 Run full verification: zero AI attribution in commits (origin/main: 0), PRs (0), tracked files (0)
- [x] T032 Skipped — used reset instead of re-clone, no old copy to remove
- [x] T033 Clean up filter work directory: `rm -rf /tmp/proso-rewrite`
- [ ] T034 (Optional) Contact GitHub Support to request garbage collection of dangling commits

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 - PR Cleanup (Phase 3)**: Depends on Phase 2
- **US2 - Git History (Phase 4)**: Depends on Phase 2. Should run AFTER Phase 3 (force push may invalidate PR references during push)
- **US3 - Prevention (Phase 5)**: Depends on Phase 2. Can run in parallel with Phase 3.
- **Polish (Phase 6)**: Depends on Phase 4 completion (must re-clone after force push)

### User Story Dependencies

- **US1 (PR Cleanup)**: Independent — can start after Phase 2
- **US2 (Git History)**: Should run after US1 to avoid PR reference issues during force push
- **US3 (Prevention)**: Independent — mostly verification of already-done work

### Execution Flow

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1: PR Cleanup)
                                                    ↓
                                            Phase 4 (US2: Git History)
                                                    ↓
                                            Phase 5 (US3: Prevention) [verification only]
                                                    ↓
                                            Phase 6 (Polish: Re-clone & Restore)
```

### Parallel Opportunities

- T005, T006, T007 can run in parallel (tool verification)
- T022, T023, T024, T025, T026 can run in parallel (all verification checks)
- US1 and US3 could technically run in parallel, but sequential is safer

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all tool verification tasks together:
Task: "Verify git-filter-repo available"
Task: "Verify gh CLI authenticated"
Task: "Verify jq installed"
```

## Parallel Example: Phase 5 (User Story 3)

```bash
# Launch all verification checks together:
Task: "Verify .gitignore patterns"
Task: "Verify CLAUDE.md no-attribution rule"
Task: "Verify git workflow skill rules"
Task: "Verify PR template clean"
Task: "Verify git ls-files clean"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (commit & push config changes)
2. Complete Phase 2: Foundational (backup & tool verification)
3. Complete Phase 3: US1 - PR Cleanup
4. **STOP and VALIDATE**: All PR descriptions clean on GitHub
5. This alone removes the most visible AI attribution (PR pages)

### Full Execution

1. Complete Setup + Foundational → Ready to execute
2. US1: Clean PR descriptions → Verify on GitHub (quickest win)
3. US2: Rewrite git history + force push → Verify on GitHub (biggest impact)
4. US3: Verify prevention measures → Confirm enforcement rules
5. Polish: Re-clone, restore local files, verify dev workflow

### Single Developer Strategy

Execute sequentially: Phase 1 → 2 → 3 → 4 → 5 → 6. Total estimated execution: ~30 minutes of active work (most time is waiting for git operations and API calls).

---

## Notes

- All US2 tasks (T012-T021) run in `/tmp/proso-rewrite`, not the working directory
- The force push in T018-T019 will invalidate the current working directory — Phase 6 re-clones
- Backup bundle at `/tmp/proso-backup-*.bundle` is the rollback mechanism
- US3 is mostly verification of work already done in the current session
- No test tasks generated (this is a DevOps task, not a code feature)
