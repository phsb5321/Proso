# Implementation Plan: Remove AI Attribution

**Branch**: `077-remove-ai-attribution` | **Date**: 2026-03-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/077-remove-ai-attribution/spec.md`

## Summary

Remove all AI tool attribution (Co-Authored-By trailers, "Generated with Claude Code" footers) from git history and GitHub PR descriptions, gitignore all AI config files, and enforce no-attribution rules in development tooling. Uses `git filter-repo --message-callback` for commit message rewriting and `gh api` for PR description cleanup.

## Technical Context

**Language/Version**: Bash scripts, Python (inline in git filter-repo callback)
**Primary Dependencies**: `git-filter-repo` (via `nix-shell -p git-filter-repo`), GitHub CLI (`gh`), `jq`
**Storage**: N/A (operates on git objects and GitHub API)
**Testing**: Manual verification via `git log` grep and `gh pr list` queries
**Target Platform**: Linux (NixOS), GitHub.com
**Project Type**: DevOps/maintenance scripts
**Performance Goals**: N/A (one-time operation)
**Constraints**: Must preserve all commit content, authors, dates, branch topology. Private repo (single developer — no collaborator coordination needed).
**Scale/Scope**: 129 commits to rewrite, 44 PRs to update, ~25 AI config files to gitignore

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First | **PASS** | This feature improves privacy by removing AI tool attribution from public GitHub presence |
| II. Security by Default | **PASS** | No credential exposure. Backup created before destructive operations. |
| III. User Experience Excellence | **N/A** | No user-facing changes |
| IV. Modular Architecture | **N/A** | No code architecture changes |
| V. Test Coverage for Critical Paths | **PASS** | Verification steps included in each phase |

**Quality Gates**:
- Manifest validation: N/A (no extension code changes)
- No console errors: N/A
- Permissions: N/A
- Storage schema: N/A

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/077-remove-ai-attribution/
├── plan.md              # This file
├── research.md          # Complete (8 approaches evaluated, full audit)
├── spec.md              # Complete (3 user stories, 7 FRs, 6 SCs)
├── quickstart.md        # Execution runbook
└── checklists/
    └── requirements.md  # Quality checklist (all pass)
```

### Source Code (repository root)

```text
scripts/
└── remove-ai-attribution.sh  # PR description cleanup script (already created)

# Files modified (already done in current session):
.gitignore                      # Added AI tool patterns
CLAUDE.md                       # Added no-attribution enforcement rule
.claude/skills/proso-git-workflow/
├── SKILL.md                    # Added commit rules 5-6, removed Claude Code examples
└── pr-template.md              # Removed "Generated with" footer
```

**Structure Decision**: No new source code directories. This feature operates via shell scripts and git tooling, modifying existing config files and git history.

## Execution Phases

### Phase 1: Gitignore & Config Enforcement (DONE)

**Status**: Already completed in this session.

| Task | Status | Files |
|------|--------|-------|
| Update .gitignore with AI tool patterns | Done | `.gitignore` |
| Remove AI files from git tracking | Done | `git rm --cached` on 35 files |
| Add no-attribution rule to CLAUDE.md | Done | `CLAUDE.md` |
| Update git workflow skill | Done | `.claude/skills/proso-git-workflow/SKILL.md` |
| Remove "Generated with" from PR template | Done | `.claude/skills/proso-git-workflow/pr-template.md` |

### Phase 2: Clean PR Descriptions (Non-Destructive)

**Prerequisite**: Phase 1 committed and pushed.

**Steps**:
1. Dry run to preview affected PRs
2. Execute PR body cleanup for all 44 PRs
3. Optionally clean PR/issue comments
4. Verify zero remaining AI attribution in PR bodies

**Commands**:
```bash
# Preview
./scripts/remove-ai-attribution.sh --dry-run

# Execute
./scripts/remove-ai-attribution.sh

# Verify
gh pr list --state all --limit 100 --json number,body | \
  jq '[.[] | select(.body | test("Claude|Generated with|Anthropic"; "i"))] | length'
# Expected: 0
```

**Rollback**: Not needed (non-destructive, and GitHub shows no edit history for PR bodies).

### Phase 3: Rewrite Git History (Destructive)

**Prerequisite**: Phase 2 complete. All current work committed and pushed.

**Strategy**: Fresh clone approach (safest).

**Steps**:

1. **Backup** current repo state:
   ```bash
   git bundle create /tmp/proso-backup-$(date +%Y%m%d).bundle --all
   ```

