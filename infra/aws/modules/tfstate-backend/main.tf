# Terraform state backend: one encrypted, versioned, access-logged bucket plus
# the CMK that protects it. No DynamoDB lock table — locking is S3-native
# (`use_lockfile = true`), which is why nothing here creates one.
#
# ADR-001 §2: "state is a secret". That is the reason for a customer-managed KMS
# key rather than free SSE-S3: a CMK gives a separate authorisation boundary and
# a CloudTrail record of every decrypt. It costs USD 1.00/month.

locals {
  # An S3 ARN is a pure function of the bucket name, so deriving it here rather
  # than reading aws_s3_bucket.*.arn keeps every policy known at plan time. A
  # reviewer sees the actual document in the plan output instead of "known
  # after apply", and the same property is what lets the tests assert on it.
  state_bucket_arn = "arn:aws:s3:::${var.bucket_name}"
  log_bucket_arn   = "arn:aws:s3:::${var.log_bucket_name}"

  # A state bucket that anyone can delete versions from is not a backup, so the
  # key policy keeps schedule-deletion in account IAM only.
  key_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          # Required: without a statement granting the account, the key is
          # unmanageable and can only be recovered by AWS Support.
          Sid       = "EnableAccountIAM"
          Effect    = "Allow"
          Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
          Action    = "kms:*"
          Resource  = "*"
        },
      ],
      length(var.reader_principal_arns) == 0 ? [] : [
        {
          Sid       = "AllowStateReaders"
          Effect    = "Allow"
          Principal = { AWS = var.reader_principal_arns }
          Action = [
            "kms:Decrypt",
            "kms:Encrypt",
            "kms:GenerateDataKey",
            "kms:DescribeKey",
          ]
          Resource = "*"
        },
      ]
    )
  })
}

resource "aws_kms_key" "state" {
  description             = "Encrypts the Terraform state bucket ${var.bucket_name}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = local.key_policy
  tags                    = var.tags
}

resource "aws_kms_alias" "state" {
  name          = "alias/${var.bucket_name}"
  target_key_id = aws_kms_key.state.key_id
}

# ---------------------------------------------------------------------------
# Access-log bucket (must exist before the state bucket can log into it)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  bucket = var.log_bucket_name
  tags   = var.tags

  # checkov:skip=CKV_AWS_18:This IS the log destination. Pointing it at itself
  # makes each delivery generate another record, and a third bucket to log the
  # log bucket only moves the same problem one hop.
  # checkov:skip=CKV_AWS_145:Server access logging supports "SSE-S3 only" for
  # the destination bucket — https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html
  # Applying the suggested CMK here would stop log delivery, i.e. break the very
  # control the check exists to protect. The state bucket itself does use a CMK.
  # checkov:skip=CKV_AWS_144:No cross-region replication — see "Accepted
  # deviations" in this module's README for the cost and recovery reasoning.
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
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

# SSE-S3, not the CMK: S3 log delivery cannot use a customer-managed key, so a
# CMK here would silently stop log delivery rather than fail loudly.
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}

    expiration {
      days = var.log_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Ownership is BucketOwnerEnforced, so ACLs are off and log delivery
        # has to be authorised by policy instead.
        Sid       = "AllowS3LogDelivery"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${local.log_bucket_arn}/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = local.state_bucket_arn }
          StringEquals = { "aws:SourceAccount" = var.account_id }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.log_bucket_arn, "${local.log_bucket_arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.logs]
}

# ---------------------------------------------------------------------------
# State bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = var.bucket_name
  tags   = var.tags

  # checkov:skip=CKV_AWS_144:No cross-region replication — see "Accepted
  # deviations" in this module's README for the cost and recovery reasoning.
}

# Satisfies CKV2_AWS_62 by actually being useful rather than by suppression:
# routing S3 events to the default EventBridge bus makes every write to state
# observable. S3 events to the default bus are not billed; only rules that match
# and targets that fire are, and none are created here.
resource "aws_s3_bucket_notification" "state" {
  bucket      = aws_s3_bucket.state.id
  eventbridge = true
}

resource "aws_s3_bucket_notification" "logs" {
  bucket      = aws_s3_bucket.logs.id
  eventbridge = true
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "state" {
  bucket        = aws_s3_bucket.state.id
  target_bucket = var.log_bucket_name
  target_prefix = "s3-access/${var.bucket_name}/"

  # target_bucket is the literal name rather than aws_s3_bucket.logs.id so the
  # plan is readable; the ordering edge that reference used to provide is kept
  # explicitly. Log delivery also needs the bucket policy to exist first.
  depends_on = [aws_s3_bucket_policy.logs]
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-superseded-state"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # No rule expires the <key>.tflock objects that `use_lockfile` writes: an S3
  # lifecycle filter matches a prefix or a tag, never a suffix, so any rule
  # broad enough to catch .tflock also catches the state object itself. A
  # crashed apply is cleared with `terraform force-unlock <id>` instead.

  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid       = "DenyInsecureTransport"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource  = [local.state_bucket_arn, "${local.state_bucket_arn}/*"]
          Condition = {
            Bool = { "aws:SecureTransport" = "false" }
          }
        },
        {
          # The bucket default is aws:kms with the CMK, but a client can override
          # it per-object. Refusing anything else keeps "state is a secret" true
          # for every object, not just the ones written with defaults.
          Sid       = "DenyUnencryptedWrites"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:PutObject"
          Resource  = "${local.state_bucket_arn}/*"
          Condition = {
            StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" }
          }
        },
      ],
      flatten([
        for index, prefix in var.sealed_state_prefixes : [
          {
            Sid       = "DenySealedStateObjects${index}"
            Effect    = "Deny"
            Principal = "*"
            Action = [
              "s3:GetObject",
              "s3:GetObjectVersion",
              "s3:PutObject",
              "s3:DeleteObject",
              "s3:DeleteObjectVersion",
            ]
            Resource = "${local.state_bucket_arn}/${prefix}*"
          },
          {
            Sid       = "DenySealedStateListing${index}"
            Effect    = "Deny"
            Principal = "*"
            Action    = "s3:ListBucket"
            Resource  = local.state_bucket_arn
            Condition = {
              StringLike = { "s3:prefix" = "${prefix}*" }
            }
          },
        ]
      ])
    )
  })

  depends_on = [aws_s3_bucket_public_access_block.state]
}
