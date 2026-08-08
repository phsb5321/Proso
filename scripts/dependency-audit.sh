#!/usr/bin/env bash

# Fail-closed dependency audit gate (PROSO-3), reachability-aware (PROSO-88).
#
# Mirrors the CI security-audit job's command (`pnpm audit --audit-level=high`)
# without its `continue-on-error: true`: any high or critical advisory that can
# reach a user exits non-zero and fails the build. The CI job's continue-on-error
# removal is a separately gated workflow change (.github/workflows/ci.yml) —
# until then this local gate is the enforceable audit, and no green CI job is
# security evidence.
#
# Reachability (PROSO-88): `quality-baselines/audit-allowlist.json` carries the
# ONLY way a high/critical advisory can pass — an exact (GHSA id, dependency
# path) pair, each with a written reason why that path cannot reach a user and a
# review date. There are no bare GHSA wildcards and no blanket dev-dependency
# exemption: a dev dependency with a reachable exploit path still fails.
#
# Fail-closed rules:
#   - any high/critical advisory not allowlisted                      -> exit 1
#   - an allowlisted advisory found on a DIFFERENT path               -> exit 1
#   - an advisory with NO dependency path at all                      -> exit 1
#     (reachability cannot be established — a pathless advisory is never
#     silently allowed and never allowlistable by GHSA id alone)
#   - an allowlist entry past its review date                         -> exit 1
#   - a malformed allowlist entry (missing/bad field)                 -> exit 1
#   - an allowlist entry that matches nothing any more                -> WARNING
#
# A permanent self-test runs before the real audit: a synthetic report with a
# pathless high advisory must fail closed. If it ever passes, the gate's own
# logic has regressed and the gate refuses to run (the PROSO-88 blocker plant).
#
# The gate is falsifiable by plant: re-pin a genuinely reachable vulnerable
# version (e.g. vite 8.0.1 in services/proso-log-gateway), re-run `pnpm install`,
# and this script must exit 1; reverting the pin must restore exit 0.

set -Eeuo pipefail

cd "$(dirname "$0")/.."

ALLOWLIST="quality-baselines/audit-allowlist.json"

