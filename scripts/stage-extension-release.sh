#!/usr/bin/env bash
set -Eeuo pipefail

readonly browser="${1:-}"
case "$browser" in
  firefox|chrome) ;;
  *)
    printf 'usage: %s <firefox|chrome>\n' "${0##*/}" >&2
    exit 2
    ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_dir
repo_root="$(dirname -- "$script_dir")"
readonly repo_root
version="$(
  node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).version" \
    "$repo_root/packages/extension/package.json"
)"
readonly version
readonly source_dir="$repo_root/packages/extension/.output"
readonly target_dir="$repo_root/.output"
readonly source_archive="$source_dir/prosoextension-$version-$browser.zip"
readonly target_archive="$target_dir/proso-$version-$browser.zip"

[[ -f "$source_archive" ]] || {
  printf 'release archive not found: %s\n' "$source_archive" >&2
  exit 1
}

if [[ "$browser" == "firefox" ]]; then
  readonly source_bundle="$source_dir/prosoextension-$version-sources.zip"
  readonly target_bundle="$target_dir/proso-$version-sources.zip"
  [[ -f "$source_bundle" ]] || {
    printf 'release source bundle not found: %s\n' "$source_bundle" >&2
    exit 1
  }
fi

mkdir -p -- "$target_dir"
cp -- "$source_archive" "$target_archive"
if [[ "$browser" == "firefox" ]]; then
  cp -- "$source_bundle" "$target_bundle"
fi

printf 'staged %s %s release artifacts in %s\n' "$browser" "$version" "$target_dir"
