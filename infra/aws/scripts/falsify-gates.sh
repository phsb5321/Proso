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
# Eight assertions:
#   A. Trivy   flags the committed FAIL fixture
#   B. Checkov flags the committed FAIL fixture
#   C. the brief's definition of done, end to end: planting a public S3 bucket
#      into a scanned path turns the pipeline RED; removing it returns GREEN
#   D. the ratchet rejects an undocumented suppression
#   E. the `terraform test` suite fails when the module regresses
#   F. the secret scanner flags a planted credential
#   G. the stack policy requires root-discovered CI, rejects an unclassified
#      stack, and refuses to let the never-apply stack be applied or drift-planned
#   H. Checkov rejects Terraform it cannot parse instead of scanning around it
#
# Exit 0 only if all eight hold.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools trivy uv jq

GIT_ROOT="$(git rev-parse --show-toplevel)"
CI_WORKFLOW="$GIT_ROOT/.forgejo/workflows/terraform-ci.yml"

PLANT_DIR="stacks/_gate-falsification-plant"
SECRET_PLANT=".gate-falsification-secret.txt"
STACK_POLICY="policy/stack-policy.json"
# Assertion G needs a stack directory git does NOT ignore, or check-stack-policy
# correctly treats it as scratch and the assertion cannot fail.
POLICY_PLANT_DIR="stacks/99-falsification-unclassified"
SCRATCH="$(mktemp -d)"
COMPLIANT_TF="$FIXTURE_COMPLIANT_DIR/main.tf"

# Refuse to run rather than delete someone else's directory. The cleanup below
# does `rm -rf "$PLANT_DIR"`, which would be destructive if another tab (or an
# earlier crashed run) had put real work at that path. ADR-001 §4.6: destructive
# operations are never autonomous — that applies to the local tree too.
if [[ -e "$POLICY_PLANT_DIR" ]]; then
  log "$POLICY_PLANT_DIR already exists; refusing to delete a directory this run did not create."
  exit 2
fi

if [[ -e "$PLANT_DIR" ]]; then
  log "$PLANT_DIR already exists."
  log "This script creates and deletes that exact path. Inspect it and move it"
  log "aside by hand; refusing to delete a directory this run did not create."
  exit 2
fi

# Snapshots are taken UP FRONT, not next to the mutation, so a crash between the
# two cannot leave the tree dirty. Restoring an unmodified file is a no-op, so
# taking them unconditionally costs nothing.
cp "$COMPLIANT_TF" "$SCRATCH/main.tf.orig"
cp "$CHECKOV_BASELINE" "$SCRATCH/baseline.orig"
cp "$STACK_POLICY" "$SCRATCH/stack-policy.orig"
cp "$CI_WORKFLOW" "$SCRATCH/ci.yml.orig"

cleanup() {
  rm -rf "$PLANT_DIR" "$POLICY_PLANT_DIR"
  rm -f "$SECRET_PLANT"
  cp "$SCRATCH/main.tf.orig" "$COMPLIANT_TF"
  cp "$SCRATCH/baseline.orig" "$CHECKOV_BASELINE"
  cp "$SCRATCH/stack-policy.orig" "$STACK_POLICY"
  cp "$SCRATCH/ci.yml.orig" "$CI_WORKFLOW"
  rm -rf "$SCRATCH"
}
# INT/TERM as well as EXIT: bash runs an EXIT trap on a normal or `set -e` exit,
# but a Ctrl-C without these would leave the regressed main.tf in place. SIGKILL
# remains unrecoverable, which is why $PLANT_DIR is also in .gitignore — a
# killed run cannot leave a public bucket staged for commit.
trap cleanup EXIT INT TERM

