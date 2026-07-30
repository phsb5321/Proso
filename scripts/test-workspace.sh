#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'Missing required command: pnpm\n' >&2
  exit 1
fi

if [[ -f /etc/NIXOS ]]; then
  command -v nix >/dev/null 2>&1 || {
    printf 'nix is required to resolve the Prisma engine on NixOS\n' >&2
    exit 1
  }
  engine_root="$(nix build --no-link --print-out-paths nixpkgs#prisma-engines)"
  if [[ ! -x "$engine_root/bin/schema-engine" ]]; then
    printf 'NixOS Prisma schema engine was not found at %s\n' "$engine_root" >&2
    exit 1
  fi
  export PRISMA_SCHEMA_ENGINE_BINARY="$engine_root/bin/schema-engine"
fi

pnpm --parallel --aggregate-output -r test
