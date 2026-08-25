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

data "aws_iam_policy_document" "site" {
  statement {
    sid     = "AllowCloudFrontOACRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.site.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    resources = [
      aws_s3_bucket.site.arn,
      "${aws_s3_bucket.site.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json

  depends_on = [aws_s3_bucket_public_access_block.site]
}

# --- access log bucket -------------------------------------------------------

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
data "aws_iam_policy_document" "logs" {
  statement {
    sid     = "AllowS3ServerAccessLogging"
    effect  = "Allow"
    actions = ["s3:PutObject"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.logs.arn}/s3-access/*"]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.site.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # CloudFront standard logging v2 delivers through the vended-log pipeline,
  # which writes as this service principal rather than as the distribution.
  statement {
    sid     = "AllowVendedLogDelivery"
    effect  = "Allow"
    actions = ["s3:PutObject"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.logs.arn}/cloudfront/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    resources = [
      aws_s3_bucket.logs.arn,
      "${aws_s3_bucket.logs.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs.json

  depends_on = [aws_s3_bucket_public_access_block.logs]
}
