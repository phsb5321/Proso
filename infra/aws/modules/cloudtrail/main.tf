# A multi-region CloudTrail writing validated, KMS-encrypted logs to a private
# bucket in the same account.
#
# Cost: management events to a single trail are free; the customer-managed KMS
# key is USD 1.00/month and the log storage is cents. That USD 1 is deliberate —
# without a CMK the logs are encrypted with a key AWS also controls, and an
# audit log you cannot prove was not rewritten is not an audit log.

locals {
  trail_arn  = "arn:${var.partition}:cloudtrail:${var.region}:${var.account_id}:trail/${var.name}"
  bucket_arn = "arn:${var.partition}:s3:::${var.bucket_name}"
}

# ---------------------------------------------------------------- KMS

data "aws_iam_policy_document" "key" {
  # checkov:skip=CKV_AWS_356:False positive on a KMS *key policy*. AWS requires
  # Resource to be "*" here — it means "this KMS key", not "every resource".
  # The key ARN does not exist while the key is being created, so it cannot be
  # named. See "Key policy format" in the KMS Developer Guide: "the value of
  # the Resource element is *, which means 'this KMS key'".
  # checkov:skip=CKV_AWS_109:Same false positive — the kms:* grant is the
  # mandatory account-root statement without which the key becomes orphaned and
  # unmanageable. Its scope is this key alone.
  # checkov:skip=CKV_AWS_111:Same false positive, same single-key scope.

  # Without this the key becomes unmanageable the moment the creating principal
  # loses access — KMS has no back door.
  statement {
    sid       = "AccountRootManagesTheKey"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${var.partition}:iam::${var.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudTrailEncryptsLogs"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    # Scoped to this one trail: a confused-deputy guard, so another account's
    # trail cannot borrow the key by naming it.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "CloudTrailDescribesTheKey"
    effect    = "Allow"
    actions   = ["kms:DescribeKey"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "AccountReadsLogs"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:ReEncryptFrom"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${var.partition}:iam::${var.account_id}:root"]
    }

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = [local.trail_arn]
    }
  }
}

resource "aws_kms_key" "trail" {
  description             = "CloudTrail log encryption for ${var.name}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.key.json
  tags                    = var.tags
}

resource "aws_kms_alias" "trail" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.trail.key_id
}

# ---------------------------------------------------------------- log bucket

resource "aws_s3_bucket" "trail" {
  # checkov:skip=CKV_AWS_144:Cross-region replication doubles storage cost and
  # adds a second bucket plus a replication role. For a sandbox audit log whose
  # loss costs nothing, that is not a trade worth making. See
  # docs/root-key-retirement-plan.md §7 for the condition that flips this.
  # checkov:skip=CKV2_AWS_62:Event notifications here would fire on every
  # CloudTrail delivery with nothing subscribed. An unsubscribed notification is
  # a gate that cannot fail; alerting is the budget alarm's job today.
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "trail" {
  bucket = aws_s3_bucket.trail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs off entirely. CloudTrail still delivers: it sends
# s3:x-amz-acl=bucket-owner-full-control, which BucketOwnerEnforced accepts.
resource "aws_s3_bucket_ownership_controls" "trail" {
  bucket = aws_s3_bucket.trail.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.trail.arn
    }
    # S3 Bucket Keys cut KMS request charges by ~99%; without it, one KMS call
    # per object turns a cheap log bucket into a metered one.
    bucket_key_enabled = true
  }
}

# Self-logging with a prefix. Pointing access logs at a second bucket only moves
# the question ("who logs the log bucket?") one hop; the prefix keeps them out
# of the AWSLogs/ tree CloudTrail owns.
resource "aws_s3_bucket_logging" "trail" {
  bucket        = aws_s3_bucket.trail.id
  target_bucket = aws_s3_bucket.trail.id
  target_prefix = "s3-access-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id

  rule {
    id     = "expire-trail-logs"
    status = "Enabled"

    filter {
      prefix = "AWSLogs/"
    }

    expiration {
      days = var.log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.log_retention_days
    }
  }

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {
      prefix = "s3-access-logs/"
    }

    expiration {
      days = var.log_retention_days
    }
  }

  # A failed multipart upload is invisible in the console and billed forever.
  rule {
    id     = "abandon-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.trail]
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AWSCloudTrailAclCheck"
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl"]
    resources = [local.bucket_arn]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "AWSCloudTrailWrite"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${local.bucket_arn}/AWSLogs/${var.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  # With ACLs disabled, server access logging is granted by policy rather than
  # by the legacy log-delivery ACL group.
  statement {
    sid       = "S3ServerAccessLogDelivery"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${local.bucket_arn}/s3-access-logs/*"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [local.bucket_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      local.bucket_arn,
      "${local.bucket_arn}/*",
    ]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id
  policy = data.aws_iam_policy_document.bucket.json

  # Attaching a policy to a bucket that still allows public policies would open
  # a window, however brief.
  depends_on = [aws_s3_bucket_public_access_block.trail]
}

# ---------------------------------------------------------------- trail

#trivy:ignore:AVD-AWS-0162 same decision as the CKV2_AWS_10 note below
resource "aws_cloudtrail" "this" {
  # checkov:skip=CKV2_AWS_10:CloudWatch Logs delivery is billed per GB ingested
  # and per GB stored on top of the S3 copy, and buys metric filters this
  # account does not yet consume. It is the right control for the management
  # account specifically (a root-usage metric filter) — tracked in
  # docs/root-key-retirement-plan.md §7, not skipped there.
  # checkov:skip=CKV_AWS_252:An SNS topic on a trail fires on every log-file
  # delivery, roughly every five minutes, forever. Nothing would subscribe to
  # it. Delivery failure is visible via the trail's own status.
  name           = var.name
  s3_bucket_name = aws_s3_bucket.trail.id
  kms_key_id     = aws_kms_key.trail.arn

  # A single-region trail misses anything done in a region nobody is watching,
  # which is where a mistake or an intruder ends up by default.
  is_multi_region_trail = true

  # IAM, STS and CloudFront are global services whose events land in us-east-1.
  include_global_service_events = true

  # Digest files, so a deleted or edited log can be detected rather than assumed.
  enable_log_file_validation = true

  enable_logging = true
  tags           = var.tags

  depends_on = [aws_s3_bucket_policy.trail]
}
