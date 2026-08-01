# Feature Specification: Remove AI Attribution

**Feature Branch**: `077-remove-ai-attribution`
**Created**: 2026-03-18
**Status**: Research Complete
**Input**: User description: "Remove all AI attribution from git history, PR descriptions, and codebase without losing any information"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean PR Descriptions (Priority: P1)

As the repository owner, I want all GitHub PR descriptions cleaned of AI tool attribution so that no public-facing GitHub page reveals AI tool usage.

**Why this priority**: PR descriptions are immediately visible to anyone browsing the repo. Non-destructive to fix (no history rewrite needed). Quickest win.

**Independent Test**: After running the cleanup script, `gh pr list --state all --json body | jq '[.[] | select(.body | test("Claude|Generated with"; "i"))] | length'` returns 0.

**Acceptance Scenarios**:

1. **Given** 44 PRs with "Generated with [Claude Code]" footers, **When** the cleanup script runs, **Then** all 44 PR bodies no longer contain the pattern
2. **Given** a PR body with meaningful content above the footer, **When** the footer is removed, **Then** all other content is preserved intact

---

### User Story 2 - Rewrite Git Commit Messages (Priority: P1)

As the repository owner, I want all `Co-Authored-By: Claude` trailers removed from git commit messages so that git history does not reveal AI tool usage.

**Why this priority**: 129 commits have Claude attribution visible on GitHub. This is the largest exposure surface.

**Independent Test**: After rewrite and force push, `git log --all --format="%b" | grep -ic "claude\|anthropic"` returns 0.

**Acceptance Scenarios**:

1. **Given** 129 commits with Co-Authored-By trailers, **When** git filter-repo runs, **Then** all trailers are removed
2. **Given** commits with multi-line bodies, **When** only the trailer is removed, **Then** the commit subject and body text are preserved
3. **Given** the rewritten history, **When** pushed to GitHub, **Then** all branches and tags are updated

---

### User Story 3 - Prevent Future AI Attribution (Priority: P2)

As the repository owner, I want AI config files (CLAUDE.md, .claude/, .mcp.json, specs/) completely invisible on GitHub so that the development tooling is private.

**Why this priority**: Already partially implemented (gitignore + git rm --cached). Ensures no future slips.

**Independent Test**: `git ls-files | grep -iE '(claude|\.mcp|specs/)' | wc -l` returns 0.

**Acceptance Scenarios**:

1. **Given** AI config files are gitignored, **When** a developer adds new files to .claude/, **Then** they are not tracked by git
2. **Given** CLAUDE.md contains the no-attribution rule, **When** committing or creating PRs, **Then** no AI attribution is included

---

### Edge Cases

- What happens if a commit message consists ONLY of a Co-Authored-By trailer (empty after removal)? The filter preserves the subject line; only body trailers are removed.
- What if the Co-Authored-By format varies (different capitalization, spacing)? The regex uses case-insensitive matching with flexible patterns.
- What if GitHub branch protection blocks force push to main? Temporarily disable via API, push, re-enable.
- What happens to dangling commits on GitHub after force push? They persist until GitHub GC runs (unpredictable). Contact GitHub Support for immediate purge if needed.
- What if the PR cleanup script encounters rate limits? Built-in 1-second delay between writes; well within 5,000/hr limit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All `Co-Authored-By` trailers referencing Claude or Anthropic MUST be removed from every commit across all branches
- **FR-002**: All "Generated with [Claude Code]" footers MUST be removed from every PR description
- **FR-003**: All AI tool config files (.claude/, CLAUDE.md, .mcp.json, .opencode/, .specify/, specs/) MUST be gitignored and removed from git tracking
- **FR-004**: The cleanup MUST preserve all commit content (file changes, authors, dates, branch topology)
- **FR-005**: The cleanup MUST preserve all PR content except the AI attribution patterns
- **FR-006**: CLAUDE.md and git workflow skill MUST enforce no-AI-attribution rules for all future commits and PRs
- **FR-007**: A backup MUST be created before any destructive operation

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero commits in the repository contain AI-tool Co-Authored-By trailers after cleanup
- **SC-002**: Zero PR descriptions on GitHub contain "Generated with [Claude Code]" or similar AI attribution
- **SC-003**: Zero AI tool configuration files appear in `git ls-files` output
- **SC-004**: All 109+ commits retain their original file changes, authorship, and timestamps
- **SC-005**: All branches and tags are successfully pushed to GitHub after rewrite
- **SC-006**: Development workflow (CLAUDE.md, .claude/, .mcp.json) continues working locally without interruption