# The verdict: exit 0 = every high/critical advisory is allowlisted on its exact
# path; exit 1 = anything failed closed. Takes the pnpm audit JSON report path.
run_verdict() {
  python3 - "$ALLOWLIST" "$1" <<'PYEOF'
import datetime
import json
import sys

allowlist_path, report_path = sys.argv[1], sys.argv[2]

# 0. Allowlist shape: a malformed entry fails closed with a clear message
#    (never a bare traceback that CI could misread).
with open(allowlist_path, encoding="utf-8") as handle:
    allowlist = json.load(handle)
entries = allowlist.get("entries", [])
required = {"ghsa", "path", "reason", "reviewDate"}
for entry in entries:
    missing = required - set(entry.keys())
    if missing:
        print(
            f"INVALID allowlist entry: {entry.get('ghsa', '<no ghsa>')} "
            f"missing field(s) {sorted(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        datetime.date.fromisoformat(entry["reviewDate"])
    except (TypeError, ValueError) as error:
        print(
            f"INVALID allowlist entry: {entry['ghsa']} on {entry['path']} — "
            f"reviewDate {entry['reviewDate']!r} is not a valid ISO date: {error}",
            file=sys.stderr,
        )
        sys.exit(1)
allowed = {(entry["ghsa"], entry["path"]): entry for entry in entries}

with open(report_path, encoding="utf-8") as handle:
    report = json.load(handle)
advisories = report.get("advisories", {})

today = datetime.date.today()

# 1. Expiry: an entry past its review date fails the gate, naming the entry.
expired = [
    entry
    for entry in entries
    if datetime.date.fromisoformat(entry["reviewDate"]) < today
]
if expired:
    for entry in expired:
        print(
            f"EXPIRED allowlist entry: {entry['ghsa']} on {entry['path']} "
            f"— review date {entry['reviewDate']} passed; re-verify reachability "
            "or remove the entry",
            file=sys.stderr,
        )
    sys.exit(1)

# 2. Match every high/critical advisory path against the allowlist.
failures = []
matched = set()
with_paths = set()
for advisory_id, advisory in sorted(advisories.items()):
    url = advisory.get("url", "")
    ghsa = url.rsplit("/", 1)[-1] if "/advisories/" in url else advisory_id
    paths = []
    for finding in advisory.get("findings", []):
        for path in finding.get("paths", []):
            paths.append(path)
    if not paths:
        # A pathless advisory can be neither matched nor reasoned about: it
        # fails closed rather than passing invisibly.
        failures.append(
            f"{ghsa} ({advisory.get('module_name', '?')}@"
            f"{advisory.get('vulnerable_versions', '?')}) reported with no "
            "dependency path — reachability cannot be established"
        )
        continue
    with_paths.add(advisory_id)
    for path in paths:
        key = (ghsa, path)
        if key in allowed:
            matched.add(key)
            print(
                f"  allowed {ghsa} on {path} "
                f"(review {allowed[key]['reviewDate']})"
            )
        else:
            failures.append(
                f"{ghsa} on {path} "
                f"({advisory.get('module_name', '?')}@"
                f"{advisory.get('vulnerable_versions', '?')})"
            )

# 3. Staleness: an allowlisted entry matching nothing is debt — say so loudly.
for entry in entries:
    if (entry["ghsa"], entry["path"]) not in matched:
        print(
            f"WARNING: stale allowlist entry {entry['ghsa']} on {entry['path']} "
            "no longer matches any advisory — remove it",
            file=sys.stderr,
        )

if failures:
    print("FAIL: high/critical advisory(ies) not allowlisted or unassessable:", file=sys.stderr)
    for failure in failures:
        print(f"  {failure}", file=sys.stderr)
    sys.exit(1)

print(
    f"dependency audit: {len(advisories)} high/critical advisory(ies), "
    f"{len(matched)} allowlisted path(s), 0 failures"
)
PYEOF
}

# Permanent self-test (PROSO-88 blocker plant): a synthetic report with a high
# advisory that carries NO dependency path must fail closed. If the verdict
# logic ever regresses on this hole, the gate refuses to run at all.
synthetic="$(mktemp -t proso-audit-selftest.XXXXXXXX.json)"
cleanup_self() {
  rm -f -- "$synthetic"
}
trap cleanup_self EXIT INT TERM
printf '%s\n' \
  '{"advisories":{"999":{"url":"https://github.com/advisories/GHSA-fake-fake-fake",' \
  '"module_name":"plant","vulnerable_versions":"*","findings":[]}}}' \
  >"$synthetic"
if run_verdict "$synthetic" >/dev/null 2>&1; then
  printf 'dependency audit SELF-TEST FAILED: a pathless high advisory passed — gate logic regressed; refusing to run.\n' >&2
  exit 1
fi
printf 'dependency audit self-test: pathless high advisory correctly fails closed.\n'
trap - EXIT INT TERM

report="$(mktemp -t proso-audit.XXXXXXXX.json)"
cleanup() {
  rm -f -- "$report"
}
trap cleanup EXIT INT TERM

# pnpm's exit code carries the scanner's own verdict (0 = nothing at level,
# 1 = something at level) — but the JSON report plus the allowlist is the
# authoritative decision, so both 0 and 1 proceed to the verdict below. ANY
# other exit (network failure, corrupt registry, missing pnpm) fails closed:
# a tooling error must never read as a clean audit.
set +e
pnpm audit --json --audit-level=high >"$report"
pnpm_exit=$?
set -e
if [ "$pnpm_exit" -ne 0 ] && [ "$pnpm_exit" -ne 1 ]; then
  printf 'dependency audit FAILED to run (pnpm audit exit %s) — failing closed.\n' "$pnpm_exit" >&2
  exit 1
fi

run_verdict "$report"
