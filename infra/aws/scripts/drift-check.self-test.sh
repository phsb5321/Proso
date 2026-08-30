#!/usr/bin/env bash
# Regression test for clean multi-stack drift runs. AWS and Terraform are fake;
# the production drift-check control flow and policy classification are real.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/proso-drift-check-self-test.XXXXXX")"
BIN="$SCRATCH/bin"
TERRAFORM_LOG="$SCRATCH/terraform.log"

cleanup() {
  rm -rf -- "$SCRATCH"
}
trap cleanup EXIT INT TERM

POLICY="$REPO_ROOT/infra/aws/policy/stack-policy.json"
WORKLOAD_ACCOUNT="$(jq -r '.accounts.workload' "$POLICY")"
MANAGEMENT_ACCOUNT="$(jq -r '.accounts.management' "$POLICY")"
readarray -t STACK_NAMES < <(
  jq -r '[.stacks | to_entries[] | select(.value.drift == true and .value.account == "workload")][:2][].key' "$POLICY"
)

if [[ ! "$WORKLOAD_ACCOUNT" =~ ^[0-9]{12}$ ]] ||
   [[ ! "$MANAGEMENT_ACCOUNT" =~ ^[0-9]{12}$ ]] ||
   [[ "$WORKLOAD_ACCOUNT" == "$MANAGEMENT_ACCOUNT" ]] ||
   ((${#STACK_NAMES[@]} != 2)); then
  printf 'FAIL: policy must classify two workload drift stacks and distinct accounts for this test\n' >&2
  exit 1
fi

STACK_ARGS=()

mkdir -p "$BIN"
for stack_name in "${STACK_NAMES[@]}"; do
  stack_dir="$SCRATCH/$stack_name"
  mkdir -p "$stack_dir"
  printf 'terraform {}\n' >"$stack_dir/main.tf"
  STACK_ARGS+=("$stack_dir")
done

cat >"$BIN/aws" <<'SH'
#!/usr/bin/env bash
: "${FAKE_ACCOUNT:?}"
printf '%s\n' "$FAKE_ACCOUNT"
SH

cat >"$BIN/terraform" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_TERRAFORM_LOG"
case " $* " in
  *' init '*) exit 0 ;;
  *' plan '*)
    printf '%s\n' 'No changes. Your infrastructure matches the configuration.'
    exit 0
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$BIN/aws" "$BIN/terraform"

run_drift() {
  local account="$1"
  : >"$TERRAFORM_LOG"
  set +e
  OUTPUT="$({
    cd "$REPO_ROOT"
    PATH="$BIN:$PATH" FAKE_ACCOUNT="$account" FAKE_TERRAFORM_LOG="$TERRAFORM_LOG" \
      bash infra/aws/scripts/drift-check.sh "${STACK_ARGS[@]}"
  } 2>&1)"
  RC=$?
  set -e
}

run_drift "$WORKLOAD_ACCOUNT"
if ((RC != 0)); then
  printf 'FAIL: two clean plans exited %d\n%s\n' "$RC" "$OUTPUT" >&2
  exit 1
fi
if [[ "$(grep -c ' plan ' "$TERRAFORM_LOG" || true)" != 2 ]] ||
   ! grep -Fq 'No drift in 2 planned stack(s).' <<<"$OUTPUT"; then
  printf 'FAIL: clean plans did not both reach the final summary\n%s\n' "$OUTPUT" >&2
  exit 1
fi

run_drift "$MANAGEMENT_ACCOUNT"
if ((RC != 1)) || [[ -s "$TERRAFORM_LOG" ]] ||
   ! grep -Fq 'planned 0 stacks — everything in scope was skipped' <<<"$OUTPUT"; then
  printf 'FAIL: zero-coverage run did not fail closed\n%s\n' "$OUTPUT" >&2
  exit 1
fi

printf 'PASS: clean plans complete and zero-coverage fails closed\n'
