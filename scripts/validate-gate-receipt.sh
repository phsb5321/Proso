#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in cut date git jq mktemp rm sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

readonly RECEIPT_PATH="${GATE_RECEIPT_PATH:-$(git rev-parse --git-path proso-gate-receipt.json)}"
[[ -r "$RECEIPT_PATH" ]] || {
  printf 'Deterministic gate receipt is missing: %s\n' "$RECEIPT_PATH" >&2
  exit 1
}
readonly BUNDLE_PATH="$(mktemp -t proso-gate-bundle.XXXXXXXX.patch)"
cleanup() {
  rm -f -- "$BUNDLE_PATH"
}
trap cleanup EXIT INT TERM

jq -e '
  .schemaVersion == 1
  and .command == "make verify-full"
  and (.head | type == "string")
  and (.baseRef | type == "string")
  and (.baseSha | type == "string")
  and (.diffSha256 | type == "string")
  and (.verifiedAt | type == "string")
' "$RECEIPT_PATH" >/dev/null || {
  printf 'Deterministic gate receipt has an invalid schema\n' >&2
  exit 1
}

# `type == "string"` above accepts any string, so a receipt could carry a
# nonsense verification time and still validate. Round-trip it through `date`:
# the value must both parse as UTC and re-render to exactly what was recorded,
# which rejects malformed and non-canonical timestamps alike.
readonly RECEIPT_VERIFIED_AT="$(jq -r '.verifiedAt' "$RECEIPT_PATH")"
if [[ "$(date -u -d "$RECEIPT_VERIFIED_AT" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)" \
  != "$RECEIPT_VERIFIED_AT" ]]; then
  printf 'Gate receipt verifiedAt is not a UTC ISO-8601 timestamp: %s\n' \
    "$RECEIPT_VERIFIED_AT" >&2
  exit 1
fi

readonly RECEIPT_BASE="$(jq -r '.baseRef' "$RECEIPT_PATH")"
readonly RECEIPT_BASE_SHA="$(jq -r '.baseSha' "$RECEIPT_PATH")"
# Default the expected base rather than skipping the check when the caller does
# not name one. `write-gate-receipt.sh` honours DIFF_BASE_REF, so an unpinned
# validator accepted a receipt recorded against HEAD^ — and `adversarial-review.sh`
# then bundles that same baseRef, showing the reviewer a fraction of the change.
readonly EXPECTED_BASE_REF="${DIFF_BASE_REF:-origin/main}"
if [[ "$EXPECTED_BASE_REF" != "$RECEIPT_BASE" ]]; then
  printf 'Gate receipt base mismatch: expected %s, got %s\n' \
    "$EXPECTED_BASE_REF" "$RECEIPT_BASE" >&2
  exit 1
fi
readonly EXPECTED_BASE_SHA="$(git rev-parse "${RECEIPT_BASE}^{commit}")"
if [[ "$RECEIPT_BASE_SHA" != "$EXPECTED_BASE_SHA" ]]; then
  printf 'Stale gate base: %s resolved to %s, receipt recorded %s\n' \
    "$RECEIPT_BASE" "$EXPECTED_BASE_SHA" "$RECEIPT_BASE_SHA" >&2
  exit 1
fi

DIFF_BASE_REF="$RECEIPT_BASE" ./scripts/change-bundle.sh "$BUNDLE_PATH"
readonly EXPECTED_HEAD="$(git rev-parse HEAD)"
readonly EXPECTED_DIFF="$(sha256sum "$BUNDLE_PATH" | cut -d ' ' -f 1)"
readonly RECEIPT_HEAD="$(jq -r '.head' "$RECEIPT_PATH")"
readonly RECEIPT_DIFF="$(jq -r '.diffSha256' "$RECEIPT_PATH")"

if [[ "$RECEIPT_HEAD" != "$EXPECTED_HEAD" || "$RECEIPT_DIFF" != "$EXPECTED_DIFF" ]]; then
  printf 'Stale deterministic gate receipt: expected HEAD=%s diff=%s; got HEAD=%s diff=%s\n' \
    "$EXPECTED_HEAD" "$EXPECTED_DIFF" "$RECEIPT_HEAD" "$RECEIPT_DIFF" >&2
  exit 1
fi
printf 'Validated gate receipt: HEAD=%s base=%s@%s diff_sha256=%s\n' \
  "$EXPECTED_HEAD" "$RECEIPT_BASE" "$EXPECTED_BASE_SHA" "$EXPECTED_DIFF"
