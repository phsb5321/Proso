terraform {
  # 1.11 is the floor for S3-native state locking (`use_lockfile`), which the
  # stacks in this repo rely on instead of a DynamoDB lock table.
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.60"
    }
  }
}
