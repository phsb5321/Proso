#!/usr/bin/env bash
#
# The ratchet's enforcement half.
#
# Checkov's own baseline file records WHICH findings are suppressed but has
# nowhere to record WHY or UNTIL WHEN — so on its own it is indistinguishable
# from a blanket skip that nobody revisits. This script closes that gap, using
# the same convention as the Proso repo's `quality-baselines/`:
#
#   1. every check suppressed by the machine baseline has a documented entry
#   2. every documented entry carries a substantive reason, not a shrug
#   3. every documented entry carries a reviewDate that has not passed
#   4. nothing is documented that is not actually suppressed (dead entries rot)
#
# Any of the four failing fails the gate. That is the point: an accepted
# finding expires, and expiry is a build failure, not a reminder email.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools jq

TODAY="$(date -u +%Y-%m-%d)"
fail=0
note() { printf '    %s\n' "$*" >&2; fail=1; }

[[ -f "$ACCEPTED_FINDINGS" ]] || { note "missing $ACCEPTED_FINDINGS"; exit 1; }
jq -e . "$ACCEPTED_FINDINGS" >/dev/null || { note "$ACCEPTED_FINDINGS is not valid JSON"; exit 1; }

# Checkov emits an empty-ish baseline (`"failed_checks": []`) rather than no
# file when nothing is suppressed. Treat a missing file as "nothing suppressed".
if [[ -f "$CHECKOV_BASELINE" ]]; then
  jq -e . "$CHECKOV_BASELINE" >/dev/null || { note "$CHECKOV_BASELINE is not valid JSON"; exit 1; }
  suppressed="$(jq -r '
    [.failed_checks[]?.findings[]?.check_ids[]?] | unique | .[]
  ' "$CHECKOV_BASELINE")"
else
  suppressed=""
fi

documented="$(jq -r '.entries[].check' "$ACCEPTED_FINDINGS" | sort -u)"

# (1) suppressed but undocumented — the failure mode this whole file exists for
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  grep -qxF "$id" <<<"$documented" ||
    note "$id is suppressed by $CHECKOV_BASELINE but has no entry in $ACCEPTED_FINDINGS"
done <<<"$suppressed"

# (4) documented but no longer suppressed — the finding was fixed; drop the row
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  grep -qxF "$id" <<<"$suppressed" ||
    note "$id is documented in $ACCEPTED_FINDINGS but is no longer suppressed — delete the entry"
done <<<"$documented"

# (2) + (3) quality of each entry
n="$(jq '.entries | length' "$ACCEPTED_FINDINGS")"
for ((i = 0; i < n; i++)); do
  check=$(jq -r ".entries[$i].check // empty"      "$ACCEPTED_FINDINGS")
  reason=$(jq -r ".entries[$i].reason // empty"    "$ACCEPTED_FINDINGS")
  review=$(jq -r ".entries[$i].reviewDate // empty" "$ACCEPTED_FINDINGS")
  owner=$(jq -r ".entries[$i].owner // empty"      "$ACCEPTED_FINDINGS")

  [[ -n "$check" ]]  || { note "entry[$i]: missing .check"; continue; }
  [[ -n "$owner" ]]  || note "$check: missing .owner"
  # 80 chars is roughly "one real sentence". "not applicable" must not pass.
  ((${#reason} >= 80)) || note "$check: .reason must explain the acceptance in at least 80 chars (got ${#reason})"

  if [[ ! "$review" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    note "$check: .reviewDate must be YYYY-MM-DD (got '${review:-<empty>}')"
  elif [[ "$review" < "$TODAY" ]]; then
    note "$check: acceptance EXPIRED on $review (today $TODAY) — re-evaluate or re-date with fresh evidence"
  fi
done

if ((fail)); then
  exit 1
fi

count=$(wc -w <<<"$suppressed" | tr -d ' ')
printf '    %s accepted finding(s), all documented and in date\n' "$count" >&2
