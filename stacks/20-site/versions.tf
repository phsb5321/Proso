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

  default_tags {
    tags = {
      Project   = "proso"
      Stack     = "20-site"
      ManagedBy = "terraform"
    }
  }
}
