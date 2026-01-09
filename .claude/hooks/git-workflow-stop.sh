#!/usr/bin/env bash
# git-workflow-stop.sh - Stop hook for CRITICAL git workflow blocks only
#
# This hook runs when Claude finishes responding and ONLY blocks for
# truly critical issues that require immediate attention:
# - Uncommitted changes on protected branches (main/master)
# - Accidental work directly on main/master
#
# For non-critical suggestions (unpushed commits, missing PRs),
# this hook does NOT block - that context was already provided
# via the SessionStart hook.
#
# Exit codes:
# - 0: Allow Claude to stop (success, or non-critical issue)
# - 2: Block with error message (critical issue)

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse fields
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Prevent infinite loops - if this hook already ran, exit
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  exit 0
fi

# Change to working directory
if [[ -n "$CWD" ]]; then
  cd "$CWD" || exit 0
fi

# Ensure we're in a git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# CRITICAL CHECK: Working directly on protected branch with uncommitted changes
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  UNCOMMITTED=$(git status --porcelain 2>/dev/null)
  if [[ -n "$UNCOMMITTED" ]]; then
    # This is critical - block and require action
    cat <<EOF
{
  "decision": "block",
  "reason": "CRITICAL: You have uncommitted changes directly on the protected branch '$BRANCH'. This is dangerous - changes should be on a feature branch. Please either:\n1. Stash changes: git stash\n2. Create a feature branch: git checkout -b NNN-feature-name\n3. Or commit carefully if this is intentional maintenance."
}
EOF
    exit 0
  fi
fi

# For all other cases, allow Claude to stop naturally
# Non-critical workflow suggestions were already shown via SessionStart context
exit 0
