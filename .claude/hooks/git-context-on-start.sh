#!/usr/bin/env bash
# git-context-on-start.sh - SessionStart hook for git context injection
# Provides git status context at session start WITHOUT blocking
#
# This hook runs when Claude Code starts and injects context about:
# - Current branch name
# - Uncommitted changes count
# - Unpushed commits count
# - Whether a PR exists for the branch
#
# Output goes to Claude's context (not shown to user unless verbose mode)

set -e

# Read JSON input from stdin (required by Claude Code hooks)
INPUT=$(cat)

# Parse working directory
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [[ -n "$CWD" ]]; then
  cd "$CWD" || exit 0
fi

# Ensure we're in a git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Gather git information
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")

UNPUSHED=0
if [[ -n "$UPSTREAM" ]]; then
  UNPUSHED=$(git log --oneline "$UPSTREAM..HEAD" 2>/dev/null | wc -l | tr -d ' ')
fi

# Check for PR (only if gh is available)
PR_STATUS="none"
if command -v gh &>/dev/null; then
  if gh pr view --json number &>/dev/null; then
    PR_URL=$(gh pr view --json url -q '.url' 2>/dev/null || echo "")
    PR_STATUS="exists: $PR_URL"
  fi
fi

# Detect main branch
MAIN_BRANCH="main"
if ! git rev-parse --verify main &>/dev/null; then
  if git rev-parse --verify master &>/dev/null; then
    MAIN_BRANCH="master"
  fi
fi

# Calculate commits ahead of main (for feature branches)
AHEAD_OF_MAIN=0
if [[ "$BRANCH" != "$MAIN_BRANCH" ]]; then
  AHEAD_OF_MAIN=$(git log --oneline "$MAIN_BRANCH..HEAD" 2>/dev/null | wc -l | tr -d ' ')
fi

# Output context as JSON (added to Claude's context via hookSpecificOutput)
# This is the recommended format for SessionStart hooks
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## Git Status Context\n- **Branch**: $BRANCH\n- **Uncommitted changes**: $UNCOMMITTED file(s)\n- **Unpushed commits**: $UNPUSHED\n- **Commits ahead of $MAIN_BRANCH**: $AHEAD_OF_MAIN\n- **Pull Request**: $PR_STATUS\n\nUse the voxpage-git-workflow skill for commit/push/PR operations."
  }
}
EOF
