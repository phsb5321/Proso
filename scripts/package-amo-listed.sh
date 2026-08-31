#!/usr/bin/env bash
# Build the public AMO package and a complete, committed corresponding-source archive.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "package-amo-listed: working tree is not clean; commit the reviewed source first" >&2
  exit 1
fi

version="$(node -p "require('./packages/extension/package.json').version")"
head="$(git rev-parse HEAD)"
out="packages/extension/.output-listed"
wxt_zip="$out/prosoextension-$version-firefox.zip"
listed_zip="$out/proso-$version-firefox-listed.zip"
source_zip="$out/proso-$version-sources.zip"

pnpm --filter @proso/extension zip:firefox-listed
[[ -f "$wxt_zip" ]] || { echo "package-amo-listed: missing $wxt_zip" >&2; exit 1; }
cp "$wxt_zip" "$listed_zip"

git archive --format=zip \
  --add-virtual-file="SOURCE_COMMIT:$head" \
  --output="$source_zip" \
  HEAD

npx web-ext lint \
  --source-dir packages/extension/.output-listed/firefox-mv2 \
  --output=text

printf 'AMO package ready at %s\n' "$head"
sha256sum "$listed_zip" "$source_zip"
