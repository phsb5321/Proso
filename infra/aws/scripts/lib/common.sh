# shellcheck shell=bash
#
# Shared plumbing for the gate scripts. The point of this file is that CI runs
# `scripts/gate.sh` and nothing else — so "green locally" and "green in CI"
# are the same claim, not two similar ones.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=../../policy/versions.sh
source "$REPO_ROOT/policy/versions.sh"

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_DIM=''; C_OFF=''
fi

STAGE_FAILURES=()

log()  { printf '%s\n' "$*" >&2; }
step() { printf '\n%s══ %s%s\n' "$C_DIM" "$*" "$C_OFF" >&2; }
ok()   { printf '%s  PASS%s  %s\n' "$C_GRN" "$C_OFF" "$*" >&2; }
bad()  { printf '%s  FAIL%s  %s\n' "$C_RED" "$C_OFF" "$*" >&2; STAGE_FAILURES+=("$*"); }

# Checkov is not on PATH: it is resolved by uv at the pinned version. Doing this
# through a function keeps the pin in exactly one place.
checkov() {
  uvx --quiet --from "checkov==${CHECKOV_VERSION}" checkov "$@"
}

require_tools() {
  local missing=()
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  if ((${#missing[@]})); then
    log "Missing tools: ${missing[*]}"
    log "Enter the pinned toolchain first:  nix develop -c \"\$0\""
    exit 127
  fi
}

# Terraform directories = every dir holding a .tf file, minus the scanner
# fixtures and provider caches. Stacks appear here automatically as the other
# tabs land them; nothing to keep in sync by hand.
#
# `find` failures are NOT swallowed. A blanket `|| true` across the pipeline
# would render a permission error as "no directories found", and the gate would
# then validate whatever it happened to see and report PASS. Only grep's exit 1
# ("every candidate was the fixture") is tolerated, and only once find has
# succeeded.
terraform_dirs() {
  local raw dirs rc
  if ! raw=$(find . \
    -type d \( -name '.terraform' -o -name '.git' \) -prune -o \
    -name '*.tf' -print); then
    log "terraform_dirs: find failed — refusing to report an empty list"
    return 1
  fi

  [[ -n "$raw" ]] || return 0

  set +e
  dirs=$(printf '%s\n' "$raw" | xargs -r -n1 dirname | sort -u |
    grep -v -x -F "./${FIXTURE_VIOLATIONS_DIR}")
  rc=$?
  set -e

  # 0 = matches remain, 1 = everything was filtered out. Anything else is real.
  if ((rc > 1)); then
    log "terraform_dirs: filtering failed (exit $rc)"
    return 1
  fi

  [[ -n "$dirs" ]] && printf '%s\n' "$dirs"
  return 0
}

summarise() {
  if ((${#STAGE_FAILURES[@]})); then
    printf '\n%sGATE FAILED%s — %d stage(s):\n' "$C_RED" "$C_OFF" "${#STAGE_FAILURES[@]}" >&2
    printf '  - %s\n' "${STAGE_FAILURES[@]}" >&2
    return 1
  fi
  printf '\n%sGATE PASSED%s\n' "$C_GRN" "$C_OFF" >&2
  return 0
}
