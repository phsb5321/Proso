provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}

variables {
  name        = "test-trail"
  bucket_name = "test-trail-123456789012"
  account_id  = "123456789012"
}

run "trail_is_tamper_evident_and_covers_every_region" {
  command = plan

  assert {
    condition     = aws_cloudtrail.this.is_multi_region_trail
    error_message = "a single-region trail misses anything done in a region nobody is watching"
  }

  assert {
    condition     = aws_cloudtrail.this.enable_log_file_validation
    error_message = "without digest files a deleted or edited log cannot be detected"
  }

  assert {
    condition     = aws_cloudtrail.this.include_global_service_events
    error_message = "IAM and STS events are global; excluding them hides exactly the calls this trail exists to record"
  }

}

# The key ARN is only known after apply, so the plan-time proof that the trail
# points at *our* CMK needs the ARN pinned first.
run "trail_encrypts_with_the_module_owned_cmk" {
  command = plan

  override_resource {
    target          = aws_kms_key.trail
    override_during = plan
    values = {
      arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
    }
  }

  assert {
    condition     = aws_cloudtrail.this.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
    error_message = "logs must be encrypted with the customer-managed key, not an AWS-owned one"
  }
}

run "the_log_bucket_cannot_become_public" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.trail.block_public_acls,
      aws_s3_bucket_public_access_block.trail.block_public_policy,
      aws_s3_bucket_public_access_block.trail.ignore_public_acls,
      aws_s3_bucket_public_access_block.trail.restrict_public_buckets,
    ])
    error_message = "all four public-access-block switches must be on; three of four still leaves a path"
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.trail.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled entirely — object ACLs are the classic way a log bucket leaks"
  }
}

run "the_log_bucket_is_versioned_and_kms_encrypted" {
  command = plan

  assert {
    condition     = one(aws_s3_bucket_versioning.trail.versioning_configuration).status == "Enabled"
    error_message = "versioning is what makes an overwrite recoverable"
  }

  assert {
    condition = one([
      for r in aws_s3_bucket_server_side_encryption_configuration.trail.rule :
      one(r.apply_server_side_encryption_by_default).sse_algorithm
    ]) == "aws:kms"
    error_message = "bucket default encryption must be SSE-KMS"
  }

  assert {
    condition     = alltrue([for r in aws_s3_bucket_server_side_encryption_configuration.trail.rule : r.bucket_key_enabled])
    error_message = "without S3 Bucket Keys every object costs a KMS request"
  }

  assert {
    condition     = aws_kms_key.trail.enable_key_rotation
    error_message = "an audit-log key that never rotates is a long-lived secret"
  }
}

run "plaintext_http_is_denied_and_the_key_is_scoped_to_this_trail" {
  command = plan

  assert {
    condition     = length(regexall("DenyInsecureTransport", aws_s3_bucket_policy.trail.policy)) == 1
    error_message = "the bucket policy must deny requests made over plain HTTP"
  }

  assert {
    condition     = length(regexall("arn:aws:cloudtrail:us-east-1:123456789012:trail/test-trail", aws_kms_key.trail.policy)) > 0
    error_message = "the key policy must name this trail, or another account's trail could borrow the key"
  }
}

run "rejects_a_retention_that_cannot_answer_last_quarter" {
  command = plan

  variables {
    log_retention_days = 30
  }

  expect_failures = [var.log_retention_days]
}

run "rejects_an_account_id_that_is_not_an_account_id" {
  command = plan

  variables {
    account_id = "12345"
  }

  expect_failures = [var.account_id]
}

run "rejects_an_invalid_bucket_name" {
  command = plan

  variables {
    bucket_name = "Not_A_Valid_Bucket"
  }

  expect_failures = [var.bucket_name]
}
