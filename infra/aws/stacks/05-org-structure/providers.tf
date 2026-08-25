provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # This stack runs in the management account and nowhere else. If credentials
  # resolve elsewhere, Terraform stops before planning.
  allowed_account_ids = [var.management_account_id]

  default_tags {
    tags = local.tags
  }
}
