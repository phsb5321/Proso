#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

for command_name in nix node pnpm; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

if [[ -f /etc/NIXOS ]]; then
  engine_root="$(nix build --no-link --print-out-paths nixpkgs#prisma-engines)"
  [[ -x "$engine_root/bin/schema-engine" ]] || {
    printf 'NixOS Prisma schema engine missing at %s\n' "$engine_root" >&2
    exit 1
  }
  export PRISMA_SCHEMA_ENGINE_BINARY="$engine_root/bin/schema-engine"
fi

pnpm --parallel --aggregate-output \
  --filter @proso/extension \
  --filter @proso/server \
  --filter @proso/log-gateway \
  run test:coverage

node scripts/quality/diff-coverage.mjs
