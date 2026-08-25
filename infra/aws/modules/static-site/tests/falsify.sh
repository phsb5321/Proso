#!/usr/bin/env bash
# Prove each test in invariants.tftest.hcl can fail.
#
# A gate that cannot fail is not a gate. For every run block this plants the
# specific regression that run exists to catch, records that the suite turns red
# on exactly that run, reverts, and finally confirms the suite is green again.
#
# Run from the module directory, on a clean working tree:
#   ./tests/falsify.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

command -v terraform >/dev/null || {
  echo "terraform not on PATH" >&2
  exit 1
}

git diff --quiet -- . || {
  echo "working tree is dirty; falsification reverts with git checkout" >&2
  exit 1
}

failed=0

# falsify <run name> <file> <sed expression that plants the regression>
falsify() {
  local run="$1" file="$2" expr="$3" output

  sed -i "$expr" "$file"

  if git diff --quiet -- "$file"; then
    printf '  %-56s %s\n' "$run" "PLANT DID NOT APPLY"
    failed=1
    return
  fi

  if output="$(terraform test 2>&1)"; then
    printf '  %-56s %s\n' "$run" "NOT FALSIFIABLE — suite stayed green"
    failed=1
  elif grep -qE "run \"$run\"\.\.\..*fail" <<<"$output"; then
    printf '  %-56s %s\n' "$run" "red on plant"
  else
    printf '  %-56s %s\n' "$run" "WRONG RUN WENT RED"
    grep -E 'run "[a-z_]+"\.\.\.|^Error:|Error: ' <<<"$output" | head -5 | sed 's/^/      /' || true
    failed=1
  fi

  git checkout -- "$file"
}

echo "planting one regression per run:"

# The bucket would accept a policy granting public read.
falsify origin_bucket_is_not_public s3.tf \
  's#^\(  block_public_policy     = \)true#\1false#'

# The origin is reachable without a signed request.
falsify origin_is_reached_only_through_oac cloudfront.tf \
  '/origin_access_control_id = aws_cloudfront_origin_access_control.this.id/d'

# A request to / returns the origin's access-denied response.
falsify default_root_object_is_set cloudfront.tf \
  '/^  default_root_object = var.default_root_object$/d'

# Validation by email, which nobody can complete for this domain.
falsify certificate_is_requested_in_us_east_1 acm.tf \
  's#validation_method         = "DNS"#validation_method         = "EMAIL"#'

# The us-east-1 precondition stops preventing anything. It still has to reference
# an object: Terraform rejects a precondition whose condition is a constant.
falsify certificate_outside_us_east_1_is_refused acm.tf \
  's#data.aws_region.current.region == "us-east-1"#data.aws_region.current.region != ""#'

# Firefox refuses every add-on served under this type.
falsify xpi_objects_are_served_as_x_xpinstall releases.tf \
  's#"application/x-xpinstall"#"binary/octet-stream"#'

# Installed extensions look for the manifest at the root and find nothing.
falsify update_payload_lands_at_the_site_root releases.tf \
  's#^  key = "updates.json"$#  key = "meta/updates.json"#'

# The manifest may advertise any host, including the one being migrated away.
falsify stale_update_host_is_refused_once_the_domain_is_attached releases.tf \
  's#!var.attach_custom_domain || alltrue(\[#true || alltrue([#'

# The grant is bound to the account instead of the distribution, so any
# distribution in the account could read the origin.
falsify origin_is_readable_only_by_this_distribution s3.tf \
  's#"AWS:SourceArn" = aws_cloudfront_distribution.this.arn#"aws:SourceAccount" = data.aws_caller_identity.current.account_id#'

# The grant names a prefix the delivery service never writes to, so AWS injects
# its own statement and the next apply deletes it.
falsify log_delivery_is_granted_the_prefix_aws_actually_writes_to s3.tf \
  's#/AWSLogs/\${data.aws_caller_identity.current.account_id}/CloudFront/\*#/cloudfront/*#'

echo
if terraform test >/dev/null 2>&1; then
  echo "  suite green again after every revert"
else
  echo "  SUITE STILL RED AFTER REVERT"
  failed=1
fi

exit "$failed"
