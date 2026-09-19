#!/usr/bin/env bash
# Build the public AMO package and its minimal, remotely reachable source closure.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "package-amo-listed: working tree is not clean; commit the reviewed source first" >&2
  exit 1
fi

version="$(node -p "require('./packages/extension/package.json').version")"
head="$(git rev-parse HEAD)"
branch="$(git symbolic-ref --quiet --short HEAD || true)"
[[ -n "$branch" ]] || { echo "package-amo-listed: detached HEAD is not publishable" >&2; exit 1; }
remote_head="$(git ls-remote --exit-code origin "refs/heads/$branch" 2>/dev/null | cut -f1 || true)"
if [[ "$remote_head" != "$head" ]]; then
  echo "package-amo-listed: push $branch first (origin=$remote_head, HEAD=$head)" >&2
  exit 1
fi

out="packages/extension/.output-listed"
wxt_zip="$out/prosoextension-$version-firefox.zip"
listed_zip="$out/proso-$version-firefox-listed.zip"
source_zip="$out/proso-$version-sources.zip"

pnpm --filter @proso/extension zip:firefox-listed
[[ -f "$wxt_zip" ]] || { echo "package-amo-listed: missing $wxt_zip" >&2; exit 1; }
cp "$wxt_zip" "$listed_zip"

archive_paths=(
  AMO_BUILD.md
  LICENSE
  README.md
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  shell.nix
  tsconfig.base.json
  scripts/shared-source-digest.mjs
  packages/extension
  packages/shared
)

git archive --format=zip \
  --add-virtual-file="SOURCE_COMMIT:$head" \
  --add-virtual-file="SOURCE_REF:refs/heads/$branch" \
  --output="$source_zip" \
  HEAD "${archive_paths[@]}"

if unzip -Z1 "$source_zip" | grep -Eq '^(infra/|packages/server/|services/)'; then
  echo "package-amo-listed: source archive escaped the extension build closure" >&2
  exit 1
fi

npx web-ext lint \
  --source-dir packages/extension/.output-listed/firefox-mv2 \
  --output=text

printf 'AMO package ready at %s\n' "$head"
sha256sum "$listed_zip" "$source_zip"
