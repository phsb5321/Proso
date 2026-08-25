provider "aws" {
  region  = var.region
  profile = var.aws_profile

  allowed_account_ids = [var.management_account_id]

  default_tags {
    tags = local.tags
  }
}
