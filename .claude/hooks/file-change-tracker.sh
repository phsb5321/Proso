#!/usr/bin/env bash
# file-change-tracker.sh - PostToolUse hook for tracking implementation file changes
# Monitors Write and Edit operations on implementation files

# Read JSON input from stdin
INPUT=$(cat)

# Parse input fields using jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Only process Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Extract file path from tool input
FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Check if this is an implementation file (not test, config, or docs)
IS_IMPLEMENTATION=false

# Implementation directories for Proso
IMPL_PATTERNS=(
  "background/"
  "content/"
  "popup/"
  "options/"
  "shared/"
)

# Exclude patterns (tests, config, docs)
EXCLUDE_PATTERNS=(
  "tests/"
  "test/"
  ".test."
  ".spec."
  "node_modules/"
  ".claude/"
  "specs/"
  ".md"
)

# Check if file matches implementation patterns
for pattern in "${IMPL_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    IS_IMPLEMENTATION=true
    break
  fi
done

# Check exclusions
if [[ "$IS_IMPLEMENTATION" == true ]]; then
  for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    if [[ "$FILE_PATH" == *"$pattern"* ]]; then
      IS_IMPLEMENTATION=false
      break
    fi
  done
fi

# If implementation file was modified, output a note (non-blocking)
if [[ "$IS_IMPLEMENTATION" == true ]]; then
  # Extract just the filename for cleaner output
  FILENAME=$(basename "$FILE_PATH")

  # Get the directory component for scope suggestion
  if [[ "$FILE_PATH" == *"background/"* ]]; then
    SCOPE="background"
  elif [[ "$FILE_PATH" == *"content/"* ]]; then
    SCOPE="content"
  elif [[ "$FILE_PATH" == *"popup/"* ]]; then
    SCOPE="popup"
  elif [[ "$FILE_PATH" == *"options/"* ]]; then
    SCOPE="options"
  elif [[ "$FILE_PATH" == *"shared/config/"* ]]; then
    SCOPE="config"
  elif [[ "$FILE_PATH" == *"shared/"* ]]; then
    SCOPE="shared"
  else
    SCOPE=""
  fi

  # Non-blocking response - just a note for tracking
  # The Stop hook will handle commit suggestions
  echo "{\"note\": \"Implementation file modified: $FILENAME (scope: $SCOPE)\"}"
fi

exit 0
