# ADR-001 §4.7 — every module ships a `terraform test`.
#
# The scanners check the SHAPE of the configuration; this checks the VALUES
# Terraform actually resolves, which is a different failure mode. A refactor
# that moves `block_public_acls` behind a variable defaulting to `false` keeps
# every Checkov and Trivy check passing (the attribute is still present) and
# still opens the bucket. This test is what catches that.
#
# `command = plan`, and the provider below is credential-free: the skip flags
# stop the AWS provider from calling STS at configure time, so the whole gate
# stays runnable offline and on a runner with no AWS access. Nothing here can
# create a resource.

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock-access-key"
  secret_key                  = "mock-secret-key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  bucket_name     = "proso-site-origin-under-test"
  log_bucket_name = "proso-access-logs-under-test"
  kms_key_arn     = "arn:aws:kms:us-east-1:699475944323:key/11111111-2222-3333-4444-555555555555"
}

run "bucket_is_not_reachable_by_the_public" {
  command = plan

  assert {
    condition     = aws_s3_bucket_public_access_block.this.block_public_acls
    error_message = "block_public_acls is off: a PUT carrying a public ACL would be accepted."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.this.block_public_policy
    error_message = "block_public_policy is off: a bucket policy granting Principal '*' would be accepted."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.this.ignore_public_acls
    error_message = "ignore_public_acls is off: an already-set public ACL would still be honoured."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.this.restrict_public_buckets
    error_message = "restrict_public_buckets is off: a public policy would be evaluated for anonymous callers."
  }
}

run "objects_are_recoverable_and_encrypted_with_a_cmk" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning is not Enabled: an overwrite or delete would be unrecoverable."
  }

  # SSE-S3 would satisfy "encrypted at rest" while leaving key rotation and key
  # access policy outside our control — the distinction CKV_AWS_145 and
  # AVD-AWS-0132 both draw.
  #
  # `rule` and `apply_server_side_encryption_by_default` are SETS, not lists, so
  # they have no addressable index. `one()` both unwraps the element and asserts
  # there is exactly one — a second rule would make it return null and fail the
  # comparison, which is the behaviour we want.
  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "Encryption is not SSE-KMS, so the key is not customer-managed."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).kms_master_key_id == var.kms_key_arn
    error_message = "The configured KMS key is not the one passed in; encryption would silently fall back to the AWS-managed alias."
  }
}

run "access_is_logged_and_plaintext_transport_is_denied" {
  command = plan

  assert {
    condition     = aws_s3_bucket_logging.this.target_bucket == var.log_bucket_name
    error_message = "Server access logging does not point at the log bucket, so reads leave no audit trail."
  }

  # The public-access block already stops anonymous reads. This covers the other
  # half: a caller who HAS credentials must not be able to use them over
  # plaintext HTTP.
  assert {
    condition     = length(data.aws_iam_policy_document.tls_only.statement) == 1
    error_message = "Expected exactly one statement in the TLS-only bucket policy."
  }

  assert {
    condition     = data.aws_iam_policy_document.tls_only.statement[0].effect == "Deny"
    error_message = "The aws:SecureTransport statement must Deny, not Allow."
  }
}
