terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.60"
    }
  }

  # Local state until stacks/00-bootstrap exists. See versions.tf in
  # stacks/10-account-baseline for the migration block.
}
