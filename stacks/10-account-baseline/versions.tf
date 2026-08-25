terraform {
  # 1.11 is the floor for S3-native state locking.
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.60"
    }
  }

  # State is local until stacks/00-bootstrap creates the state bucket (owned by
  # the Bootstrap tab). Migration is then:
  #
  #   backend "s3" {
  #     bucket       = "<from stacks/00-bootstrap outputs>"
  #     key          = "10-account-baseline/sandbox.tfstate"
  #     region       = "us-east-1"
  #     encrypt      = true
  #     use_lockfile = true   # S3-native locking; no DynamoDB table (ADR-001 §2.4)
  #   }
  #
  # followed by `terraform init -migrate-state`.
}
