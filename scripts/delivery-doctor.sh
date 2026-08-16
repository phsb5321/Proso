#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly REQUIRED_COMMANDS=(git node pnpm jq gitleaks magick inkscape)

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

# A client that exists but predates the current schema fails much later, in
# `typecheck`, as property errors that look like broken source. Catch the drift
# here, where the message can name it.
readonly SCHEMA_STAMP=packages/server/src/generated/prisma/.schema.sha256

if [[ ! -f "$SCHEMA_STAMP" ]]; then
  printf 'Prisma client predates schema-drift tracking; run make bootstrap\n' >&2
  exit 1
fi

EXPECTED_SCHEMA="$(node scripts/prisma-schema-digest.mjs)"
readonly EXPECTED_SCHEMA
GENERATED_SCHEMA="$(cat "$SCHEMA_STAMP")"
readonly GENERATED_SCHEMA

if [[ "$GENERATED_SCHEMA" != "$EXPECTED_SCHEMA" ]]; then
  printf 'Prisma client is stale: generated from schema %s, current schema is %s; run make bootstrap\n' \
    "${GENERATED_SCHEMA:0:12}" "${EXPECTED_SCHEMA:0:12}" >&2
  exit 1
fi

node scripts/workspace-policy.mjs

printf 'Delivery prerequisites ready (node %s, pnpm %s).\n' \
  "$(node --version)" "$ACTUAL_PNPM"
