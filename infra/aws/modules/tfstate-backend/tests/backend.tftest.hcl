# Runs with no AWS credentials: the provider is mocked, so every assertion is
# about what the configuration actually renders, not about a live account.
mock_provider "aws" {}

variables {
  account_id            = "699475944323"
  bucket_name           = "proso-tfstate-699475944323"
  log_bucket_name       = "proso-tfstate-logs-699475944323"
  sealed_state_prefixes = ["05-org-structure/"]
  tags                  = { Environment = "sandbox" }
}

run "state_bucket_is_not_public" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "All four public-access-block flags must be true on the state bucket."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.logs.block_public_acls,
      aws_s3_bucket_public_access_block.logs.block_public_policy,
      aws_s3_bucket_public_access_block.logs.ignore_public_acls,
      aws_s3_bucket_public_access_block.logs.restrict_public_buckets,
    ])
    error_message = "All four public-access-block flags must be true on the log bucket."
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.state.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "Object ownership must be BucketOwnerEnforced so ACLs cannot re-open the bucket."
  }

  # A public-access block is only half the story: a bucket policy that allows a
  # wildcard principal to read is still a leak, and block_public_policy only
  # rejects policies S3 classifies as public.
  assert {
    condition = length([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s if s.Effect == "Allow" && try(s.Principal, null) == "*"
    ]) == 0
    error_message = "The state bucket policy must not Allow a wildcard principal."
  }
}

run "versioning_is_on" {
  command = plan

  assert {
    condition     = one(aws_s3_bucket_versioning.state.versioning_configuration).status == "Enabled"
    error_message = "State bucket versioning must be Enabled; without it an overwritten state is unrecoverable."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.logs.versioning_configuration).status == "Enabled"
    error_message = "Log bucket versioning must be Enabled."
  }
}

run "encryption_is_on" {
  command = plan

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "State must be encrypted with the customer-managed key (aws:kms), not SSE-S3."
  }

  assert {
    condition     = aws_kms_key.state.enable_key_rotation
    error_message = "The state CMK must have automatic key rotation enabled."
  }

  # The bucket default can be overridden per PutObject, so the policy has to
  # refuse anything that is not KMS-encrypted.
  assert {
    condition = length([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s if s.Sid == "DenyUnencryptedWrites" && s.Effect == "Deny"
    ]) == 1
    error_message = "The state bucket policy must deny writes that are not aws:kms encrypted."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s if s.Sid == "DenyInsecureTransport" && s.Effect == "Deny"
    ]) == 1
    error_message = "The state bucket policy must deny non-TLS access."
  }
}

run "sealed_state_is_unreadable_and_immutable" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : s
      if s.Sid == "DenySealedStateObjects0" && s.Effect == "Deny" &&
      s.Principal == "*" &&
      toset(s.Action) == toset(["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion"]) &&
      s.Resource == "arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/*"
    ]) == 1
    error_message = "sealed management state must be unreadable, immutable, and undeletable to every workload principal"
  }

  assert {
    condition = length([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : s
      if s.Sid == "DenySealedStateListing0" &&
      s.Condition.StringLike["s3:prefix"] == "05-org-structure/*"
    ]) == 1
    error_message = "sealed state keys must not be listable by their prefix"
  }
}

run "rejects_an_unsafe_sealed_prefix" {
  command = plan

  variables {
    sealed_state_prefixes = ["../05-org-structure/"]
  }

  expect_failures = [var.sealed_state_prefixes]
}

run "access_logging_targets_the_log_bucket" {
  command = plan

  assert {
    condition     = aws_s3_bucket_logging.state.target_bucket == var.log_bucket_name
    error_message = "State bucket access logs must be delivered to the dedicated log bucket."
  }
}

run "rejects_a_malformed_account_id" {
  command = plan

  variables {
    account_id = "69947594432"
  }

  expect_failures = [var.account_id]
}
