#!/usr/bin/env bash
# Publish the Proso site to the S3 origin behind CloudFront.
#
#   deploy-site.sh assemble [--repo DIR] [--out DIR]
#       Build the site tree the way the GitHub Pages workflow does:
#       packages/site + packages/legal -> legal/ + the gh-pages updates.json
#       and releases/. Terraform reads updates.json and releases/*.xpi from this
#       tree, so assemble before plan/apply as well as before deploy.
#
#   deploy-site.sh deploy [--site DIR] [--stack DIR] [--bucket B] [--distribution D]
#                         [--prune] [--dry-run]
#       Sync the marketing pages with explicit content types, verify the
#       Terraform-owned auto-update objects, and invalidate CloudFront.
#
# Content types are set per extension rather than guessed. `aws s3 sync` infers
# from the local mimetypes database, which does not know .xpi and would publish
# add-ons as binary/octet-stream — Firefox then refuses to install them, with no
# error the user can act on.
#
# updates.json and releases/*.xpi are NOT synced here. Terraform owns them
# (modules/static-site/releases.tf) so their keys and content types are enforced
# at plan time. Corresponding-source .zip archives share releases/ but are
# published by this script as application/zip.
set -euo pipefail

readonly REPO_DEFAULT="${HOME}/Documents/Code/personal/proso"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly STACK_DEFAULT="${REPO_ROOT}/stacks/20-site"

# Extension -> Content-Type. Anything not listed is uploaded with the AWS CLI's
# own guess; add it here rather than relying on that.
content_type_for() {
  case "${1##*.}" in
    html) echo "text/html; charset=utf-8" ;;
    css) echo "text/css; charset=utf-8" ;;
    js) echo "application/javascript; charset=utf-8" ;;
    json) echo "application/json" ;;
    xml) echo "application/xml" ;;
    txt) echo "text/plain; charset=utf-8" ;;
    md) echo "text/markdown; charset=utf-8" ;;
    png) echo "image/png" ;;
    svg) echo "image/svg+xml" ;;
    ico) echo "image/x-icon" ;;
    woff2) echo "font/woff2" ;;
    xpi) echo "application/x-xpinstall" ;;
    zip) echo "application/zip" ;;
    *) echo "" ;;
  esac
}

die() {
  echo "deploy-site: $*" >&2
  exit 1
}

# --- assemble ----------------------------------------------------------------

cmd_assemble() {
  local repo="$REPO_DEFAULT" out=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        repo="$2"
        shift 2
        ;;
      --out)
        out="$2"
        shift 2
        ;;
      *) die "unknown argument: $1" ;;
    esac
  done

  [[ -d "$repo/packages/site" ]] || die "no packages/site under $repo"
  out="${out:-$repo/.artifacts/site}"

  rm -rf "$out"
  mkdir -p "$out"
  cp -r "$repo/packages/site/." "$out/"
  cp -r "$repo/packages/legal" "$out/legal"
  # Workspace metadata is not a public site asset.
  rm "$out/package.json"

  # The auto-update payload lives only on gh-pages; it is built by the release
  # workflow, not by the site sources.
  git -C "$repo" fetch origin gh-pages --quiet
  git -C "$repo" archive origin/gh-pages updates.json releases | tar -x -C "$out"

  [[ -f "$out/updates.json" ]] || die "updates.json missing from the assembled tree"
  [[ -d "$out/releases" ]] || die "releases/ missing from the assembled tree"

  echo "assembled $(find "$out" -type f | wc -l) files into $out"
  find "$out" -type f -printf '  %P\n' | sort
}

# --- deploy ------------------------------------------------------------------

stack_output() {
  terraform -chdir="$1" output -raw "$2" 2>/dev/null || true
}

