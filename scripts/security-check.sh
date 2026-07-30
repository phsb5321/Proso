#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in git gitleaks mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

SCAN_ROOT="$(mktemp -d -t proso-gitleaks.XXXXXXXX)"
readonly SCAN_ROOT
cleanup() {
  rm -rf -- "$SCAN_ROOT"
}
trap cleanup EXIT INT TERM

while IFS= read -r -d '' source_path; do
  [[ -f "$source_path" ]] || continue
  destination_path="$SCAN_ROOT/$source_path"
  mkdir -p -- "$(dirname "$destination_path")"
  cp -- "$source_path" "$destination_path"
done < <(git ls-files --cached --others --exclude-standard -z)

(
  cd "$SCAN_ROOT"
  gitleaks dir --no-banner --no-color --redact=100 --verbose .
)
