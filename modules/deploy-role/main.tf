# The role that runs plan and apply. Deliberately not AdministratorAccess
# (ADR-001 §2.5): it gets the state backend plus exactly what the site stack
# needs, and is widened only with evidence that a real plan failed without it.
#
# Policies are built with jsonencode() rather than aws_iam_policy_document on
# purpose: a data source is mocked away under `terraform test`, so asserting on
# it would prove nothing. A local can be asserted against directly.

locals {
  # Both policies are attached to the same role, so an explicit Deny here beats
  # every Allow above — IAM evaluates Deny first, unconditionally.
  denied_actions = [
    # Escalation: a role that can write IAM can grant itself anything.
    "iam:*",
    # Escalation: a role that can call Organizations can move or leave accounts,
    # or detach the SCPs that bound it.
    "organizations:*",
  ]

  # ADR-001 §4.6 — "destructive operations are never autonomous". Encoded in
  # IAM, so an agent that ignores the runbook is still stopped by the API.
  # DeleteBucket is denied on every bucket, not just the state bucket: a
  # bucket-replacing plan is exactly the change a human should approve.
  denied_destructive = {
    "s3:DeleteBucket"         = "*"
    "kms:ScheduleKeyDeletion" = var.state_kms_key_arn
    "kms:DisableKey"          = var.state_kms_key_arn
  }

  # Enumerated rather than "s3:*" because s3:* on a site bucket includes
  # PutBucketPublicAccessBlock and PutBucketAcl — i.e. the deploy role could
  # make the site bucket public. Trivy AWS-0345 flags exactly this.
  # Reads are wildcarded because the AWS provider issues a long, version-
  # dependent list of Get*/List* calls to refresh one bucket; they disclose
  # nothing that the write list does not already imply.
  site_bucket_actions = [
    "s3:Get*",
    "s3:List*",
    "s3:CreateBucket",
    "s3:PutBucketTagging",
    "s3:PutBucketVersioning",
    "s3:PutBucketPolicy",
    "s3:DeleteBucketPolicy",
    "s3:PutBucketPublicAccessBlock",
    "s3:PutBucketOwnershipControls",
    "s3:PutEncryptionConfiguration",
    "s3:PutLifecycleConfiguration",
    "s3:PutBucketLogging",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:AbortMultipartUpload",
  ]
  # Deliberately absent: s3:DeleteBucket (denied above), s3:PutBucketAcl and
  # s3:PutAccountPublicAccessBlock (would let the role undo its own exposure
  # controls), and s3:PutBucketWebsite — ADR-001 §3 serves the site through
  # CloudFront with OAC and explicitly not through a website endpoint, so the
  # role should be unable to create one.

  managed_bucket_arns = flatten([
    for p in var.managed_bucket_prefixes : [
      "arn:aws:s3:::${p}*",
      "arn:aws:s3:::${p}*/*",
    ]
  ])

  # Identity Center provisions permission sets as roles with a generated name
  # suffix, so the trust is expressed as "any principal in this account whose
  # ARN looks like this permission set" rather than as a literal ARN.
  permission_set_arn_patterns = [
    for n in var.trusted_permission_set_names :
    "arn:aws:iam::${var.account_id}:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_${n}_*"
  ]

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(var.trusted_permission_set_names) == 0 ? [] : [
        {
          Sid    = "TrustedIdentityCenterPermissionSets"
          Effect = "Allow"
          # Scoping principal only. Without the condition below this would
          # trust the whole account, which is why the two are never separated.
          Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
          Action    = "sts:AssumeRole"
          Condition = {
            ArnLike = { "aws:PrincipalArn" = local.permission_set_arn_patterns }
          }
        },
      ],
      length(var.trusted_principal_arns) == 0 ? [] : [
        merge(
          {
            Sid       = "TrustedPrincipals"
            Effect    = "Allow"
            Principal = { AWS = var.trusted_principal_arns }
            Action    = "sts:AssumeRole"
          },
          var.require_mfa ? {
            Condition = {
              # BoolIfExists, per the IAM reference: with plain Bool the key's
              # absence makes the comparison fail in ways the docs call "not a
              # reliable way to check whether a request is authenticated using
              # MFA".
              BoolIfExists = { "aws:MultiFactorAuthPresent" = "true" }
            }
          } : {}
        ),
      ]
    )
  })

  permissions_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "DenyPrivilegeEscalation"
          Effect   = "Deny"
          Action   = local.denied_actions
          Resource = "*"
        },
      ],
      [
        for action, resources in local.denied_destructive : {
          Sid      = "DenyDestructive${replace(replace(action, ":", ""), "*", "")}"
          Effect   = "Deny"
          Action   = action
          Resource = resources
        }
      ],
      [
        {
          Sid    = "StateBackend"
          Effect = "Allow"
          Action = [
            "s3:ListBucket",
            "s3:GetBucketVersioning",
            "s3:GetBucketLocation",
          ]
          Resource = var.state_bucket_arn
        },
        {
          Sid    = "StateObjects"
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:PutObject",
            # Releasing an S3-native lock is a DeleteObject on <key>.tflock.
            "s3:DeleteObject",
          ]
          Resource = "${var.state_bucket_arn}/*"
        },
        {
          Sid    = "StateEncryption"
          Effect = "Allow"
          Action = [
            "kms:Decrypt",
            "kms:Encrypt",
            "kms:GenerateDataKey",
            "kms:DescribeKey",
          ]
          Resource = var.state_kms_key_arn
        },
        {
          Sid    = "SiteBuckets"
          Effect = "Allow"
          Action = local.site_bucket_actions
          # Prefix-scoped: the role cannot reach nixos-server-backups or any
          # other bucket outside the workload naming space.
          Resource = local.managed_bucket_arns
        },
        {
          Sid    = "BucketDiscovery"
          Effect = "Allow"
          Action = [
            "s3:ListAllMyBuckets",
            "s3:GetBucketLocation",
          ]
          # Neither action can be scoped to a resource; both are read-only.
          Resource = "*"
        },
        {
          Sid    = "ContentDelivery"
          Effect = "Allow"
          Action = ["cloudfront:*"]
          # CloudFront distributions and OACs are global; ARNs are account-scoped.
          Resource = "*"
        },
        {
          Sid    = "Certificates"
          Effect = "Allow"
          Action = [
            "acm:RequestCertificate",
            "acm:DescribeCertificate",
            "acm:ListCertificates",
            "acm:ListTagsForCertificate",
            "acm:AddTagsToCertificate",
            "acm:DeleteCertificate",
          ]
          Resource = "*"
        },
        {
          Sid      = "CostVisibility"
          Effect   = "Allow"
          Action   = ["budgets:*"]
          Resource = "arn:aws:budgets::${var.account_id}:budget/*"
        },
        {
          Sid    = "MetricsRead"
          Effect = "Allow"
          Action = [
            "cloudwatch:GetMetricData",
            "cloudwatch:GetMetricStatistics",
            "cloudwatch:ListMetrics",
            "cloudwatch:DescribeAlarms",
          ]
          Resource = "*"
        },
      ]
    )
  })
}

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  description          = "Terraform plan/apply for Proso. Least privilege; see modules/deploy-role/README.md."
  assume_role_policy   = local.assume_role_policy
  max_session_duration = var.max_session_duration
  tags                 = var.tags
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.role_name}-permissions"
  role   = aws_iam_role.deploy.id
  policy = local.permissions_policy
}
