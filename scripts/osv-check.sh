#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in git jq mktemp node; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

if command -v osv-scanner >/dev/null 2>&1; then
  scanner="$(command -v osv-scanner)"
elif command -v nix >/dev/null 2>&1; then
  scanner_root="$(nix build --no-link --print-out-paths nixpkgs#osv-scanner)"
  scanner="$scanner_root/bin/osv-scanner"
else
  printf 'osv-scanner is required (directly or through nixpkgs#osv-scanner)\n' >&2
  exit 1
fi
[[ -x "$scanner" ]] || {
  printf 'Resolved OSV scanner is not executable: %s\n' "$scanner" >&2
  exit 1
}

report="$(mktemp -t proso-osv.XXXXXXXX.json)"
cleanup() {
  rm -f -- "$report"
}
trap cleanup EXIT INT TERM

scan_status=0
"$scanner" scan source --lockfile=pnpm-lock.yaml --format=json \
  --output="$report" --verbosity=error || scan_status=$?
if [[ "$scan_status" -ne 0 && "$scan_status" -ne 1 ]]; then
  printf 'OSV scanner failed with status %s\n' "$scan_status" >&2
  exit "$scan_status"
fi
jq -e '.results | type == "array"' "$report" >/dev/null || {
  printf 'OSV scanner did not produce a valid report\n' >&2
  exit 1
}

node scripts/quality/osv-ratchet.mjs "$report"
