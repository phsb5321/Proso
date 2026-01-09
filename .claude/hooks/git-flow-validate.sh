#!/usr/bin/env bash
# Git Flow Validation Hook
# Validates branch naming, commit format, and protected branch access
# Used as a Stop hook to provide guidance before commits/pushes

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Protected branches
PROTECTED_BRANCHES=("main" "master")

# Output as JSON for Claude Code
output_json() {
    local status="$1"
    local message="$2"
    echo "{\"status\": \"$status\", \"message\": \"$message\"}"
}

# Check if on protected branch
check_protected_branch() {
    for protected in "${PROTECTED_BRANCHES[@]}"; do
        if [[ "$BRANCH" == "$protected" ]]; then
            return 0
        fi
    done
    return 1
}

# Validate branch name format
validate_branch_name() {
    local branch="$1"
    
    # Skip validation for protected branches
    if check_protected_branch; then
        return 0
    fi
    
    # Valid patterns:
    # NNN-feature-name (feature branches)
    # hotfix/NNN-description
    # release/X.Y.Z
    # develop
    
    if [[ "$branch" == "develop" ]]; then
        return 0
    fi
    
    if [[ "$branch" =~ ^[0-9]{3}-[a-z0-9-]+$ ]]; then
        return 0
    fi
    
    if [[ "$branch" =~ ^hotfix/[0-9]{3}-[a-z0-9-]+$ ]]; then
        return 0
    fi
    
    if [[ "$branch" =~ ^release/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        return 0
    fi
    
    return 1
}

# Get last commit message
get_last_commit_message() {
    git log -1 --format="%s" 2>/dev/null || echo ""
}

# Validate conventional commit format
validate_commit_format() {
    local message="$1"
    
    # Conventional commit regex
    # type(scope): description
    # type: description
    if [[ "$message" =~ ^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([a-z0-9-]+\))?!?:\ .+ ]]; then
        return 0
    fi
    
    # Merge commits are allowed
    if [[ "$message" =~ ^Merge\ .* ]]; then
        return 0
    fi
    
    return 1
}

# Check for uncommitted changes
check_uncommitted_changes() {
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
        return 0
    fi
    return 1
}

# Check for unpushed commits
check_unpushed_commits() {
    local upstream
    upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || echo "")
    
    if [[ -z "$upstream" ]]; then
        # No upstream, check if we have local commits
        local commit_count
        commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "0")
        if [[ "$commit_count" -gt 0 ]]; then
            return 0
        fi
    else
        # Has upstream, check for unpushed commits
        local ahead
        ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo "0")
        if [[ "$ahead" -gt 0 ]]; then
            return 0
        fi
    fi
    return 1
}

# Main validation
main() {
    local warnings=()
    local errors=()
    local info=()
    
    # Check if in git repo
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        output_json "skip" "Not in a git repository"
        exit 0
    fi
    
    # Check protected branch
    if check_protected_branch; then
        errors+=("⚠️  You are on protected branch '$BRANCH'. Create a feature branch: git checkout -b NNN-feature-name")
    fi
    
    # Validate branch name (for non-protected branches)
    if ! check_protected_branch && ! validate_branch_name "$BRANCH"; then
        warnings+=("Branch name '$BRANCH' doesn't follow convention. Expected: NNN-feature-name, hotfix/NNN-desc, or release/X.Y.Z")
    fi
    
    # Check uncommitted changes
    if check_uncommitted_changes; then
        info+=("📝 Uncommitted changes detected. Remember to commit with conventional format.")
    fi
    
    # Check unpushed commits
    if check_unpushed_commits; then
        info+=("📤 Unpushed commits detected. Remember to push before creating a PR.")
    fi
    
    # Validate last commit message
    local last_commit
    last_commit=$(get_last_commit_message)
    if [[ -n "$last_commit" ]] && ! validate_commit_format "$last_commit"; then
        warnings+=("Last commit doesn't follow conventional format: '$last_commit'")
    fi
    
    # Build output message
    local message=""
    
    if [[ ${#errors[@]} -gt 0 ]]; then
        message+="ERRORS:\\n"
        for err in "${errors[@]}"; do
            message+="  $err\\n"
        done
    fi
    
    if [[ ${#warnings[@]} -gt 0 ]]; then
        message+="WARNINGS:\\n"
        for warn in "${warnings[@]}"; do
            message+="  $warn\\n"
        done
    fi
    
    if [[ ${#info[@]} -gt 0 ]]; then
        message+="INFO:\\n"
        for inf in "${info[@]}"; do
            message+="  $inf\\n"
        done
    fi
    
    # Output result
    if [[ ${#errors[@]} -gt 0 ]]; then
        output_json "error" "$message"
        exit 1
    elif [[ ${#warnings[@]} -gt 0 ]]; then
        output_json "warning" "$message"
        exit 0
    elif [[ ${#info[@]} -gt 0 ]]; then
        output_json "info" "$message"
        exit 0
    else
        output_json "ok" "Git flow validation passed"
        exit 0
    fi
}

main "$@"
