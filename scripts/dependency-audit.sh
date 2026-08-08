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
#   - an allowlist entry past its review date                         -> exit 1
#   - an allowlist entry that matches nothing any more                -> WARNING
#
# The gate is falsifiable by plant: pin a genuinely reachable vulnerable
# version (e.g. vite 8.0.1 in services/proso-log-gateway), re-run `pnpm install`,
# and this script must exit 1; reverting the pin must restore exit 0.

set -Eeuo pipefail

cd "$(dirname "$0")/.."

ALLOWLIST="quality-baselines/audit-allowlist.json"
report="$(mktemp -t proso-audit.XXXXXXXX.json)"
cleanup() {
  rm -f -- "$report"
}
trap cleanup EXIT INT TERM

# pnpm's exit code is informational here — the verdict is computed from the
# JSON report plus the allowlist, so a no-fix advisory cannot fail the gate
# merely because the scanner is unhappy, and a swallowed advisory cannot pass
# it. A missing/invalid report still fails closed below.
pnpm audit --json --audit-level=high >"$report" || true

python3 - "$ALLOWLIST" "$report" <<'PYEOF'
import datetime
import json
import sys

allowlist_path, report_path = sys.argv[1], sys.argv[2]

with open(allowlist_path, encoding="utf-8") as handle:
    allowlist = json.load(handle)
entries = allowlist.get("entries", [])
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
for advisory_id, advisory in sorted(advisories.items()):
    url = advisory.get("url", "")
    ghsa = url.rsplit("/", 1)[-1] if "/advisories/" in url else advisory_id
    for finding in advisory.get("findings", []):
        for path in finding.get("paths", []):
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
                    f"({advisory['module_name']}@{advisory['vulnerable_versions']})"
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
    print("FAIL: reachable high/critical advisory(ies) not allowlisted:", file=sys.stderr)
    for failure in failures:
        print(f"  {failure}", file=sys.stderr)
    sys.exit(1)

print(
    f"dependency audit: {len(advisories)} high/critical advisory(ies), "
    f"{len(matched)} allowlisted path(s), 0 failures"
)
PYEOF
