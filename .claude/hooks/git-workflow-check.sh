#!/usr/bin/env bash
# git-workflow-check.sh - Stop hook for git workflow suggestions
# Checks for uncommitted changes, unpushed commits, and PR opportunities

# Read JSON input from stdin
INPUT=$(cat)

# Parse input fields using jq
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Change to the working directory if provided
if [[ -n "$CWD" ]]; then
  cd "$CWD" || exit 0
fi

# Ensure we're in a git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain 2>/dev/null)
if [[ -n "$UNCOMMITTED" ]]; then
  MODIFIED_COUNT=$(echo "$UNCOMMITTED" | grep -c "^ M\|^M \|^MM")
  UNTRACKED_COUNT=$(echo "$UNCOMMITTED" | grep -c "^??")

  if [[ $MODIFIED_COUNT -gt 0 || $UNTRACKED_COUNT -gt 0 ]]; then
    echo '{"decision": "block", "reason": "You have uncommitted changes. Consider creating an atomic commit using conventional commit format (type(scope): description). Run `git status` to see changes."}'
    exit 0
  fi
fi

# Check for unpushed commits
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)
if [[ -n "$UPSTREAM" ]]; then
  UNPUSHED=$(git log --oneline "$UPSTREAM..HEAD" 2>/dev/null)
  if [[ -n "$UNPUSHED" ]]; then
    COMMIT_COUNT=$(echo "$UNPUSHED" | wc -l | tr -d ' ')
    echo "{\"decision\": \"block\", \"reason\": \"You have $COMMIT_COUNT unpushed commit(s) on branch '$BRANCH'. Consider pushing to remote with: git push\"}"
    exit 0
  fi
fi

# Check if branch is ahead of main (PR opportunity)
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  # Check if there's a PR for this branch
  if command -v gh &>/dev/null; then
    PR_EXISTS=$(gh pr view --json number 2>/dev/null)
    if [[ -z "$PR_EXISTS" ]]; then
      # Check if branch has commits ahead of main
      MAIN_BRANCH="main"
      if ! git rev-parse --verify "$MAIN_BRANCH" &>/dev/null; then
        MAIN_BRANCH="master"
      fi

      if git rev-parse --verify "$MAIN_BRANCH" &>/dev/null; then
        AHEAD=$(git log --oneline "$MAIN_BRANCH..HEAD" 2>/dev/null)
        if [[ -n "$AHEAD" ]]; then
          AHEAD_COUNT=$(echo "$AHEAD" | wc -l | tr -d ' ')
          # Use "notify" instead of "block" to prevent feedback loops on feature branches
          echo "{\"decision\": \"notify\", \"reason\": \"Branch '$BRANCH' is $AHEAD_COUNT commit(s) ahead of $MAIN_BRANCH with no open PR. Consider creating a pull request with: gh pr create\"}"
          exit 0
        fi
      fi
    fi
  fi
fi

# No workflow suggestions needed
exit 0
