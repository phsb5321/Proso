#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly OUTPUT_PATH="${1:-}"
readonly BASE_REF="${DIFF_BASE_REF:-origin/main}"
if [[ -z "$OUTPUT_PATH" ]]; then
  printf 'Usage: %s <output-path>\n' "$0" >&2
  exit 2
fi
for command_name in git; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null || {
  printf 'Required base commit does not exist: %s\n' "$BASE_REF" >&2
  exit 1
}

git diff --no-ext-diff --binary "$BASE_REF" -- >"$OUTPUT_PATH"
while IFS= read -r -d '' file; do
  untracked_diff_status=0
  git diff --no-ext-diff --binary --no-index -- /dev/null "$file" \
    >>"$OUTPUT_PATH" || untracked_diff_status=$?
  if [[ "$untracked_diff_status" -ne 0 && "$untracked_diff_status" -ne 1 ]]; then
    printf 'Could not include untracked file in change bundle: %s\n' "$file" >&2
    exit "$untracked_diff_status"
  fi
done < <(git ls-files --others --exclude-standard -z)

if [[ ! -s "$OUTPUT_PATH" ]]; then
  printf 'Change bundle is empty against %s\n' "$BASE_REF" >&2
  exit 1
fi
