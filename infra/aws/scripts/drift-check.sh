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
# SCOPE COMES FROM policy/stack-policy.json, not from `ls stacks/`. Two stacks
# would otherwise poison this job every night:
#
#   - 15-member-account is never applied (operator decision, 25/08/2026), so it
#     has no state and every resource reads as missing. Perpetual "drift".
#   - 05-org-structure targets the MANAGEMENT account; CI authenticates as the
#     workload-account deploy role and cannot read Organizations at all, so the
#     plan simply errors.
#
# Either one turns this into a job that is red every morning for a reason nobody
# needs to act on, which is precisely how the one real drift alert gets ignored.
# Skips are printed with their reason, never silent.
#
# Exit codes mirror `terraform plan -detailed-exitcode`:
#   0  no drift
#   1  a stack failed to plan, or no stack was planned — a real failure
#   2  drift detected  <- the interesting one; CI reports it, nobody is paged
#
# PER-STACK CONFIG follows the convention the stacks already document in their
# own READMEs, rather than inventing a second one: `<env>.tfvars` copied from
# the tracked `example.tfvars`, and `<env>.s3.tfbackend` (or `backend.hcl`) for
# the partial backend. Tfvars stay gitignored because they may carry secrets;
# backend configs are tracked when they contain only non-secret account and
# state-bucket metadata. Set DRIFT_ENV to pick the prefix.
#
# When that config is missing the script says exactly which file to provide and
# fails. It does NOT skip: a drift check that silently covers nothing is the
# failure mode this whole tab exists to prevent.
#
# Usage:
#   scripts/drift-check.sh                  # every in-scope stack
#   scripts/drift-check.sh stacks/20-site   # one stack, policy still applies
#   DRIFT_ENV=sandbox scripts/drift-check.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools terraform jq

POLICY="policy/stack-policy.json"
DRIFT_ENV="${DRIFT_ENV:-sandbox}"
[[ -f "$POLICY" ]] || { log "missing $POLICY — refusing to plan an unclassified set of stacks"; exit 1; }

# The identity we are actually running as, when there is one. A stack whose
# target account differs is skipped rather than failed: planning it would abort
# at provider configuration (`allowed_account_ids`), which is correct behaviour
# by the stack and useless noise here.
CURRENT_ACCOUNT=""
if command -v aws >/dev/null 2>&1; then
  CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
fi

if (($#)); then
  REQUESTED=("$@")
else
  readarray -t REQUESTED < <(find stacks -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
fi

DRIFTED=()
ERRORED=()
SKIPPED=()
PLANNED=0

for stack in "${REQUESTED[@]}"; do
  name="$(basename "$stack")"
  [[ -n "$(find "$stack" -maxdepth 1 -name '*.tf' -print -quit 2>/dev/null)" ]] || continue

  entry="$(jq -r --arg s "$name" '.stacks[$s] // empty' "$POLICY")"
  if [[ -z "$entry" ]]; then
    # Unclassified is a gate failure elsewhere; here it must not be silently
    # planned against an account nobody chose.
    bad "$name — not classified in $POLICY; refusing to plan it"
    ERRORED+=("$stack")
    continue
  fi

  if [[ "$(jq -r '.drift' <<<"$entry")" != "true" ]]; then
    SKIPPED+=("$name — excluded from drift: $(jq -r '.reason' <<<"$entry" | cut -c1-100)…")
    continue
  fi

  want_account="$(jq -r --arg k "$(jq -r '.account' <<<"$entry")" '.accounts[$k]' "$POLICY")"
  if [[ -n "$CURRENT_ACCOUNT" && "$CURRENT_ACCOUNT" != "$want_account" ]]; then
    SKIPPED+=("$name — targets account $want_account, this run is authenticated to $CURRENT_ACCOUNT")
    continue
  fi

  step "plan $stack (account $want_account)"

  # Readiness, reported as a named missing file rather than a raw terraform
  # error about a backend attribute nobody set on purpose.
  init_args=()
  plan_args=()
  missing=()

  if grep -qs 'backend "s3"' "$stack"/*.tf; then
    if   [[ -f "$stack/${DRIFT_ENV}.s3.tfbackend" ]]; then init_args+=("-backend-config=${DRIFT_ENV}.s3.tfbackend")
    elif [[ -f "$stack/backend.hcl" ]];                then init_args+=("-backend-config=backend.hcl")
    else missing+=("$stack/${DRIFT_ENV}.s3.tfbackend (partial backend config; see $stack/README.md)")
    fi
  fi

  if [[ -f "$stack/example.tfvars" ]]; then
    if [[ -f "$stack/${DRIFT_ENV}.tfvars" ]]; then
      plan_args+=("-var-file=${DRIFT_ENV}.tfvars")
    else
      missing+=("$stack/${DRIFT_ENV}.tfvars (copy from $stack/example.tfvars)")
    fi
  fi

  if ((${#missing[@]})); then
    bad "$stack — not configured for drift; provide:"$'\n'"$(printf '      - %s\n' "${missing[@]}")"
    ERRORED+=("$stack")
    continue
  fi

  if ! terraform -chdir="$stack" init -input=false -no-color "${init_args[@]}" >/dev/null; then
    bad "$stack — init failed"
    ERRORED+=("$stack")
    continue
  fi

  set +e
  terraform -chdir="$stack" plan \
    -detailed-exitcode -input=false -lock=false -no-color "${plan_args[@]}"
  rc=$?
  set -e
  PLANNED=$((PLANNED + 1))

  case "$rc" in
    0) ok "$stack — no drift" ;;
    2) bad "$stack — DRIFT (see the plan above)"; DRIFTED+=("$stack") ;;
    *) bad "$stack — plan failed (exit $rc)"; ERRORED+=("$stack") ;;
  esac
done

if ((${#SKIPPED[@]})); then
  log ""
  log "Skipped by policy/stack-policy.json:"
  printf '  - %s\n' "${SKIPPED[@]}" >&2
fi

if ((${#ERRORED[@]})); then
  log ""
  log "plan FAILED for: ${ERRORED[*]}"
  exit 1
fi

if ((${#DRIFTED[@]})); then
  log ""
  log "DRIFT in: ${DRIFTED[*]}"
  log "Reconcile by changing the code to match reality, or by applying the code"
  log "over it — never by editing the console again. Applying to any account"
  log "needs Pedro's explicit go (ADR-001 §4.1), and a budget alarm must already"
  log "exist there (§4.2)."
  exit 2
fi

if ((PLANNED == 0)); then
  log ""
  log "planned 0 stacks — everything in scope was skipped; refusing to report no drift"
  exit 1
fi

log ""
log "No drift in $PLANNED planned stack(s)."
exit 0
