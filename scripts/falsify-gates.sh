#!/usr/bin/env bash
#
# The gate's own test. ADR-001 §4.7: "a gate that cannot fail is not a gate."
#
# A security pipeline reports green in two situations that look identical from
# the outside — everything is safe, and nothing is being checked. An empty
# repository, a mis-scoped `skip-path`, a renamed flag that silently disables a
# scanner, a `--soft-fail` someone added to unblock a release: all of them
# produce a green tick. This script distinguishes the two by proving the gate
# still goes RED on demand, and it runs in CI on every push, so the proof is
# current rather than a screenshot from the day it was built.
#
# Five assertions:
#   A. Trivy   flags the committed FAIL fixture
#   B. Checkov flags the committed FAIL fixture
#   C. the brief's definition of done, end to end: planting a public S3 bucket
#      into a scanned path turns the pipeline RED; removing it returns GREEN
#   D. the ratchet rejects an undocumented suppression
#   E. the `terraform test` suite fails when the module regresses
#
# Exit 0 only if all five hold.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools trivy uv jq

PLANT_DIR="stacks/_gate-falsification-plant"
SCRATCH="$(mktemp -d)"
COMPLIANT_TF="$FIXTURE_COMPLIANT_DIR/main.tf"

cleanup() {
  rm -rf "$PLANT_DIR"
  # Restore anything an assertion mutated in place, even on Ctrl-C or a crash.
  [[ -f "$SCRATCH/main.tf.orig" ]] && cp "$SCRATCH/main.tf.orig" "$COMPLIANT_TF"
  [[ -f "$SCRATCH/baseline.orig" ]] && cp "$SCRATCH/baseline.orig" "$CHECKOV_BASELINE"
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

assert_fails() {
  local label="$1"; shift
  if "$@" >"$SCRATCH/out" 2>&1; then
    bad "$label — expected FAILURE, got success (the gate is not gating)"
    sed -n '1,20p' "$SCRATCH/out" >&2
  else
    ok "$label — correctly RED"
  fi
}

assert_passes() {
  local label="$1"; shift
  if "$@" >"$SCRATCH/out" 2>&1; then
    ok "$label — correctly GREEN"
  else
    bad "$label — expected success, got failure"
    sed -n '1,40p' "$SCRATCH/out" >&2
  fi
}

# ── A / B: the committed FAIL fixture is still caught ──────────────────────
# Scanned from a COPY outside the repo, on purpose. Both scanners auto-discover
# their config from the working directory (`trivy.yaml`, `.checkov.yml`), and
# both of those configs skip this very directory — so pointing them at the
# fixture in place reports "not scanned" and the assertion would pass for the
# wrong reason. Running from a bare directory takes the repo's skip-paths out of
# the picture and asks the only question A and B are for: does the scanner still
# recognise this content as unsafe?
cp -r "$FIXTURE_VIOLATIONS_DIR" "$SCRATCH/violations"

scan_trivy_isolated()   { (cd "$SCRATCH" && trivy config -q --exit-code 1 --misconfig-scanners terraform violations); }
scan_checkov_isolated() { (cd "$SCRATCH" && checkov -d violations --framework terraform --compact --quiet --skip-download); }

step "A. Trivy flags $FIXTURE_VIOLATIONS_DIR"
assert_fails "trivy vs FAIL fixture" scan_trivy_isolated

step "B. Checkov flags $FIXTURE_VIOLATIONS_DIR"
assert_fails "checkov vs FAIL fixture" scan_checkov_isolated

# ── C: the brief's definition of done ──────────────────────────────────────
# The plant goes into `stacks/`, a path the normal gate scans, so this exercises
# the real skip-path configuration rather than a hand-aimed scanner invocation.
step "C. plant a public S3 bucket into a SCANNED path -> pipeline must go RED"
mkdir -p "$PLANT_DIR"
cat >"$PLANT_DIR/plant.tf" <<'TF'
# Transient plant written by scripts/falsify-gates.sh. Removed on exit.
resource "aws_s3_bucket" "leak" {
  bucket = "proso-falsification-plant"
}

resource "aws_s3_bucket_acl" "leak" {
  bucket = aws_s3_bucket.leak.id
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "leak" {
  bucket                  = aws_s3_bucket.leak.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
TF

assert_fails "planted: gate.sh --stage trivy"   "$REPO_ROOT/scripts/gate.sh" --stage trivy
assert_fails "planted: gate.sh --stage checkov" "$REPO_ROOT/scripts/gate.sh" --stage checkov

step "C. remove the plant -> pipeline must return GREEN"
rm -rf "$PLANT_DIR"
assert_passes "unplanted: gate.sh --stage trivy"   "$REPO_ROOT/scripts/gate.sh" --stage trivy
assert_passes "unplanted: gate.sh --stage checkov" "$REPO_ROOT/scripts/gate.sh" --stage checkov

# ── D: the ratchet rejects an undocumented suppression ─────────────────────
# Without this, `quality-baselines/` is decoration: someone appends a check id
# to the machine baseline, CI goes green, and nobody ever learns why.
step "D. an undocumented suppression must fail check-baseline.sh"
cp "$CHECKOV_BASELINE" "$SCRATCH/baseline.orig"
jq '.failed_checks += [{
      "file": "/policy/fixtures/compliant/main.tf",
      "findings": [{"resource": "aws_s3_bucket.this", "check_ids": ["CKV_AWS_FAKE_999"]}]
    }]' "$SCRATCH/baseline.orig" >"$CHECKOV_BASELINE"

assert_fails "undocumented suppression rejected" "$REPO_ROOT/scripts/check-baseline.sh"
cp "$SCRATCH/baseline.orig" "$CHECKOV_BASELINE"
assert_passes "restored baseline accepted" "$REPO_ROOT/scripts/check-baseline.sh"

# ── E: the terraform test suite can fail ───────────────────────────────────
# The regression this defends against is a config that stays SHAPED correctly
# while resolving to an unsafe VALUE — exactly what the scanners cannot see, so
# it needs its own proof rather than riding on A-D.
step "E. regress the module -> terraform test must fail"
cp "$COMPLIANT_TF" "$SCRATCH/main.tf.orig"
sed -i 's/^  block_public_acls       = true$/  block_public_acls       = false/' "$COMPLIANT_TF"
if ! grep -q 'block_public_acls       = false' "$COMPLIANT_TF"; then
  bad "E setup — could not apply the regression; the sed target moved"
else
  assert_fails "regressed: gate.sh --stage test" "$REPO_ROOT/scripts/gate.sh" --stage test
fi
cp "$SCRATCH/main.tf.orig" "$COMPLIANT_TF"
assert_passes "restored: gate.sh --stage test" "$REPO_ROOT/scripts/gate.sh" --stage test

summarise