# Two arguments before the command: a label, and a pattern the output MUST
# contain. A bare "exit code was nonzero" is not proof the gate worked — a
# scanner that crashed on a missing policy bundle, a `terraform init` that could
# not reach the registry, or a typo in the script itself all exit nonzero and
# would sail through as "correctly RED". The pattern pins the failure to the
# specific finding this assertion is about.
assert_fails() {
  local label="$1" expect="$2"; shift 2
  if "$@" >"$SCRATCH/out" 2>&1; then
    bad "$label — expected FAILURE, got success (the gate is not gating)"
    sed -n '1,20p' "$SCRATCH/out" >&2
  elif ! grep -qE "$expect" "$SCRATCH/out"; then
    bad "$label — failed, but for the WRONG reason: no match for /$expect/"
    sed -n '1,30p' "$SCRATCH/out" >&2
  else
    ok "$label — correctly RED (matched /$expect/)"
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
assert_fails "trivy vs FAIL fixture" 'AVD-AWS-0092|AWS-0092' scan_trivy_isolated

step "B. Checkov flags $FIXTURE_VIOLATIONS_DIR"
assert_fails "checkov vs FAIL fixture" 'CKV_AWS_20' scan_checkov_isolated

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

# The patterns name the public-ACL finding specifically: that is the resource
# the brief's definition of done plants, so anything else going red would be a
# different bug wearing the same exit code.
assert_fails "planted: gate.sh --stage trivy" \
  'AWS-0092.*public ACL' "$REPO_ROOT/scripts/gate.sh" --stage trivy
assert_fails "planted: gate.sh --stage checkov" \
  'CKV_AWS_20.*public READ' "$REPO_ROOT/scripts/gate.sh" --stage checkov

step "C. remove the plant -> pipeline must return GREEN"
rm -rf "$PLANT_DIR"
assert_passes "unplanted: gate.sh --stage trivy"   "$REPO_ROOT/scripts/gate.sh" --stage trivy
assert_passes "unplanted: gate.sh --stage checkov" "$REPO_ROOT/scripts/gate.sh" --stage checkov

# ── D: the ratchet rejects an undocumented suppression ─────────────────────
# Without this, `quality-baselines/` is decoration: someone appends a check id
# to the machine baseline, CI goes green, and nobody ever learns why.
step "D. an undocumented suppression must fail check-baseline.sh"
jq '.failed_checks += [{
      "file": "/policy/fixtures/compliant/main.tf",
      "findings": [{"resource": "aws_s3_bucket.this", "check_ids": ["CKV_AWS_FAKE_999"]}]
    }]' "$SCRATCH/baseline.orig" >"$CHECKOV_BASELINE"
assert_fails "undocumented check id rejected" 'CKV_AWS_FAKE_999' \
  "$REPO_ROOT/scripts/check-baseline.sh"

# The subtler half, and the one an id-only comparison would wave through:
# CKV_AWS_144 IS accepted — but for aws_s3_bucket.this in the compliant
# fixture, and for nothing else. Re-using that acceptance on a different
# resource must still be rejected, or the first acceptance of a check silently
# pre-approves every later occurrence of it.
jq '.failed_checks += [{
      "file": "/stacks/99-imaginary/main.tf",
      "findings": [{"resource": "aws_s3_bucket.somewhere_else", "check_ids": ["CKV_AWS_144"]}]
    }]' "$SCRATCH/baseline.orig" >"$CHECKOV_BASELINE"
assert_fails "accepted check re-used on another resource rejected" \
  'aws_s3_bucket.somewhere_else' "$REPO_ROOT/scripts/check-baseline.sh"

cp "$SCRATCH/baseline.orig" "$CHECKOV_BASELINE"
assert_passes "restored baseline accepted" "$REPO_ROOT/scripts/check-baseline.sh"

# ── E: the terraform test suite can fail ───────────────────────────────────
# The regression this defends against is a config that stays SHAPED correctly
# while resolving to an unsafe VALUE — exactly what the scanners cannot see, so
# it needs its own proof rather than riding on A-D.
step "E. regress the module -> terraform test must fail"
sed -i 's/^  block_public_acls       = true$/  block_public_acls       = false/' "$COMPLIANT_TF"
if ! grep -q 'block_public_acls       = false' "$COMPLIANT_TF"; then
  bad "E setup — could not apply the regression; the sed target moved"
else
  # Matching the test's own error_message proves the ASSERTION fired, not that
  # terraform failed to initialise.
  assert_fails "regressed: gate.sh --stage test" \
    'block_public_acls is off' "$REPO_ROOT/scripts/gate.sh" --stage test
fi
cp "$SCRATCH/main.tf.orig" "$COMPLIANT_TF"
assert_passes "restored: gate.sh --stage test" "$REPO_ROOT/scripts/gate.sh" --stage test

# ── F: the secret scanner is armed ────────────────────────────────────────
# ADR-001 §4.5 — no secret in state or repo.
#
# Two constraints shape the probe below, and both are load-bearing.
#
# 1. It must NOT be AWS's documentation example pair (AKIAIOSFODNN7EXAMPLE /
#    wJalrXUtnFEMI...EXAMPLEKEY). Trivy allowlists those as known non-secrets,
#    so probing with them reports "clean" — indistinguishable from a scanner
#    that is switched off, and it briefly convinced this author the stage was
#    broken.
#
# 2. It must not exist as a contiguous literal in this file, or the secrets
#    stage flags THIS script on every clean run. The fragments are concatenated
#    at runtime: the file on disk contains no AKIA-plus-16 and no 40-character
#    secret, while the file the scanner is pointed at does. Joining them back
#    into one string "for readability" makes the repo permanently fail its own
#    gate.
#
# The value authorises nothing; it is random text of the right shape.
step "F. plant a credential -> the secrets stage must go RED"
# The probe is GENERATED, never written down. Splitting a literal is not
# enough: adjacent strings ("aaa""bbb") read as one token to gitleaks, and
# even a lone 20-character value assigned to a `*secret*` name trips
# generic-api-key. Both variants were measured failing on 25/08/2026 after
# this script moved in-tree and `make verify` began scanning it.
#
# Generating also makes the comment above literally true -- there is no
# credential in this file to leak, only a shape produced at runtime.
# `tr … | head -c N` is not safe under this script's pipefail: head exits after
# N bytes, tr receives SIGPIPE, and the whole falsifier dies with 141 before it
# writes the plant. Read an exact byte count instead, then hex-encode it.
probe_key="AKIA$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F')"
probe_secret="$(od -An -N20 -tx1 /dev/urandom | tr -d ' \n')"
{
  echo "aws_access_key_id = ${probe_key}"
  echo "aws_secret_access_key = ${probe_secret}"
} >"$SECRET_PLANT"

