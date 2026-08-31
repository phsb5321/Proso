#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in cut date git jq mktemp mv rm sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

RECEIPT_PATH="${GATE_RECEIPT_PATH:-$(git rev-parse --git-path proso-gate-receipt.json)}"
readonly RECEIPT_PATH
readonly BASE_REF="${DIFF_BASE_REF:-origin/main}"
BUNDLE_PATH="$(mktemp -t proso-gate-bundle.XXXXXXXX.patch)"
readonly BUNDLE_PATH
RECEIPT_TEMP="$(mktemp "${RECEIPT_PATH}.XXXXXXXX")"
readonly RECEIPT_TEMP
cleanup() {
  rm -f -- "$BUNDLE_PATH" "$RECEIPT_TEMP"
}
trap cleanup EXIT INT TERM

./scripts/change-bundle.sh "$BUNDLE_PATH"
HEAD_SHA="$(git rev-parse HEAD)"
readonly HEAD_SHA
BASE_SHA="$(git rev-parse "${BASE_REF}^{commit}")"
readonly BASE_SHA
DIFF_SHA="$(sha256sum "$BUNDLE_PATH" | cut -d ' ' -f 1)"
readonly DIFF_SHA
VERIFIED_AT="$(date --utc '+%Y-%m-%dT%H:%M:%SZ')"
readonly VERIFIED_AT

jq -n \
  --arg head "$HEAD_SHA" \
  --arg baseRef "$BASE_REF" \
  --arg baseSha "$BASE_SHA" \
  --arg diffSha256 "$DIFF_SHA" \
  --arg verifiedAt "$VERIFIED_AT" \
  '{
    schemaVersion: 1,
    command: "make verify-full",
    head: $head,
    baseRef: $baseRef,
    baseSha: $baseSha,
    diffSha256: $diffSha256,
    verifiedAt: $verifiedAt
  }' >"$RECEIPT_TEMP"
mv -- "$RECEIPT_TEMP" "$RECEIPT_PATH"
printf 'Gate receipt: HEAD=%s base=%s@%s diff_sha256=%s\n' \
  "$HEAD_SHA" "$BASE_REF" "$BASE_SHA" "$DIFF_SHA"
