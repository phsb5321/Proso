data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  bucket_name = coalesce(var.bucket_name, "${var.name}-${data.aws_caller_identity.current.account_id}")
  log_bucket  = "${local.bucket_name}-logs"

  # The auto-update payload is managed by Terraform, not by the deploy script,
  # so both of its invariants are enforced at plan time. See releases.tf.
  release_enabled = var.release_source_dir != null
}