assert_fails "planted credential detected" 'aws-access-key-id' \
  "$REPO_ROOT/scripts/gate.sh" --stage secrets
rm -f "$SECRET_PLANT"
assert_passes "credential removed: gate.sh --stage secrets" \
  "$REPO_ROOT/scripts/gate.sh" --stage secrets

# ── G: the never-apply rule is enforced, not merely written ───────────────
# The 25/08/2026 operator decision says stacks/15-member-account is written and
# NEVER applied. That is a guardrail, so it gets the same treatment as every
# other one here: prove it can fail, or it is decoration.
step "G. stack policy must reject an unclassified stack"
mkdir -p "$POLICY_PLANT_DIR"
cat >"$POLICY_PLANT_DIR/plant.tf" <<'TF'
# Transient plant written by scripts/falsify-gates.sh. Removed on exit.
resource "aws_ssm_parameter" "unclassified" {
  name  = "/proso/falsification/unclassified"
  type  = "String"
  value = "a new stack nobody classified"
}
TF
assert_fails "unclassified stack rejected" '99-falsification-unclassified' \
  "$REPO_ROOT/scripts/gate.sh" --stage stack-policy
rm -rf "$POLICY_PLANT_DIR"
assert_passes "classified set accepted" "$REPO_ROOT/scripts/gate.sh" --stage stack-policy

step "G. Terraform CI must live at Forgejo's git-root discovery path"
rm -f "$CI_WORKFLOW"
assert_fails "missing root Terraform workflow rejected" 'missing required Terraform workflow at git-root path' \
  "$REPO_ROOT/scripts/gate.sh" --stage stack-policy
cp "$SCRATCH/ci.yml.orig" "$CI_WORKFLOW"
assert_passes "root Terraform workflow restored" "$REPO_ROOT/scripts/gate.sh" --stage stack-policy

step "G. a never-apply stack must not be drift-planned or CI-applied"
# Flip 15-member-account into the drift plan. It has no state and targets a
# different account, so including it would mean a red drift job every night for
# a reason nobody should act on.
jq '.stacks["15-member-account"].drift = true' "$SCRATCH/stack-policy.orig" >"$STACK_POLICY"
assert_fails "forbidden stack in the drift plan rejected" 'must not be in the drift plan' \
  "$REPO_ROOT/scripts/gate.sh" --stage stack-policy

# And the case that actually loses an account: a workflow that applies it.
jq '.stacks["15-member-account"].apply = "forbidden"' "$SCRATCH/stack-policy.orig" >"$STACK_POLICY"
printf '\n# falsification probe\n#   run: terraform -chdir=stacks/15-member-account apply\n' \
  >>"$CI_WORKFLOW"
assert_fails "workflow applying the forbidden stack rejected" 'apply or destroy the forbidden stack' \
  "$REPO_ROOT/scripts/gate.sh" --stage stack-policy
cp "$SCRATCH/ci.yml.orig" "$CI_WORKFLOW"

cp "$SCRATCH/stack-policy.orig" "$STACK_POLICY"
assert_passes "restored stack policy accepted" "$REPO_ROOT/scripts/gate.sh" --stage stack-policy

# ── H: parser failures cannot be skipped-green ─────────────────────────────
# Checkov reports a parsing error but exits 0 when every resource it DID parse
# is clean. A malformed file would therefore be omitted from policy evaluation
# while the scanner stayed green unless gate.sh checks the parser count itself.
step "H. malformed Terraform -> Checkov stage must go RED"
printf '\nresource "aws_s3_bucket" "unclosed" {\n' >>"$COMPLIANT_TF"
assert_fails "Checkov parsing failure rejected" 'Terraform parsing error left configuration unscanned' \
  "$REPO_ROOT/scripts/gate.sh" --stage checkov
cp "$SCRATCH/main.tf.orig" "$COMPLIANT_TF"
assert_passes "parseable Terraform restored" "$REPO_ROOT/scripts/gate.sh" --stage checkov

summarise
