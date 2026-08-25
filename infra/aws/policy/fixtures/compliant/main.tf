# The gate's PASS fixture — a private, encrypted, versioned, logged S3 bucket.
#
# Why this exists: with no `.tf` in the repo yet, every scanner would exit 0 on
# an empty tree and the pipeline would be a gate that cannot fail. This fixture
# is the green control (scanned by `scripts/gate.sh` like any real stack); its
# sibling `../violations/` is the red control. Together they make the pipeline
# falsifiable — ADR-001 §4.7.
#
# It is also the reference shape for stack 20-site's origin bucket: private, no
# website endpoint, reached only through CloudFront OAC (ADR-001 §3).
#
# No `provider "aws"` block on purpose. `terraform validate` does not configure
# providers, so this validates offline; `main.tftest.hcl` supplies a mock
# provider for the plan-time test. Real credentials are never needed here.

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "bucket_name" {
  description = "Name of the origin bucket."
  type        = string
}

variable "log_bucket_name" {
  description = "Name of the access-log bucket that receives this bucket's logs."
  type        = string
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key used for SSE-KMS. Checkov CKV_AWS_145 rejects SSE-S3."
  type        = string
}

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "this" {
  bucket = aws_s3_bucket.this.id

  target_bucket = var.log_bucket_name
  target_prefix = "s3-access/${var.bucket_name}/"
}

# Multipart uploads that never complete are billed forever and are invisible in
# the object listing. Checkov CKV_AWS_300 wants this rule to exist.
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

# TLS-only. The public-access block already stops anonymous reads; this stops a
# credentialled caller reaching the bucket over plaintext HTTP.
resource "aws_s3_bucket_policy" "tls_only" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.tls_only.json
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

output "bucket_arn" {
  description = "ARN of the origin bucket."
  value       = aws_s3_bucket.this.arn
}
