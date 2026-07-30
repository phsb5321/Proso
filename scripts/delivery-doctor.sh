#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly REQUIRED_COMMANDS=(git node pnpm jq gitleaks)

for command_name in "${REQUIRED_COMMANDS[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

EXPECTED_PNPM="$(node -p "require('./package.json').packageManager.split('@')[1]")"
readonly EXPECTED_PNPM
ACTUAL_PNPM="$(pnpm --version)"
readonly ACTUAL_PNPM

if [[ "$ACTUAL_PNPM" != "$EXPECTED_PNPM" ]]; then
  printf 'pnpm %s is required; found %s\n' "$EXPECTED_PNPM" "$ACTUAL_PNPM" >&2
  exit 1
fi

if [[ ! -f packages/server/src/generated/prisma/client.ts ]]; then
  printf 'Prisma client is missing; run make bootstrap\n' >&2
  exit 1
fi

node scripts/workspace-policy.mjs

printf 'Delivery prerequisites ready (node %s, pnpm %s).\n' \
  "$(node --version)" "$ACTUAL_PNPM"
