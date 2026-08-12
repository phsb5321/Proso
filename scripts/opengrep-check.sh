#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in git mktemp node opengrep; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

readonly BASE_REF="${DIFF_BASE_REF:-origin/main}"
if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  printf 'OpenGrep baseline commit does not exist: %s\n' "$BASE_REF" >&2
  exit 1
fi

readonly FIXTURE_DIR='scripts/quality/fixtures/opengrep'
readonly TEST_LOG="$(mktemp -t proso-opengrep-test.XXXXXXXX.log)"
readonly TEST_REPORT="$(mktemp -t proso-opengrep-test.XXXXXXXX.json)"
readonly REPORT="$(mktemp -t proso-opengrep.XXXXXXXX.json)"
cleanup() {
  rm -f -- "$TEST_LOG" "$TEST_REPORT" "$REPORT"
}
trap cleanup EXIT INT TERM

if ! opengrep scan \
  --config .opengrep.yml \
  --quiet \
  --json-output="$TEST_REPORT" \
  "$FIXTURE_DIR" >"$TEST_LOG" 2>&1; then
  cat "$TEST_LOG" >&2
  exit 1
fi
node -e '
  const fs = require("node:fs");
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const counts = new Map();
  for (const result of report.results ?? []) {
    counts.set(result.check_id, (counts.get(result.check_id) ?? 0) + 1);
  }
  const expected = new Map([
    ["proso.workflow-continue-on-error", 1],
    ["proso.codecov-fail-open", 1],
    ["proso.focused-or-skipped-test", 2],
    ["proso.shell-success-mask", 1],
    ["proso.raw-numeric-z-index", 2],
  ]);
  for (const [rule, count] of expected) {
    if (counts.get(rule) !== count) {
      throw new Error(`OpenGrep self-test expected ${count} ${rule} finding(s), got ${counts.get(rule) ?? 0}`);
    }
  }
  if (report.errors?.length > 0) throw new Error("OpenGrep self-test reported scan errors");
' "$TEST_REPORT"

# Under --baseline-commit the scan follows the changed-file set rather than the listed
# paths, so the detector fixtures above enter the repository scan once they are tracked.
# Excluding only that directory keeps every real path scanned; the self-test still proves
# the rules fire on it.
opengrep scan \
  --baseline-commit="$BASE_REF" \
  --config .opengrep.yml \
  --error \
  --exclude="$FIXTURE_DIR" \
  --exclude=specs \
  --json-output="$REPORT" \
  .github/workflows packages services

node -e '
  const fs = require("node:fs");
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(report.results) || !Array.isArray(report.errors)) {
    throw new Error("OpenGrep report has an invalid schema");
  }
  if (report.errors.length > 0) {
    throw new Error(`OpenGrep reported ${report.errors.length} scan error(s)`);
  }
' "$REPORT"
