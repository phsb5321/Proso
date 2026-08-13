#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly MODE="${1:-}"
case "$MODE" in
  format | lint) ;;
  *)
    printf 'Usage: %s <format|lint>\n' "$0" >&2
    exit 2
    ;;
esac

for command_name in git pnpm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

declare -A seen=()
changed_files=()

collect_file() {
  local candidate="$1"
  [[ -f "$candidate" ]] || return 0
  # Spec artifacts are documentation, not shipped source. They became visible to
  # this script when `specs/` started being tracked; the illustrative contract
  # stubs inside them were never written to Biome's formatting rules and are not
  # built, linted, or published. Production paths are unaffected.
  [[ "$candidate" == specs/* ]] && return 0
  # `main.js` is the one pre-Biome progressive-enhancement file and retains its
  # own ES5 formatting; checkout contracts execute it in jsdom instead.
  [[ "$candidate" == packages/site/assets/js/main.js ]] && return 0
  [[ "$candidate" =~ \.(cjs|js|jsx|json|mjs|ts|tsx)$ ]] || return 0
  [[ -n "${seen[$candidate]+present}" ]] && return 0
  seen["$candidate"]=1
  changed_files+=("$candidate")
}

while IFS= read -r -d '' candidate; do
  collect_file "$candidate"
done < <(git diff --name-only --diff-filter=ACMR -z origin/main...HEAD)

while IFS= read -r -d '' candidate; do
  collect_file "$candidate"
done < <(git diff --name-only --diff-filter=ACMR -z)

while IFS= read -r -d '' candidate; do
  collect_file "$candidate"
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

while IFS= read -r -d '' candidate; do
  collect_file "$candidate"
done < <(git ls-files --others --exclude-standard -z)

if (( ${#changed_files[@]} == 0 )); then
  printf 'No changed JavaScript, JSON, or TypeScript-family files to check.\n'
  exit 0
fi

pnpm exec biome "$MODE" --files-ignore-unknown=true "${changed_files[@]}"
