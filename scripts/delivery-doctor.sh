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

# The server consumes @proso/shared from dist/, so a dist that predates the
# current source fails much later — as missing exports or stale types that
# look like broken source. Same source-digest stamp, same fail-closed shape.
if [[ ! -f packages/shared/dist/index.js ]]; then
  printf 'Shared package is not built; run make build\n' >&2
  exit 1
fi

readonly SHARED_STAMP=packages/shared/dist/.source.sha256

if [[ ! -f "$SHARED_STAMP" ]]; then
  printf 'Shared dist predates source-drift tracking; run make build\n' >&2
  exit 1
fi

EXPECTED_SHARED="$(node scripts/shared-source-digest.mjs)"
readonly EXPECTED_SHARED
GENERATED_SHARED="$(cat "$SHARED_STAMP")"
readonly GENERATED_SHARED

if [[ "$GENERATED_SHARED" != "$EXPECTED_SHARED" ]]; then
  printf 'Shared dist is stale: built from source %s, current source is %s; run make build\n' \
    "${GENERATED_SHARED:0:12}" "${EXPECTED_SHARED:0:12}" >&2
  exit 1
fi

node scripts/workspace-policy.mjs

printf 'Delivery prerequisites ready (node %s, pnpm %s).\n' \
  "$(node --version)" "$ACTUAL_PNPM"
