# Origin bucket. Private in every sense: no website endpoint, no public ACLs,
# no public policy. The only principal that can read it is the CloudFront
# distribution created in cloudfront.tf, constrained by its ARN.

resource "aws_s3_bucket" "site" {
  # checkov:skip=CKV_AWS_145:SSE-KMS would force a customer-managed key. CloudFront
  # OAC cannot decrypt objects encrypted with the AWS-managed aws/s3 key because
  # that key policy is not editable, so the alternative is a CMK at USD 1.00/month
  # against a USD 0.01/month ceiling — for a bucket whose entire contents are
  # published to the public internet by design. SSE-S3 is the correct trade here.
  # checkov:skip=CKV_AWS_144:Cross-region replication doubles the storage of a
  # 1.2 MB bucket whose source of truth is a git repository. `deploy-site.sh
  # assemble && deploy` rebuilds it in full from the Proso repo, so replication
  # protects nothing that is not already replicated.
  # checkov:skip=CKV2_AWS_62:Event notifications need a consumer. Wiring S3 to
  # EventBridge with no rule attached satisfies the check and changes nothing;
  # object-level auditing belongs to CloudTrail data events at the account level.
  bucket = local.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3 rather than SSE-KMS. AVD-AWS-0132 is the same finding as checkov
# CKV_AWS_145 on the bucket above: a customer-managed key would be USD 1.00/month
# to encrypt files published to the public internet by design, and CloudFront OAC
# cannot decrypt objects written under the AWS-managed aws/s3 key at all.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "site" {
  bucket = aws_s3_bucket.site.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access/"
}

# Versioning keeps every superseded copy of every page. Without an expiry the
# only unbounded cost in this stack is the history of a site that is rebuilt
# from git on each deploy.
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "expire-superseded-objects"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.log_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Built with jsonencode() rather than aws_iam_policy_document, following
# modules/deploy-role: a data source is mocked away under `terraform test`, so
# asserting on it would prove nothing. A local can be asserted against directly.
locals {
  site_bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOACRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = {
          StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = { AWS = "*" }
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.site.arn,
          "${aws_s3_bucket.site.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = local.site_bucket_policy

  depends_on = [aws_s3_bucket_public_access_block.site]
}

# --- access log bucket -------------------------------------------------------

# AVD-AWS-0089 is checkov CKV_AWS_18: a log bucket that logs its own access is a
# write loop. This is the terminal sink.
#trivy:ignore:AVD-AWS-0089
resource "aws_s3_bucket" "logs" {
  # checkov:skip=CKV_AWS_18:A log bucket that logs its own access is a write loop.
  # This is the terminal sink; its own reads are covered by CloudTrail data events
  # at the account level (stacks/10-account-baseline).
  # checkov:skip=CKV_AWS_145:Same trade as the origin bucket, and S3 server access
  # logging cannot write into a bucket encrypted with an AWS-managed KMS key.
  # checkov:skip=CKV_AWS_144:Replicating access logs of a static site across
  # regions costs more than the logs are worth; they expire after
  # var.log_retention_days by design.
  # checkov:skip=CKV2_AWS_62:Same as the origin bucket — no consumer exists for
  # the notifications.
  bucket = local.log_bucket
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# AVD-AWS-0132 / CKV_AWS_145 again, and here it is not even a trade: S3 server
# access logging cannot write into a bucket encrypted with KMS, which Trivy's own
# rule text says. SSE-S3 is the only option for a log destination.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Logs are the only line item in this stack that grows without bound. Expire them.
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.log_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ACLs are disabled on the log bucket (BucketOwnerEnforced), so S3 server access
# logging must be authorised by bucket policy rather than the legacy
# LogDelivery ACL grant.
# CloudWatch Logs writes vended logs under a prefix IT chooses:
# AWSLogs/<account>/CloudFront/, with s3_delivery_configuration.suffix_path
# appended below that. Granting any other prefix grants nothing, and AWS then
# injects the statement it needs into this bucket policy on its own — which the
# NEXT apply deletes, silently stopping log delivery. Measured 25/08/2026; the
# statement below is the shape AWS wrote, so Terraform and the service agree.
locals {
  logs_bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowS3ServerAccessLogging"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/s3-access/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = aws_s3_bucket.site.arn }
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid       = "AWSLogDeliveryWrite1"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/CloudFront/*"
        Condition = {
          ArnLike = { "aws:SourceArn" = aws_cloudwatch_log_delivery_source.cloudfront.arn }
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
            "s3:x-amz-acl"      = "bucket-owner-full-control"
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = { AWS = "*" }
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.logs.arn,
          "${aws_s3_bucket.logs.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = local.logs_bucket_policy

  depends_on = [aws_s3_bucket_public_access_block.logs]
}
