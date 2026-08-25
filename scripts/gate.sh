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

require_tools terraform tflint trivy uv jq

readarray -t TF_DIRS < <(terraform_dirs)

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
      if terraform -chdir="$d" init -backend=false -input=false -no-color >/dev/null &&
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
    if checkov --config-file .checkov.yml; then
      ok "checkov"
    else
      bad "checkov"
    fi
  fi
fi

# ── 5. terraform test ──────────────────────────────────────────────────────
# ADR-001 §4.7: every module ships a test. Runs against every directory holding
# a *.tftest.hcl; mock providers keep it credential-free.
if wanted test; then
  step "terraform test"
  local_found=0
  while IFS= read -r d; do
    local_found=1
    if terraform -chdir="$d" init -backend=false -input=false -no-color >/dev/null &&
       terraform -chdir="$d" test -no-color; then
      ok "test $d"
    else
      bad "test $d"
    fi
  done < <(find . -path ./.git -prune -o -name '*.tftest.hcl' -print 2>/dev/null |
           xargs -r -n1 dirname | sort -u)
  ((local_found)) || bad "test — no *.tftest.hcl anywhere (ADR-001 §4.7)"
fi

summarise
