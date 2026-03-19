#!/usr/bin/env bash
#
# remove-ai-attribution.sh
#
# Removes AI attribution text from GitHub PR descriptions and PR/issue comments.
# Targets patterns like:
#   - "Generated with [Claude Code]" (and surrounding lines)
#   - "Co-Authored-By:.*Claude" lines
#   - The robot emoji line preceding "Generated with"
#
# Usage:
#   ./scripts/remove-ai-attribution.sh [--dry-run] [--comments] [--repo OWNER/REPO]
#
# Options:
#   --dry-run     Show what would be changed without making changes
#   --comments    Also scan and update PR/issue comments
#   --repo        Target a specific repo (default: current repo)
#
# Requirements: gh CLI authenticated, jq installed

set -euo pipefail

# --- Configuration ---
DRY_RUN=false
SCAN_COMMENTS=false
REPO=""
DELAY_SECONDS=1  # Delay between API writes to avoid secondary rate limits

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --comments)  SCAN_COMMENTS=true; shift ;;
    --repo)      REPO="$2"; shift 2 ;;
    -h|--help)
      head -20 "$0" | tail -18
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Resolve repo
if [[ -z "$REPO" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null)
  if [[ -z "$REPO" ]]; then
    echo "ERROR: Could not determine repository. Use --repo OWNER/REPO" >&2
    exit 1
  fi
fi

echo "=== AI Attribution Removal Script ==="
echo "Repository: $REPO"
echo "Dry run:    $DRY_RUN"
echo "Comments:   $SCAN_COMMENTS"
echo ""

# --- Helper: clean body text ---
# Removes AI attribution patterns from a string.
# Patterns removed:
#   1. Lines containing "Generated with [Claude Code]" and the URL line
#   2. Lines containing "Co-Authored-By:.*Claude" (case-insensitive)
#   3. The emoji robot line (🤖) if it precedes "Generated with"
#   4. Trailing blank lines left behind
clean_body() {
  local body="$1"
  echo "$body" | sed -E \
    -e '/🤖.*Generated with/d' \
    -e '/Generated with \[Claude Code\]/d' \
    -e '/Generated with \[Claude/d' \
    -e '/Co-Authored-By:.*[Cc]laude/d' \
    -e '/co-authored-by:.*[Cc]laude/Id' \
    | sed -e :a -e '/^\n*$/{$d;N;ba;}'  # Remove trailing blank lines
}

# --- Counters ---
PR_SCANNED=0
PR_UPDATED=0
PR_SKIPPED=0
COMMENT_SCANNED=0
COMMENT_UPDATED=0

# ============================================================
# PART 1: Scan and update PR descriptions
# ============================================================
echo "--- Fetching all PRs (open, closed, merged) ---"

# gh pr list --state all returns up to --limit PRs. Use a high limit.
PR_DATA=$(gh pr list --repo "$REPO" --state all --limit 5000 --json number,title,body,state)

PR_COUNT=$(echo "$PR_DATA" | jq 'length')
echo "Found $PR_COUNT pull requests."
echo ""

for i in $(seq 0 $((PR_COUNT - 1))); do
  PR_NUMBER=$(echo "$PR_DATA" | jq -r ".[$i].number")
  PR_TITLE=$(echo "$PR_DATA" | jq -r ".[$i].title")
  PR_STATE=$(echo "$PR_DATA" | jq -r ".[$i].state")
  PR_BODY=$(echo "$PR_DATA" | jq -r ".[$i].body // \"\"")

  PR_SCANNED=$((PR_SCANNED + 1))

  # Check if body contains AI attribution patterns
  if echo "$PR_BODY" | grep -qiE '(Generated with \[Claude|Co-Authored-By:.*Claude)'; then
    CLEANED=$(clean_body "$PR_BODY")

    # Check if anything actually changed
    if [[ "$CLEANED" == "$PR_BODY" ]]; then
      echo "  [SKIP] PR #$PR_NUMBER ($PR_STATE) - pattern matched but no change after cleaning"
      PR_SKIPPED=$((PR_SKIPPED + 1))
      continue
    fi

    echo "  [MATCH] PR #$PR_NUMBER ($PR_STATE): $PR_TITLE"

    if [[ "$DRY_RUN" == "true" ]]; then
      echo "          Would update body (dry run)"
      # Show diff preview
      diff <(echo "$PR_BODY") <(echo "$CLEANED") || true
      echo ""
    else
      # Update the PR body using gh api to handle all states (including merged)
      gh api "repos/$REPO/pulls/$PR_NUMBER" \
        -X PATCH \
        --input <(jq -n --arg body "$CLEANED" '{"body": $body}') \
        > /dev/null

      echo "          Updated successfully."
      sleep "$DELAY_SECONDS"
    fi

    PR_UPDATED=$((PR_UPDATED + 1))
  fi
done

echo ""
echo "--- PR Description Summary ---"
echo "  Scanned:  $PR_SCANNED"
echo "  Updated:  $PR_UPDATED"
echo "  Skipped:  $PR_SKIPPED"
echo ""

# ============================================================
# PART 2: Scan and update PR/issue comments (optional)
# ============================================================
if [[ "$SCAN_COMMENTS" == "true" ]]; then
  echo "--- Scanning PR/issue comments ---"

  # Iterate over PRs that exist to check their comments
  for i in $(seq 0 $((PR_COUNT - 1))); do
    PR_NUMBER=$(echo "$PR_DATA" | jq -r ".[$i].number")
    PR_TITLE=$(echo "$PR_DATA" | jq -r ".[$i].title")

    # Fetch comments for this PR (PRs are also issues in GitHub's API)
    COMMENTS=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments" --paginate 2>/dev/null || echo "[]")
    COMMENT_COUNT=$(echo "$COMMENTS" | jq 'length')

    for j in $(seq 0 $((COMMENT_COUNT - 1))); do
      COMMENT_ID=$(echo "$COMMENTS" | jq -r ".[$j].id")
      COMMENT_BODY=$(echo "$COMMENTS" | jq -r ".[$j].body // \"\"")

      COMMENT_SCANNED=$((COMMENT_SCANNED + 1))

      if echo "$COMMENT_BODY" | grep -qiE '(Generated with \[Claude|Co-Authored-By:.*Claude)'; then
        CLEANED=$(clean_body "$COMMENT_BODY")

        if [[ "$CLEANED" == "$COMMENT_BODY" ]]; then
          continue
        fi

        echo "  [MATCH] PR #$PR_NUMBER comment $COMMENT_ID"

        if [[ "$DRY_RUN" == "true" ]]; then
          echo "          Would update comment (dry run)"
        else
          gh api "repos/$REPO/issues/comments/$COMMENT_ID" \
            -X PATCH \
            --input <(jq -n --arg body "$CLEANED" '{"body": $body}') \
            > /dev/null

          echo "          Updated successfully."
          sleep "$DELAY_SECONDS"
        fi

        COMMENT_UPDATED=$((COMMENT_UPDATED + 1))
      fi
    done
  done

  echo ""
  echo "--- Comment Summary ---"
  echo "  Scanned:  $COMMENT_SCANNED"
  echo "  Updated:  $COMMENT_UPDATED"
fi

# ============================================================
# PART 3: Check git log for Co-Authored-By in commits
# ============================================================
echo ""
echo "--- Git Commit Trailers (informational only) ---"
echo "NOTE: Git commit messages CANNOT be rewritten on GitHub without force-push."
echo "      The following commits contain Co-Authored-By Claude trailers:"
echo ""

# This is read-only; just informational
git log --all --grep="Co-Authored-By.*Claude" --oneline 2>/dev/null | head -20 || echo "  (none found or not in a git repo)"

echo ""
echo "=== Done ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "This was a DRY RUN. No changes were made. Re-run without --dry-run to apply."
fi
