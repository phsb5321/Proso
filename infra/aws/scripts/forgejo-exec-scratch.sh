#!/usr/bin/env bash
# Run a command from an executable clone of the current checkout.
#
# Forgejo's DynamicUser host executor checks out under its StateDirectory. On
# this host that tree is readable but no executable outside /nix/store can run:
# repo scripts, uv-managed Python, and Terraform provider plugins all return
# EACCES. The workflow still uses the pinned Nix shell; this wrapper relocates
# only the checkout and runtime caches to an executable temporary filesystem.
set -euo pipefail

(($# > 0)) || { echo "usage: $0 <command> [args...]" >&2; exit 2; }

repo_root="$(git rev-parse --show-toplevel)"
scratch_parent="${FORGEJO_EXEC_TMPDIR:-${TMPDIR:-/tmp}}"
mkdir -p "$scratch_parent"
scratch="$(mktemp -d "$scratch_parent/proso-infra-ci.XXXXXX")"

cleanup() {
  chmod -R u+w "$scratch" 2>/dev/null || true
  rm -rf -- "$scratch"
}
trap cleanup EXIT INT TERM

# ponytail: remove this copy when the runner's host workdir is executable.
# --no-local prevents hardlinks back to the non-executable source filesystem.
git clone --quiet --no-local "$repo_root" "$scratch/repo"
cd "$scratch/repo"

export HOME="$scratch/home"
export XDG_CACHE_HOME="$scratch/cache"
export XDG_DATA_HOME="$scratch/data"
export UV_CACHE_DIR="$scratch/cache/uv"
export UV_PYTHON_INSTALL_DIR="$scratch/data/uv/python"
export TMPDIR="$scratch/tmp"
export TMP="$TMPDIR"
export TEMP="$TMPDIR"
export TF_PLUGIN_CACHE_DIR="$scratch/terraform-plugin-cache"
mkdir -p "$HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$UV_CACHE_DIR" \
  "$UV_PYTHON_INSTALL_DIR" "$TMPDIR" "$TF_PLUGIN_CACHE_DIR"

"$@"
