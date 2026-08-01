# Research: Removing AI Attribution from Proso Repository

**Date**: 2026-03-18
**Branch**: `077-remove-ai-attribution`
**Status**: Research Complete

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Approach Comparison Matrix](#2-approach-comparison-matrix)
3. [Recommended Solution: git filter-repo](#3-recommended-solution-git-filter-repo)
4. [PR Description Cleanup](#4-pr-description-cleanup)
5. [GitHub Data Retention After Force Push](#5-github-data-retention-after-force-push)
6. [Prevention: Config File Enforcement](#6-prevention-config-file-enforcement)
7. [Step-by-Step Execution Plan](#7-step-by-step-execution-plan)
8. [Sources](#8-sources)

---

## 1. Current State Audit

### AI Traces Found

| Category | Count | Visibility | Severity |
|----------|-------|-----------|----------|
| Commit `Co-Authored-By` trailers | 129 commits | Public on GitHub | **CRITICAL** |
| PR "Generated with Claude Code" footers | 44 PRs | Public on GitHub | **CRITICAL** |
| `.claude/` in .gitignore/.dockerignore | 2 files | Public (config lines) | LOW |
| "anthropic" as TTS provider in source | 2 files | Public but legitimate | NONE |

### Commit Trailer Breakdown

- `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` — 53 commits
- `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` — 36 commits
- `Co-Authored-By: Claude <noreply@anthropic.com>` — 20 commits
- Other formatting variations — 20 commits

### PR Footer Pattern

All 44 PRs (#1-#47) contain:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Clean Files (No Action Needed)

- `.github/workflows/` — all clean
- `README.md` — clean
- `package.json` files — clean
- `docs/` — clean
- Source code "OpenAI"/"anthropic" references — legitimate TTS provider names, not AI tool attribution

---

## 2. Approach Comparison Matrix

### For Git Commit Messages

| # | Approach | Removes Attribution | GitHub Compatible | Preserves History | Preserves Hashes | Recommended |
|---|----------|-------------------|-------------------|-------------------|-----------------|-------------|
| 1 | `git replace` | Yes (locally) | **No** (GitHub ignores replace refs) | Yes | Yes | **No** |
| 2 | `git notes` | No (additive only) | **No** (GitHub removed notes display in 2014) | Yes | Yes | **No** |
| 3 | GitHub API | N/A | N/A | N/A | N/A | **Not possible** |
| 4 | New repo + filter-repo | Yes | Yes | Yes (commits) | No | Yes (if losing PRs/issues is OK) |
| 5 | Squash all history | Yes | Yes | **No** (destroys all history) | No | **No** |
| 6 | BFG Repo-Cleaner | **No** (no message callback) | Yes | Yes | No | **No** |
| 7 | `git filter-branch` | Yes | Yes | Yes | No | **No** (deprecated, slow, risky) |
| 8 | Shallow clone + orphan | Yes | Yes | **No** (destroys all history) | No | **No** |
| **9** | **`git filter-repo --message-callback`** | **Yes** | **Yes** | **Yes** | No | **YES** |

### Key Findings

- **There is no truly non-destructive way to change commit messages.** The commit message is part of the SHA hash. Changing it creates a new commit object, which cascades to all descendants.
- **`git replace`** creates local-only replacement objects. GitHub does not honor them — the web UI still shows original commits.
- **`git notes`** are additive-only (can't remove text) and GitHub stopped displaying them in 2014.
- **No GitHub API exists** to modify commit metadata server-side.
- **`git filter-repo --message-callback`** is the only approach that removes attribution while preserving full commit history, blame, bisect capability, and individual diffs.

### For PR Descriptions

| Approach | Destructive | Audit Trail | Recommended |
|----------|-------------|-------------|-------------|
| `gh pr edit --body` | No | **No edit history visible** in GitHub UI | **YES** |
| GitHub REST API PATCH | No | Same as above | YES (same mechanism) |

GitHub does NOT show edit history for PR body/description changes. Once overwritten, the old text is not visible in the UI. Email notifications already sent would retain the original, but no web-visible audit trail.

---

## 3. Recommended Solution: git filter-repo

### What It Does

`git filter-repo --message-callback` processes every commit message through a Python callback function. It:

- **Preserves**: File contents, author/committer info, dates, branch topology, merge structure, individual diffs
- **Changes**: Only the commit message text (per callback logic)
- **Side effect**: ALL commit SHAs change (even unmodified commits, because parent SHAs cascade)

### The Callback

```python
git filter-repo --message-callback '
import re
# Remove Co-Authored-By lines mentioning Claude or Anthropic
message = re.sub(br"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?", b"", message, flags=re.IGNORECASE)

# Remove "Generated with [Claude Code]" lines
message = re.sub(br"(?m)^.*Generated with \[Claude Code\].*\n?", b"", message, flags=re.IGNORECASE)

# Remove robot emoji + "Generated with" lines
message = re.sub(br"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?", b"", message)

# Clean up trailing whitespace/blank lines
message = re.sub(br"\n{3,}", b"\n\n", message)
message = message.rstrip() + b"\n"

return message
'
```

### Syntax Rules

| Rule | Detail |
|------|--------|
| Bytestrings | All string literals must use `b"..."` or `br"..."` |
| `re` is pre-imported | No explicit import needed (but doesn't hurt) |
| Must return | `--message-callback` expects a return statement |
| `(?m)` / `re.MULTILINE` | Required so `^` matches start of each line |
| Emoji bytes | Robot emoji `🤖` = `\xf0\x9f\xa4\x96` in UTF-8 |

### Dry Run

```bash
git filter-repo --dry-run --force --message-callback '<callback>'

# Compare results:
git diff --no-index -- \
  .git/filter-repo/fast-export.original \
  .git/filter-repo/fast-export.filtered
```

The dry run writes two files to `.git/filter-repo/` that can be diffed to preview all changes.

### What Happens to the Repo

| Artifact | Effect |
|----------|--------|
| All branches | Rewritten (new SHAs) |
| All tags | Rewritten |
| `origin` remote | **Removed** (intentional safety measure) |
| Remote tracking branches | Converted to local branches |
| Reflogs | Pruned (no undo) |
| File contents/trees | Unchanged |
| Author name/email/dates | Preserved |
| Commit mapping | Saved to `.git/filter-repo/commit-map` |

### Using `--force` on a Non-Fresh Clone

By default, `git filter-repo` refuses to run on repos that aren't fresh clones. Use `--force` to override, but this:
- Skips the fresh-clone safety check
- Immediately prunes reflogs (no undo via reflog)
- Removes the `origin` remote

**Recommended**: Work on a fresh clone instead:
```bash
git clone git@github.com:phsb5321/Proso.git /tmp/proso-filter-work
cd /tmp/proso-filter-work
# No --force needed on a fresh clone
```

---

## 4. PR Description Cleanup

### Method

GitHub CLI can batch-update PR descriptions. No edit history is visible in the UI after update.

```bash
# Preview which PRs need updating
./scripts/remove-ai-attribution.sh --dry-run

# Actually update PR descriptions
./scripts/remove-ai-attribution.sh

# Also clean PR/issue comments
./scripts/remove-ai-attribution.sh --comments
```

### Script Behavior

1. Fetches all PRs (open, closed, merged) via `gh pr list --state all --json`
2. Checks each PR body for: `Generated with [Claude Code]`, `Co-Authored-By:.*Claude`, `🤖 Generated with`
3. Strips matching lines using `sed`
4. Updates via `gh api repos/OWNER/REPO/pulls/NUMBER -X PATCH`
5. 1-second delay between writes to avoid rate limiting

### Rate Limits

- Authenticated: 5,000 requests/hour
- ~100 PRs + comments = ~200-300 requests (well within limits)

### Audit Trail

- **PR body edits**: No visible edit history in GitHub UI
- **Comment edits**: GitHub shows "edited" dropdown with full history
- **Email notifications**: Already-sent emails retain original text
- **Webhook logs**: External services may have cached old payloads

---

## 5. GitHub Data Retention After Force Push

### Dangling Commits

**Old commits persist indefinitely on GitHub until garbage collection runs.** This is on an unpredictable schedule.

- Anyone with the SHA can access old commits via `https://github.com/OWNER/REPO/commit/SHA`
- GitHub GC is not on a published schedule — objects can persist for weeks to months
- To force removal: contact GitHub Support

### What Persists After Force Push

| Data | Retained? | Duration |
|------|-----------|----------|
| Old commit objects (by SHA) | Yes | Until GitHub GC (unpredictable) |
| PR timeline "force-pushed" events | Yes | Indefinitely |
| PR review comments on old commits | Yes (marked "outdated") | Indefinitely |
| GitHub Events API (PushEvents) | Yes | 30 days |
| GH Archive (public repos only) | Yes | Permanently |
| GitHub Actions workflow runs | Yes | 90 days (configurable to 400 for private) |
| Raw file CDN cache | Yes | 1-2 minutes then refreshed |
| GitHub code search index | Yes | Hours to days before reindex |

### Private Repo Advantage

- Dangling commits only accessible to collaborators with repo access
- Events API only visible to authenticated users with access
- **Not captured by GH Archive** (private events excluded)
- **Risk**: If repo ever becomes public, all historical PushEvents (including force-push before/after SHAs) become publicly accessible

### Collaborator Impact

After force push of rewritten history:
- **Feature branches**: `git fetch origin && git reset --hard origin/<branch>`
- **Full rewrite**: Fresh `git clone` is safest
- **Local unpushed work**: `git rebase --onto origin/main <old-base> <local-branch>`

---

## 6. Prevention: Config File Enforcement

### Files Updated (Already Done)

| File | Rule Added |
|------|-----------|
| `CLAUDE.md` | "MANDATORY: No AI Attribution in Git or Code" section at top |
| `.claude/skills/proso-git-workflow/SKILL.md` | Rules 5-6 in Commit Message Rules (never add Co-Authored-By, never mention AI tools) |
| `.claude/skills/proso-git-workflow/SKILL.md` | Removed "Generated with Claude Code" from PR template example |
| `.claude/skills/proso-git-workflow/pr-template.md` | Removed "Generated with Claude Code" footer |
| `.gitignore` | Added `.claude/`, `CLAUDE.md`, `.mcp.json`, `.opencode/`, `.specify/`, `.copilot/`, `.cursor/` |

### Forbidden Patterns (Documented in CLAUDE.md)

- `Co-Authored-By:` trailers referencing any AI
- `Generated with [Claude Code]` or similar in PR bodies
- `🤖 Generated with` footers
- Comments like `// AI-generated`, `// Claude`, `// Copilot`
- Any mention of Anthropic, Claude, OpenAI (as tools), Copilot, Cursor in commits/PRs/code
- **Exception**: "OpenAI"/"anthropic" as TTS provider names in source code is fine

### Files Removed from Git Tracking (Already Done)

All AI tool configuration files removed from git tracking via `git rm --cached`:
- `.claude/` (25 files: commands, hooks, skills, settings)
- `CLAUDE.md`
- `.mcp.json`
- `specs/` (9 files)

These files remain on disk for local development but are gitignored.

---

## 7. Step-by-Step Execution Plan

### Phase 1: Commit & Push Current Cleanup (Pre-requisite)

```bash
# On branch 077-remove-ai-attribution
git add .gitignore
git commit -m "chore: gitignore AI tool config files and remove from tracking"
git push -u origin 077-remove-ai-attribution
```

### Phase 2: Clean PR Descriptions (Non-Destructive)

```bash
# Preview changes
./scripts/remove-ai-attribution.sh --dry-run

# Execute
./scripts/remove-ai-attribution.sh

# Clean comments too
./scripts/remove-ai-attribution.sh --comments
```

### Phase 3: Rewrite Git History (Destructive - Requires Force Push)

**Option A: Fresh Clone (Safest)**

```bash
# 1. Create backup
git bundle create /tmp/proso-backup-$(date +%Y%m%d).bundle --all

# 2. Fresh clone
git clone git@github.com:phsb5321/Proso.git /tmp/proso-rewrite
cd /tmp/proso-rewrite

# 3. Dry run
nix-shell -p git-filter-repo --run "git filter-repo --dry-run --message-callback '
import re
message = re.sub(br\"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*Generated with \[Claude Code\].*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?\", b\"\", message)
message = re.sub(br\"\n{3,}\", b\"\n\n\", message)
message = message.rstrip() + b\"\n\"
return message
'"

# 4. Review dry run diff
git diff --no-index -- .git/filter-repo/fast-export.original .git/filter-repo/fast-export.filtered | head -300

# 5. Execute for real
nix-shell -p git-filter-repo --run "git filter-repo --message-callback '
import re
message = re.sub(br\"(?m)^Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic).*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*Generated with \[Claude Code\].*\n?\", b\"\", message, flags=re.IGNORECASE)
message = re.sub(br\"(?m)^.*\xf0\x9f\xa4\x96\s*Generated with.*\n?\", b\"\", message)
message = re.sub(br\"\n{3,}\", b\"\n\n\", message)
message = message.rstrip() + b\"\n\"
return message
'"

# 6. Re-add remote and force push
git remote add origin git@github.com:phsb5321/Proso.git

# 7. Temporarily disable branch protection on main (if enabled)
gh api -X DELETE repos/phsb5321/Proso/branches/main/protection 2>/dev/null

# 8. Force push all branches and tags
git push origin --force --all
git push origin --force --tags

# 9. Re-enable branch protection
# (do this via GitHub Settings > Branches)

# 10. Verify
git log --all --format="%H %s%n%b" | grep -i "claude\|anthropic\|Generated with" | wc -l
# Expected: 0
```

**Option B: In-Place (Simpler, Riskier)**

```bash
# 1. Stash any uncommitted work
git stash

# 2. Create backup
git bundle create /tmp/proso-backup-$(date +%Y%m%d).bundle --all

# 3. Run filter-repo with --force
nix-shell -p git-filter-repo --run "git filter-repo --force --message-callback '...same callback...'"

# 4. Re-add remote
git remote add origin git@github.com:phsb5321/Proso.git

# 5. Force push
git push origin --force --all
git push origin --force --tags

# 6. Pop stash
git stash pop
```

### Phase 4: Post-Cleanup Verification

```bash
# Verify commits are clean
git log --all --format="%b" | grep -ic "claude\|anthropic\|Generated with"

# Verify PRs are clean
gh pr list --state all --limit 100 --json number,body | jq '[.[] | select(.body | test("Claude|Generated with|Anthropic"; "i"))] | length'

# Re-clone on all other machines
```

### Phase 5: Request GitHub Garbage Collection (Optional)

For maximum security, contact GitHub Support to request garbage collection of dangling commit objects. This ensures old commit messages containing attribution are permanently purged from GitHub's object store.

---

## 8. Sources

### git filter-repo
- [git-filter-repo Man Page (ManKier)](https://www.mankier.com/1/git-filter-repo)
- [git-filter-repo Documentation (GitHub)](https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt)
- [git-filter-repo Source Code (GitHub)](https://github.com/newren/git-filter-repo)
- [Git Tower: Git Filter-Repo FAQ](https://www.git-tower.com/learn/git/faq/git-filter-repo)
- [Andrew Lock: Rewriting git history with git-filter-repo](https://andrewlock.net/rewriting-git-history-simply-with-git-filter-repo/)
- [Aaron He: Using git filter-repo to rewrite commit history](https://aaronhe.org/git-filter-repo-to-rewrite-commit-history/)
- [Global git hook to strip AI co-author trailers (Gist)](https://gist.github.com/mherod/e9edfb3102ffe19bb973643f077eaa26)

### GitHub Data Retention
- [Neodyme: Hidden GitHub Commits and How to Reveal Them](https://neodyme.io/en/blog/github_secrets/)
- [Truffle Security: Securely Open-Sourcing on GitHub](https://trufflesecurity.com/blog/securely-open-sourcing-on-github)
- [Oasis Security: Why Deleting Git Commits Isn't Enough](https://www.oasis.security/blog/deleting-git-commits-isnt-enough)
- [GitHub Docs: Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [GitHub Blog: Scaling Git's Garbage Collection](https://github.blog/engineering/architecture-optimization/scaling-gits-garbage-collection/)

### GitHub PR Cleanup
- [gh pr edit - CLI Manual](https://cli.github.com/manual/gh_pr_edit)
- [REST API endpoints for pull requests - GitHub Docs](https://docs.github.com/en/rest/pulls/pulls)
- [REST API endpoints for issue comments - GitHub Docs](https://docs.github.com/en/rest/issues/comments)
- [Rate limits for the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### Alternatives Research
- [GitHub Docs: Changing a commit message](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/changing-a-commit-message)
- [Git - git-replace Documentation](https://git-scm.com/docs/git-replace)
- [GitHub Community: Replace refs not fetched when forking](https://github.com/orgs/community/discussions/10404)
- [GitHub Community: How to Remove Yourself as Co-Author](https://github.com/orgs/community/discussions/76660)
- [Tyler Cipriani: Git Notes - git's coolest, most unloved feature](https://tylercipriani.com/blog/2022/11/19/git-notes-gits-coolest-most-unloved-feature/)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

### Force Push Safety
- [DataCamp: Git Push Force - How it Works](https://www.datacamp.com/tutorial/git-push-force)
- [Graphite: Force pushing after a Git rebase](https://graphite.com/guides/git-rebase-force)
- [Git Book: The Perils of Rebasing](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)
- [GitHub Changelog: Events API retention changes](https://github.blog/changelog/2024-11-08-upcoming-changes-to-data-retention-for-events-api-atom-feed-timeline-and-dashboard-feed-features/)
