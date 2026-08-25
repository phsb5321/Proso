provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # The strongest guardrail in this file. If the resolved credentials belong to
  # any other account, Terraform refuses before it plans — which is what stands
  # between a sandbox `apply` and the management account where root lives.
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = local.tags
  }
}