2. **Fresh clone** for filtering:
   ```bash
   git clone git@github.com:phsb5321/Proso.git /tmp/proso-rewrite
   cd /tmp/proso-rewrite
   ```

3. **Dry run** to preview changes:
   ```bash
   nix-shell -p git-filter-repo --run "git filter-repo --dry-run --message-callback '
   import re
   message = re.sub(br\"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?\", b\"\", message, flags=re.IGNORECASE)
   message = re.sub(br\"(?m)^.*Generated with \[Claude Code\].*\n?\", b\"\", message, flags=re.IGNORECASE)
   message = re.sub(br\"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?\", b\"\", message)
   message = re.sub(br\"\n{3,}\", b\"\n\n\", message)
   message = message.rstrip() + b\"\n\"
   return message
   '"
   ```

4. **Review dry run diff**:
   ```bash
   diff .git/filter-repo/fast-export.original .git/filter-repo/fast-export.filtered | head -300
   ```

5. **Execute** the rewrite (no --dry-run):
   ```bash
   nix-shell -p git-filter-repo --run "git filter-repo --message-callback '
   import re
   message = re.sub(br\"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?\", b\"\", message, flags=re.IGNORECASE)
   message = re.sub(br\"(?m)^.*Generated with \[Claude Code\].*\n?\", b\"\", message, flags=re.IGNORECASE)
   message = re.sub(br\"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?\", b\"\", message)
   message = re.sub(br\"\n{3,}\", b\"\n\n\", message)
   message = message.rstrip() + b\"\n\"
   return message
   '"
   ```

6. **Re-add remote** (filter-repo removes it):
   ```bash
   git remote add origin git@github.com:phsb5321/Proso.git
   ```

7. **Disable branch protection** (if enabled):
   ```bash
   gh api -X DELETE repos/phsb5321/Proso/branches/main/protection 2>/dev/null
   ```

8. **Force push** all branches and tags:
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

9. **Re-enable branch protection** via GitHub Settings > Branches.

**Rollback**: Restore from backup bundle:
```bash
cd /tmp
git clone proso-backup-YYYYMMDD.bundle proso-restored
cd proso-restored
git remote add origin git@github.com:phsb5321/Proso.git
git push origin --force --all
```

### Phase 4: Post-Cleanup Verification

**Steps**:

1. **Verify commit messages are clean**:
   ```bash
   git log --all --format="%b" | grep -ic "co-authored-by.*claude\|co-authored-by.*anthropic\|Generated with.*Claude"
   # Expected: 0
   ```

2. **Verify file contents unchanged**:
   ```bash
   # Compare file tree with backup
   git diff --stat HEAD  # Should show no changes
   ```

3. **Verify all branches present**:
   ```bash
   git branch -a | wc -l
   # Should match pre-rewrite count
   ```

4. **Re-clone working directory**:
   ```bash
   cd /home/notroot/Documents/Code/Firefox
   rm -rf Proso
   git clone git@github.com:phsb5321/Proso.git
   cd Proso
   ```

5. **Restore local-only files** (gitignored, need manual copy):
   ```bash
   # Copy from backup or recreate:
   # .claude/, CLAUDE.md, .mcp.json, .opencode/, .specify/, specs/
   ```

6. **Verify local development works**:
   ```bash
   pnpm install
   pnpm --filter @proso/extension dev  # Should start without errors
   ```

### Phase 5: GitHub Garbage Collection (Optional)

Contact GitHub Support to request GC of dangling commit objects if maximum attribution removal is desired. This ensures old commit messages are purged from GitHub's object store.

**Note**: For a private repo, dangling commits are only accessible to collaborators with the old SHAs. This phase is optional unless the repo will be made public in the future.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Force push fails (branch protection) | Medium | Low | Temporarily disable protection via API |
| Local development files lost after re-clone | Medium | Medium | Copy .claude/, CLAUDE.md, .mcp.json, specs/ from backup before deleting old clone |
| Dangling commits remain on GitHub | High | Low (private repo) | Contact GitHub Support for GC if needed |
| Already-sent email notifications contain old PR bodies | Certain | Very Low | Acceptable — email is ephemeral and not searchable |
| git filter-repo regex misses a variant | Low | Medium | Dry run + post-verification catch any misses |

## Dependency Order

```
Phase 1 (DONE) → Phase 2 (PR cleanup) → Phase 3 (git history) → Phase 4 (verification)
                                                                      ↓
                                                               Phase 5 (optional GC)
```

Phases 2 and 3 could technically run in parallel, but sequential execution is recommended so Phase 3's force push doesn't invalidate Phase 2's PR references during the push window.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
