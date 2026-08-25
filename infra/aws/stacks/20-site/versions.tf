terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }

  # Partial configuration: the bucket comes from stacks/00-bootstrap and is
  # supplied at init time, so this stack does not hardcode another stack's
  # output. See README.md.
  #
  #   terraform init -backend-config=backend.hcl
  #
  # use_lockfile is S3-native locking (Terraform >= 1.11). There is deliberately
  # no DynamoDB table — that pattern is legacy.
  backend "s3" {
    key          = "20-site/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

# CloudFront can only attach certificates issued in us-east-1, so the whole
# stack lives there. The module asserts this rather than trusting it.
provider "aws" {
  region = var.region

  # A stale or wrong profile aborts at provider configuration rather than
  # creating a distribution in the management account.
  allowed_account_ids = [var.account_id]

  # ADR-001 §2.5: routine plan/apply runs as the least-privilege deploy role,
  # never as an admin. Null falls back to the ambient credentials, which is what
  # `terraform test` and an offline validate use.
  dynamic "assume_role" {
    for_each = var.assume_role_arn == null ? [] : [var.assume_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "terraform-20-site"
    }
  }

  # Environment is not decoration. The org's SandboxRestrictions SCP denies any
  # create call whose request carries no Environment tag; it is authored but
  # attached to nothing today, so this is what keeps the stack appliable the day
  # it is attached to the Sandboxes OU.
  default_tags {
    tags = {
      Project     = "proso"
      Stack       = "20-site"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
