locals {
  tags = {
    ManagedBy   = "terraform"
    Stack       = "05-org-structure"
    Environment = "management"
  }

  management_state_bucket_name = "proso-management-tfstate-${var.management_account_id}"
  management_log_bucket_name   = "proso-management-tfstate-logs-${var.management_account_id}"

  # Routine Terraform work needs two things, and only these two.
  #
  # 1. Assume the deploy role. That role is the least-privilege boundary
  #    stacks/00-bootstrap defines; the same role is the target for a future
  #    OIDC CI principal, so there is one policy to audit rather than two.
  # 2. Reach the state backend directly. Terraform's S3 backend authenticates
  #    with the *ambient* session, not with the provider's assumed role, and
  #    stacks/00-bootstrap/sandbox.s3.tfbackend carries no role_arn. Without
  #    this statement `terraform init` fails before the deploy role is ever
  #    reached.
  infra_deploy_inline = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyForeignAccountState"
        Effect = "Deny"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:DeleteObjectVersion",
        ]
        Resource = "arn:aws:s3:::${var.state_bucket_name}/05-org-structure/*"
      },
      {
        Sid      = "AssumeTheDeployRole"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = "arn:aws:iam::${var.workload_account_id}:role/${var.deploy_role_name}"
      },
      {
        Sid      = "ReadWriteTerraformState"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.state_bucket_name}/*"
      },
      {
        Sid      = "ListTheStateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = "arn:aws:s3:::${var.state_bucket_name}"
      },
      {
        # The state bucket rejects AES256 writes, so every backend call goes
        # through KMS. Scoped by alias rather than key ARN because the ARN does
        # not exist until stacks/00-bootstrap has been applied, and by
        # kms:ViaService so these grants are unusable outside S3.
        Sid      = "UseTheStateKeyThroughS3Only"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.region}.amazonaws.com"
          }
          "ForAnyValue:StringEquals" = {
            "kms:ResourceAliases" = var.state_kms_alias
          }
        }
      },
    ]
  })
}

# Management-account state must have a management-account authorization
# boundary. Keeping it in the workload bucket would let workload identities
# rewrite state that PERSONAL_ROOT later applies.
module "management_tfstate_backend" {
  source = "../../modules/tfstate-backend"

  account_id      = var.management_account_id
  bucket_name     = local.management_state_bucket_name
  log_bucket_name = local.management_log_bucket_name

  tags = local.tags
}

# --------------------------------------------------------------- OU layout
#
# The `Sandboxes` OU already exists (ou-y7xb-qkp97z4j). This adds its sibling
# rather than a parallel structure, per ADR-001 §3 (correction).
#
#   r-y7xb
#   ├── Sandboxes   (exists)  <- Sandbox-Account
#   └── Workloads   (here)    <- proso-prod, created by stacks/15-member-account
#
resource "aws_organizations_organizational_unit" "workloads" {
  name      = "Workloads"
  parent_id = var.root_id
  tags      = local.tags

  lifecycle {
    # Deleting an OU that holds accounts fails anyway, but saying so here means
    # a careless `terraform destroy` stops at the plan.
    prevent_destroy = true
  }
}

# --------------------------------------------------------------- SCP attachment
#
# PREREQUISITE, measured 25/08/2026 and not modelled here: the root reports
# `PolicyTypes: []`, so SERVICE_CONTROL_POLICY is not enabled and no SCP can be
# attached — `SandboxRestrictions` exists but is inert. Enabling it is one
# reversible call against the management account:
#
#   aws organizations enable-policy-type --root-id r-y7xb \
#     --policy-type SERVICE_CONTROL_POLICY        # reverse: disable-policy-type
#
# It is deliberately CLI rather than Terraform: the only Terraform resource that
# owns it is `aws_organizations_organization`, and importing that hands one
# stack authority to alter the organisation's feature set. Not worth it for a
# one-time toggle.
#
# The policy attached below is a NEW one, not the existing `SandboxRestrictions`
# (p-ufly0ag5). That policy has two defects that would break Terraform outright,
# found by the site tab in docs/20-site-status.md and fixed here:
#
#  1. It denies `cloudfront:*` as a "paid service". CloudFront's 1 TB / 10M-request
#     free tier is indefinite for every account, and the site stack is a
#     CloudFront distribution serving 1.06 MB, so the deny is aimed at the wrong
#     risk and forbids the one workload this organisation exists to host.
#  2. It denies every create call carrying no `Environment` tag, via
#     `NotAction` + `Null: aws:RequestTag/Environment`. That cannot be satisfied:
#     `aws:RequestTag` only exists on operations that accept tags at creation,
#     and much of a normal stack does not — `s3:CreateBucket` takes no tags (the
#     provider issues `PutBucketTagging` afterwards), and sub-resources like
#     `aws_s3_bucket_policy` or `aws_s3_bucket_public_access_block` have no tags
#     at all. As written it forbids Terraform, not untagged resources. Tag
#     hygiene belongs in an Organizations *tag policy* or in cost-allocation
#     tags, not in an SCP; spend itself is caught by the budget alarm.
#
# `SandboxRestrictions` is attached to nothing and can be deleted once this is
# live: aws organizations delete-policy --policy-id p-ufly0ag5
resource "aws_organizations_policy" "sandbox_guardrails" {
  count = var.attach_service_control_policies ? 1 : 0

  name        = "SandboxGuardrails"
  description = "Keeps the sandbox cheap and keeps its guardrails on. Replaces SandboxRestrictions, which forbade CloudFront and, in practice, Terraform."
  type        = "SERVICE_CONTROL_POLICY"
  content     = file("${path.module}/../../policies/sandbox-guardrails.json")
  tags        = local.tags
}

resource "aws_organizations_policy_attachment" "sandbox_guardrails" {
  count = var.attach_service_control_policies ? 1 : 0

  policy_id = aws_organizations_policy.sandbox_guardrails[0].id
  target_id = var.sandboxes_ou_id
}

# --------------------------------------------------------------- who gets in
#
# A group, not a user, is the assignment principal: adding or removing a person
# then needs no Terraform run and no permission-set change.
resource "aws_identitystore_group" "platform" {
  identity_store_id = var.identity_store_id
  display_name      = "PlatformAdmins"
  description       = "Operates the AWS organisation. Replaces routine use of the root user."
}

# Creating this user makes Identity Center email a one-time password link. The
# person must open it and register MFA — that step cannot be automated, and is
# the only human gate between here and no-static-credentials access.
resource "aws_identitystore_user" "pedro" {
  identity_store_id = var.identity_store_id

  user_name    = var.operator_user_name
  display_name = var.operator_display_name

  name {
    given_name  = var.operator_given_name
    family_name = var.operator_family_name
  }

  emails {
    value   = var.operator_email
    primary = true
  }
}

resource "aws_identitystore_group_membership" "pedro" {
  identity_store_id = var.identity_store_id
  group_id          = aws_identitystore_group.platform.group_id
  member_id         = aws_identitystore_user.pedro.user_id
}

# --------------------------------------------------------------- permission sets

# The routine path. No admin: it can assume the deploy role and touch the state
# backend, nothing else.
#
# The NAME IS A CONTRACT. stacks/00-bootstrap sets
# `deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]`, and the
# deploy role's trust policy matches
# `…:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_ProsoInfraDeploy_*`.
# Renaming this permission set silently locks everyone out of the deploy role.
# tests/org_structure.tftest.hcl asserts the literal so the break is loud.
module "infra_deploy" {
  source = "../../modules/sso-permission-set"

  instance_arn = var.sso_instance_arn
  name         = "ProsoInfraDeploy"
  description  = "Routine Terraform plan/apply in the workload account, via the least-privilege deploy role. Name is a contract with stacks/00-bootstrap."

  inline_policy = local.infra_deploy_inline

  # Longer than break-glass on purpose: this session is low-privilege and has
  # to outlast a slow apply. Privilege, not convenience, sets session length.
  session_duration = "PT4H"
  principal_id     = aws_identitystore_group.platform.group_id
  account_ids      = [var.workload_account_id]
  tags             = local.tags
}

# Break-glass. Needed for a real reason, not as a comfort blanket: the very
# first `stacks/00-bootstrap` apply creates the state bucket and the deploy
# role, so neither exists yet and ProsoInfraDeploy grants nothing usable.
# After that it is for incidents only.
module "workload_break_glass" {
  source = "../../modules/sso-permission-set"

  instance_arn = var.sso_instance_arn
  name         = "WorkloadBreakGlass"
  description  = "Administrator in the workload account. For the first bootstrap apply and for incidents; routine work uses ProsoInfraDeploy."

  managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
  allow_admin         = true

  session_duration = "PT2H"
  principal_id     = aws_identitystore_group.platform.group_id
  account_ids      = [var.workload_account_id]
  tags             = local.tags
}

# The management account holds root and the restic/Proxmox/Dokku backup buckets.
# This permission set is what routine work uses there, and it is deliberately
# unable to read a single backup object — see the explicit Deny in the policy.
module "management_ops" {
  source = "../../modules/sso-permission-set"

  instance_arn = var.sso_instance_arn
  name         = "ManagementOps"
  description  = "Day-to-day operation of the management account: read org/IAM state, manage budgets. No data access."

  inline_policy = file("${path.module}/../../policies/management-ops-inline.json")

  session_duration = "PT4H"
  principal_id     = aws_identitystore_group.platform.group_id
  account_ids      = [var.management_account_id]
  tags             = local.tags
}
