terraform {
  # 1.11 is the floor for S3-native state locking (`use_lockfile`), which is
  # what lets this backend exist without a DynamoDB lock table. See ADR-001 §2.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }
}
