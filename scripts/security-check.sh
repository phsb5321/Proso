#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in git gitleaks mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

readonly BASE_REF="${DIFF_BASE_REF:-origin/main}"
if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  printf 'Gitleaks baseline commit does not exist: %s\n' "$BASE_REF" >&2
  exit 1
fi

gitleaks git \
  --no-banner \
  --no-color \
  --redact=100 \
  --log-opts="${BASE_REF}..HEAD" \
  .

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
