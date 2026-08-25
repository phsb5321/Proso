#!/usr/bin/env bash
#
# The policy gate. ADR-001 §2 pipeline order:
#
#   fmt -> validate -> tflint -> Trivy/Checkov -> (plan, gated apply: CI only)
#
# CI calls exactly this script, so a green run here and a green run on the
# Forgejo runner are the same claim. Every stage runs even after an earlier one
# fails — one pass should report every problem, not the first one.
#
# Fail-closed by construction: a stage that cannot run (missing tool, missing
# baseline, scanner crash) is a FAILURE, never a skip. Exit 0 means every stage
# ran and every stage passed.
#
# Usage:
#   scripts/gate.sh                    # full gate
#   scripts/gate.sh --stage fmt        # one stage (used by the pre-commit hook)
#   scripts/gate.sh --write-baseline   # regenerate the Checkov baseline (ratchet)
#
# `--write-baseline` deliberately does NOT run inside CI. Accepting a finding is
# a decision with a written reason and a review date; see
# quality-baselines/README.md.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ONLY_STAGE=""
WRITE_BASELINE=0

while (($#)); do
  case "$1" in
    --stage) ONLY_STAGE="${2:?--stage needs a name}"; shift 2 ;;
    --write-baseline) WRITE_BASELINE=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) log "unknown argument: $1"; exit 2 ;;
  esac
done

wanted() { [[ -z "$ONLY_STAGE" || "$ONLY_STAGE" == "$1" ]]; }

require_tools terraform tflint trivy uv jq git

readarray -t TF_DIRS < <(terraform_dirs)

# The gate's own Terraform data directory, separate from the developer's.
#
# `terraform init -backend=false` is NOT offline once a directory has been
# initialised against a real backend: the backend recorded in
# `.terraform/terraform.tfstate` is still contacted, so the gate fails with
# "No valid credential sources found" on the machine of anyone who has actually
# deployed the stack. Pointing TF_DATA_DIR elsewhere makes the offline claim
# true again, and leaves a working `.terraform` alone rather than reconfiguring
# it out from under an apply.
#
# Relative, so `terraform -chdir=<dir>` resolves it inside that directory; one
# shared absolute path would have every stack fight over a single lock file.
export TF_DATA_DIR=".terraform-gate"

# gate_init <dir> — initialise a directory for the offline stages only.
gate_init() {
  terraform -chdir="$1" init -backend=false -input=false -no-color >/dev/null
}

# ── 0. baseline hygiene ────────────────────────────────────────────────────
# Runs FIRST: an expired or undocumented suppression must fail the build even
# if the code is otherwise clean, or the ratchet decays into a permanent skip.
if wanted baseline; then
  step "baseline — every suppression documented and in date"
  if "$REPO_ROOT/scripts/check-baseline.sh"; then
    ok "baseline"
  else
    bad "baseline"
  fi
fi

# ── 0b. stack policy ────────────────────────────────────────────────────
# Which account each stack targets, and whether it may be applied at all. The
# 25/08/2026 operator decision makes stacks/15-member-account never-apply; before
# this stage that rule existed only as a paragraph in the ADR.
if wanted stack-policy; then
  step "stack policy — every stack classified, never-apply enforced"
  if "$REPO_ROOT/scripts/check-stack-policy.sh"; then
    ok "stack-policy"
  else
    bad "stack-policy"
  fi
fi

# ── 1. fmt ─────────────────────────────────────────────────────────────────
if wanted fmt; then
  step "terraform fmt -check -recursive"
  if terraform fmt -check -recursive -diff; then
    ok "fmt"
  else
    bad "fmt (run: terraform fmt -recursive)"
  fi
fi

