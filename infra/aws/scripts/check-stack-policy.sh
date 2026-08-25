#!/usr/bin/env bash
#
# Enforces policy/stack-policy.json.
#
# The 25/08/2026 operator decision says `stacks/15-member-account` is written
# but NEVER applied. Until this script existed that rule lived in a paragraph of
# an ADR, which is exactly the class of guardrail this tab exists to replace: a
# rule nothing can enforce is a rule that holds until the first person who has
# not read it runs `terraform apply`.
#
# What it checks:
#
#   1. Every directory under stacks/ has an entry. A NEW stack fails the gate
#      until someone classifies it — fail-closed, because the dangerous default
#      is "unclassified means fine".
#   2. Every entry names a known account, a valid apply class, and carries a
#      reason. `forbidden` needs a substantive one plus an ADR citation, since
#      that is the entry a future reader will be most tempted to flip.
#   3. No entry is stale: everything classified still exists on disk.
#   4. The Terraform CI workflow exists at the git-root Forgejo discovery path,
#      and no workflow can apply a forbidden stack.
#   5. A forbidden stack declares no backend, so it cannot participate in the
#      normal remote-state flow without an obvious, reviewable edit.
#
# It deliberately does NOT try to intercept a human typing `terraform apply` in
# that directory. Nothing in a repo can, and pretending otherwise would be worse
# than saying so: the real controls are that CI never applies it, drift never
# plans it, and the deploy role is scoped to the workload account while this
# stack targets management.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_tools jq git

POLICY="policy/stack-policy.json"
GIT_ROOT="$(git rev-parse --show-toplevel)"
WORKFLOW_DIR="$GIT_ROOT/.forgejo/workflows"
TERRAFORM_WORKFLOW="$WORKFLOW_DIR/terraform-ci.yml"
fail=0
note() { printf '    %s\n' "$*" >&2; fail=1; }

[[ -f "$POLICY" ]] || { note "missing $POLICY"; exit 1; }
[[ -f "$TERRAFORM_WORKFLOW" ]] ||
  note "missing required Terraform workflow at git-root path $TERRAFORM_WORKFLOW"
if [[ "$GIT_ROOT" != "$REPO_ROOT" && -d "$REPO_ROOT/.forgejo/workflows" ]]; then
  note "nested $REPO_ROOT/.forgejo/workflows is undiscoverable by Forgejo; workflows belong at $WORKFLOW_DIR"
fi
jq -e . "$POLICY" >/dev/null || { note "$POLICY is not valid JSON"; exit 1; }

if [[ ! -d stacks ]]; then
  printf '    no stacks/ directory yet — nothing to classify\n' >&2
  exit 0
fi

known_accounts="$(jq -r '.accounts | keys[]' "$POLICY")"
classified="$(jq -r '.stacks | keys[]' "$POLICY" | sort)"

# A gitignored directory under stacks/ is not a stack — it is scratch, and the
# only one that exists is the transient plant scripts/falsify-gates.sh writes.
# The exclusion is "git ignores it", NOT a name prefix: a prefix rule would let
# anyone dodge classification by choosing the right directory name, and it also
# made this check unfalsifiable, since the falsification plant matched it.
on_disk=""
while IFS= read -r d; do
  [[ -n "$d" ]] || continue
  git check-ignore -q "$d" && continue
  on_disk+="$(basename "$d")"$'\n'
done < <(find stacks -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
on_disk="$(printf '%s' "$on_disk" | sort)"

# (1) unclassified stack on disk
while IFS= read -r s; do
  [[ -n "$s" ]] || continue
  grep -qxF "$s" <<<"$classified" ||
    note "stacks/$s has no entry in $POLICY — classify it (account, apply, drift, reason)"
done <<<"$on_disk"

# (3) classified stack that no longer exists
while IFS= read -r s; do
  [[ -n "$s" ]] || continue
  grep -qxF "$s" <<<"$on_disk" ||
    note "$POLICY classifies '$s' but stacks/$s does not exist — delete the entry"
done <<<"$classified"

# (2) per-entry validity
while IFS= read -r s; do
  [[ -n "$s" ]] || continue

  account=$(jq -r --arg s "$s" '.stacks[$s].account // empty' "$POLICY")
  apply=$(jq -r --arg s "$s" '.stacks[$s].apply // empty' "$POLICY")
  # No `// empty` here: jq's alternative operator treats `false` as absent, so
  # `.drift // empty` turns every correctly-excluded stack into "missing".
  drift=$(jq -r --arg s "$s" '.stacks[$s].drift' "$POLICY")
  reason=$(jq -r --arg s "$s" '.stacks[$s].reason // empty' "$POLICY")
  adr=$(jq -r --arg s "$s" '.stacks[$s].adr // empty' "$POLICY")

  grep -qxF "$account" <<<"$known_accounts" ||
    note "$s: account '$account' is not one of: $(tr '\n' ' ' <<<"$known_accounts")"

  case "$apply" in
    allowed | gated | forbidden) ;;
    *) note "$s: apply must be allowed|gated|forbidden (got '${apply:-<empty>}')" ;;
  esac

  case "$drift" in
    true | false) ;;
    *) note "$s: drift must be true or false (got '${drift:-<empty>}')" ;;
  esac

  ((${#reason} >= 60)) ||
    note "$s: .reason must say why in at least 60 chars (got ${#reason})"

  if [[ "$apply" == "forbidden" ]]; then
    # A higher bar for the entry someone will one day want to flip.
    ((${#reason} >= 200)) ||
      note "$s: a 'forbidden' entry needs a reason of at least 200 chars explaining what applying it would do and why that is ruled out (got ${#reason})"
    [[ -n "$adr" ]] ||
      note "$s: a 'forbidden' entry must cite the decision in .adr"
    [[ "$drift" == "false" ]] ||
      note "$s: a 'forbidden' stack must not be in the drift plan — it would report every resource as missing, for ever"

    # (5) no backend => cannot join the normal remote-state flow silently
    if [[ -n "$(find "stacks/$s" -maxdepth 1 -name 'backend.tf' -print -quit)" ]]; then
      note "$s: is 'forbidden' but declares stacks/$s/backend.tf — a forbidden stack must not be wired to remote state"
    fi
  fi
done <<<"$classified"

# (4) no workflow may apply a forbidden stack
forbidden="$(jq -r '.stacks | to_entries[] | select(.value.apply == "forbidden") | .key' "$POLICY")"
if [[ -n "$forbidden" && -d "$WORKFLOW_DIR" ]]; then
  while IFS= read -r s; do
    [[ -n "$s" ]] || continue
    while IFS= read -r wf; do
      [[ -n "$wf" ]] || continue
      # Only an apply/destroy mention matters; a plan or a comment naming the
      # stack is fine and is how the exclusion gets documented.
      if grep -nE "terraform.*(apply|destroy)" "$wf" | grep -qF "$s"; then
        note "$wf appears to apply or destroy the forbidden stack '$s'"
      fi
    done < <(find "$WORKFLOW_DIR" -type f \( -name '*.yml' -o -name '*.yaml' \))
  done <<<"$forbidden"
fi

((fail)) && exit 1

n_total=$(grep -c . <<<"$classified" || true)
n_forbidden=$(grep -c . <<<"$forbidden" || true)
n_drift=$(jq -r '[.stacks[] | select(.drift == true)] | length' "$POLICY")
printf '    %s stack(s) classified: %s in the drift plan, %s never-apply\n' \
  "$n_total" "$n_drift" "$n_forbidden" >&2
