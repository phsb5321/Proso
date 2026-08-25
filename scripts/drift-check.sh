#!/usr/bin/env bash
#
# Drift detection: a scheduled `terraform plan` that reports any non-empty diff.
#
# Applied infrastructure diverges from code through console edits, out-of-band
# scripts, and AWS itself changing defaults. Drift discovered during an incident
# is expensive; drift discovered by a nightly plan is a five-minute fix.
#
# READ-ONLY BY CONSTRUCTION. `plan` cannot mutate infrastructure, `-lock=false`
# means it cannot even take a state lock away from a concurrent apply, and
# nothing here writes state or calls apply. ADR-001 §4.1 (plan-only against
# production) and §4.6 (never destroy autonomously) both hold trivially: this
# script has no code path that changes anything.
#
# Exit codes mirror `terraform plan -detailed-exitcode`:
#   0  no drift
#   1  a stack failed to plan (credentials, syntax, provider) — a real failure
#   2  drift detected  <- the interesting one; CI reports it, nobody is paged
#
# Usage:
#   scripts/drift-check.sh                  # every stack
#   scripts/drift-check.sh stacks/20-site   # one stack

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools terraform

if (($#)); then
  STACKS=("$@")
else
  readarray -t STACKS < <(find stacks -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
fi

if ((${#STACKS[@]} == 0)); then
  log "No stacks yet under stacks/ — nothing to check for drift."
  exit 0
fi

DRIFTED=()
ERRORED=()

for stack in "${STACKS[@]}"; do
  [[ -n "$(find "$stack" -maxdepth 1 -name '*.tf' -print -quit)" ]] || continue

  step "plan $stack"
  if ! terraform -chdir="$stack" init -input=false -no-color >/dev/null; then
    bad "$stack — init failed"
    ERRORED+=("$stack")
    continue
  fi

  set +e
  terraform -chdir="$stack" plan \
    -detailed-exitcode -input=false -lock=false -no-color
  rc=$?
  set -e

  case "$rc" in
    0) ok "$stack — no drift" ;;
    2) bad "$stack — DRIFT (see the plan above)"; DRIFTED+=("$stack") ;;
    *) bad "$stack — plan failed (exit $rc)"; ERRORED+=("$stack") ;;
  esac
done

if ((${#ERRORED[@]})); then
  log ""
  log "plan FAILED for: ${ERRORED[*]}"
  exit 1
fi

if ((${#DRIFTED[@]})); then
  log ""
  log "DRIFT in: ${DRIFTED[*]}"
  log "Reconcile by changing the code to match reality, or by applying the code"
  log "over it — never by editing the console again. Applying to a production"
  log "account needs Pedro's explicit go (ADR-001 §4.1)."
  exit 2
fi

log ""
log "No drift in ${#STACKS[@]} stack(s)."
exit 0
