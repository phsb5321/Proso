#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly SCHEMA_STAMP=packages/server/src/generated/prisma/.schema.sha256

generate() {
  pnpm --filter @proso/server exec prisma generate
}

# Record the schema this client was generated from, so `make doctor` can refuse
# a client that has since drifted instead of letting `typecheck` fail with
# property errors that read like broken source.
stamp() {
  node scripts/prisma-schema-digest.mjs >"$SCHEMA_STAMP"
}

if generate; then
  stamp
  exit 0
fi

if [[ -f /etc/NIXOS && -x "$(command -v nix || true)" ]]; then
  printf 'Native Prisma engine unavailable; resolving the NixOS engine package.\n' >&2
  engine_root="$(nix build --no-link --print-out-paths nixpkgs#prisma-engines)"
  if [[ ! -x "$engine_root/bin/schema-engine" ]]; then
    printf 'NixOS Prisma schema engine was not found at %s\n' "$engine_root" >&2
    exit 1
  fi
  PRISMA_SCHEMA_ENGINE_BINARY="$engine_root/bin/schema-engine" generate
  stamp
  exit 0
fi

printf 'Prisma generation failed and no NixOS fallback applies.\n' >&2
exit 1