# ── 2. validate ────────────────────────────────────────────────────────────
# `terraform validate` needs an initialised directory but NOT credentials — it
# does not configure providers. So this stage stays offline-safe and is not the
# place where AWS access is required; that is the plan stage, in CI only.
if wanted validate; then
  step "terraform validate (${#TF_DIRS[@]} dir(s))"
  if ((${#TF_DIRS[@]} == 0)); then
    bad "validate — no .tf found anywhere; the gate would be vacuous"
  else
    for d in "${TF_DIRS[@]}"; do
      if gate_init "$d" &&
        terraform -chdir="$d" validate -no-color; then
        ok "validate $d"
      else
        bad "validate $d"
      fi
    done
  fi
fi

# ── 3. tflint (correctness) ────────────────────────────────────────────────
if wanted tflint; then
  step "tflint --recursive"
  # `--init` is idempotent and cheap once the plugin is cached; running it here
  # means a fresh runner does not need a separate bootstrap step.
  if tflint --init >/dev/null 2>&1 &&
     tflint --recursive --minimum-failure-severity=warning; then
    ok "tflint"
  else
    bad "tflint"
  fi
fi

# ── 4a. Trivy (safety) ─────────────────────────────────────────────────────
# Config in ./trivy.yaml, including exit-code 1 and the fixture skip.
if wanted trivy; then
  step "trivy config"
  if trivy config -q .; then
    ok "trivy"
  else
    bad "trivy"
  fi
fi

# ── 4c. secrets (ADR-001 §4.5) ─────────────────────────────────────────────
# "No secret in state or repo" was the one §4 rule with nothing enforcing it:
# `trivy config` scans for MISCONFIGURATION only, and .gitignore is a
# convenience, not a boundary — it does nothing about a file already tracked, or
# one added with `git add -f`.
#
# Two checks, because they catch different mistakes:
#   - a tracked state file (state contains resource metadata and can contain
#     secrets outright — ADR-001 §2.3)
#   - a credential pattern anywhere in the tree
if wanted secrets; then
  step "secrets — no tracked state, no credential patterns"

  tracked_state=$(git ls-files -- '*.tfstate' '*.tfstate.*' '*.tfvars' '*.tfvars.json' |
                    grep -v -F 'example.tfvars' || true)
  if [[ -n "$tracked_state" ]]; then
    bad "secrets — state/vars files are TRACKED by git:"$'\n'"$tracked_state"
  else
    ok "secrets — no tracked state or tfvars"
  fi

  # `--scanners secret` over the working tree. The mock credentials in
  # *.tftest.hcl are literal strings "mock-access-key"/"mock-secret-key" and do
  # not match any provider pattern; if a future test needs a realistic-looking
  # value, that is precisely the case this check should flag.
  if trivy fs -q --scanners secret --exit-code 1 --skip-dirs '**/.terraform' .; then
    ok "secrets — no credential patterns"
  else
    bad "secrets — credential pattern found (see above)"
  fi
fi

# ── 4b. Checkov (safety) ───────────────────────────────────────────────────
# Config in ./.checkov.yml. Two scanners, not one: they disagree often enough to
# be worth the seconds. Checkov caught CKV_AWS_379 (no TLS-only bucket policy)
# on a fixture Trivy called clean; Trivy's AVD-AWS-0132 phrasing is the clearer
# of the two on customer-managed keys.
if wanted checkov; then
  if ((WRITE_BASELINE)); then
    step "checkov --create-baseline (regenerating the ratchet)"
    checkov --create-baseline --config-file .checkov.yml >/dev/null || true
    # Checkov writes .checkov.baseline beside the scanned directory.
    if [[ -f .checkov.baseline ]]; then
      mv .checkov.baseline "$CHECKOV_BASELINE"
      ok "wrote $CHECKOV_BASELINE — now document each entry in $ACCEPTED_FINDINGS"
    else
      bad "checkov --create-baseline produced no file"
    fi
  else
    step "checkov"
    checkov_output="$(mktemp)"
    set +e
    checkov --config-file .checkov.yml >"$checkov_output" 2>&1
    checkov_rc=$?
    set -e
    cat "$checkov_output"

    # Checkov exits 0 when every parsed resource is clean even if one Terraform
    # file failed to parse. That is skipped-green: the unparsed file is exactly
    # the file whose policy was never evaluated. Treat any non-zero parser
    # count as a gate failure independently of Checkov's process status.
    if grep -Eq 'Parsing errors:[[:space:]]*[1-9][0-9]*' "$checkov_output"; then
      bad "checkov — Terraform parsing error left configuration unscanned"
    elif ((checkov_rc == 0)); then
      ok "checkov"
    else
      bad "checkov"
    fi
    rm -f "$checkov_output"
  fi
fi

# ── 5. terraform test ──────────────────────────────────────────────────────
# ADR-001 §4.7: every module ships a test. Runs against every directory holding
# a *.tftest.hcl; mock providers keep it credential-free.
if wanted test; then
  step "terraform test"

  # Coverage first. "At least one test file exists somewhere" is not the rule —
  # under that reading a new module ships untested and the gate stays green
  # because an unrelated fixture has a test. §4.7 is per module, so check per
  # module. Stacks are deliberately excluded: they are compositions owned by the
  # other tabs, and the ADR requires the test on the reusable unit.
  #
  # Recursive, not -maxdepth 1: Terraform looks for tests both beside the module
  # and in its `tests/` subdirectory, and the modules in this repo use `tests/`.
  if [[ -d modules ]]; then
    while IFS= read -r m; do
      [[ -n "$(find "$m" -maxdepth 1 -name '*.tf' -print -quit)" ]] || continue
      if [[ -z "$(find "$m" -name '*.tftest.hcl' -print -quit)" ]]; then
        bad "test — module $m has no *.tftest.hcl (ADR-001 §4.7)"
      fi
    done < <(find modules -mindepth 1 -maxdepth 1 -type d | sort)
  fi

  # `terraform test` runs from the MODULE ROOT and discovers `tests/` itself; it
  # cannot run inside `tests/`, where there is no configuration to test. Map a
  # test file back to the directory Terraform expects to be invoked from.
  found_any=0
  while IFS= read -r d; do
    found_any=1
    if gate_init "$d" &&
      terraform -chdir="$d" test -no-color; then
      ok "test $d"
    else
      bad "test $d"
    fi
  done < <(find . -path ./.git -prune -o -name '*.tftest.hcl' -print 2>/dev/null |
           xargs -r -n1 dirname |
           sed 's:/tests$::' |
           sort -u)
  ((found_any)) || bad "test — no *.tftest.hcl anywhere (ADR-001 §4.7)"
fi

summarise