cmd_deploy() {
  local site="" stack="$STACK_DEFAULT" bucket="" distribution="" prune=0 dry_run=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --site)
        site="$2"
        shift 2
        ;;
      --stack)
        stack="$2"
        shift 2
        ;;
      --bucket)
        bucket="$2"
        shift 2
        ;;
      --distribution)
        distribution="$2"
        shift 2
        ;;
      --prune)
        prune=1
        shift
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      *) die "unknown argument: $1" ;;
    esac
  done

  site="${site:-$REPO_DEFAULT/.artifacts/site}"
  [[ -d "$site" ]] || die "no assembled site at $site — run 'deploy-site.sh assemble' first"

  bucket="${bucket:-$(stack_output "$stack" bucket_name)}"
  distribution="${distribution:-$(stack_output "$stack" distribution_id)}"
  [[ -n "$bucket" ]] || die "no bucket: pass --bucket or make 'terraform output bucket_name' work in $stack"
  [[ -n "$distribution" ]] || die "no distribution: pass --distribution or make 'terraform output distribution_id' work in $stack"

  local aws_dry=()
  ((dry_run)) && aws_dry=(--dryrun)

  echo "==> syncing $site -> s3://$bucket (terraform owns updates.json and releases/)"

  # One pass per content type. --exclude '*' then --include narrows each pass to
  # the extensions that share a type, so nothing is uploaded with a guessed one.
  local ext ctype
  for ext in html css js json xml txt md png svg ico woff2; do
    ctype="$(content_type_for "x.$ext")"
    aws s3 sync "$site" "s3://$bucket" \
      "${aws_dry[@]}" \
      --exclude '*' \
      --include "*.$ext" \
      --exclude 'updates.json' \
      --exclude 'releases/*' \
      --content-type "$ctype" \
      --no-progress
  done

  # Corresponding-source archives are public release material but not part of
  # Firefox's auto-update protocol, so Terraform does not need to own them.
  aws s3 sync "$site/releases" "s3://$bucket/releases" \
    "${aws_dry[@]}" \
    --exclude '*' \
    --include '*.zip' \
    --content-type "application/zip" \
    --no-progress

  # CNAME has no extension and is a GitHub Pages artefact; it is harmless but
  # must not be published as octet-stream if it is published at all.
  if [[ -f "$site/CNAME" ]]; then
    aws s3 cp "$site/CNAME" "s3://$bucket/CNAME" \
      "${aws_dry[@]}" \
      --content-type "text/plain; charset=utf-8" \
      --no-progress
  fi

  if ((dry_run)); then
    echo "==> (dry run) skipping the auto-update verification and the orphan report"
  else
    echo "==> verifying the Terraform-owned auto-update objects"
    verify_object "$bucket" "updates.json" "application/json"
    local xpi
    while IFS= read -r xpi; do
      verify_object "$bucket" "releases/$(basename "$xpi")" "application/x-xpinstall"
    done < <(find "$site/releases" -name '*.xpi' -type f)
    local archive
    while IFS= read -r archive; do
      verify_object "$bucket" "releases/$(basename "$archive")" "application/zip"
    done < <(find "$site/releases" -name '*.zip' -type f)

    echo "==> orphaned objects (present in the bucket, absent from $site)"
    report_orphans "$bucket" "$site" "$prune"
  fi

  echo "==> invalidating $distribution"
  if ((dry_run)); then
    echo "  (dry run) aws cloudfront create-invalidation --distribution-id $distribution --paths '/*'"
  else
    aws cloudfront create-invalidation \
      --distribution-id "$distribution" \
      --paths '/*' \
      --query 'Invalidation.{Id:Id,Status:Status}' \
      --output text
  fi
}

verify_object() {
  local bucket="$1" key="$2" want="$3" got

  got="$(aws s3api head-object --bucket "$bucket" --key "$key" --query 'ContentType' --output text 2>/dev/null || true)"

  if [[ -z "$got" || "$got" == "None" ]]; then
    die "s3://$bucket/$key is missing. Terraform owns it — run 'terraform apply' in the stack with site_source_dir set."
  fi

  if [[ "$got" != "$want" ]]; then
    die "s3://$bucket/$key is served as '$got', expected '$want'. Firefox will not install an add-on served under any other type."
  fi

  echo "  ok  $key  $got"
}

# Pruning deletes published content, so it never happens by default. Versioning
# is on, so a prune leaves a delete marker rather than destroying the object.
report_orphans() {
  local bucket="$1" site="$2" prune="$3"
  local remote local_keys orphans

  remote="$(aws s3api list-objects-v2 --bucket "$bucket" --query 'Contents[].Key' --output text |
    tr '\t' '\n' | grep -v '^None$' | sort)"
  local_keys="$(cd "$site" && find . -type f -printf '%P\n' | sort)"
  orphans="$(comm -23 <(echo "$remote") <(echo "$local_keys") || true)"

  if [[ -z "$orphans" ]]; then
    echo "  none"
    return
  fi

  while IFS= read -r key; do
    echo "  $key"
  done <<<"$orphans"

  if ((prune)); then
    echo "$orphans" | while IFS= read -r key; do
      [[ -n "$key" ]] && aws s3api delete-object --bucket "$bucket" --key "$key" >/dev/null
    done
    echo "  pruned $(echo "$orphans" | wc -l) object(s) (delete markers; versions retained)"
  else
    echo "  not pruned — rerun with --prune to remove them"
  fi
}

# --- entry point -------------------------------------------------------------

case "${1:-}" in
  assemble)
    shift
    cmd_assemble "$@"
    ;;
  deploy)
    shift
    cmd_deploy "$@"
    ;;
  *)
    sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
