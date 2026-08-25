locals {
  tags = {
    ManagedBy   = "terraform"
    Stack       = "05-org-structure"
    Environment = "management"
  }
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

# Full admin, but only inside the sandbox. The blast radius is an account that
# exists to be broken.
module "sandbox_admin" {
  source = "../../modules/sso-permission-set"

  instance_arn = var.sso_instance_arn
  name         = "SandboxAdmin"
  description  = "Administrator inside Sandbox-Account only. The account is disposable; the permission is not portable."

  managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
  allow_admin         = true

  session_duration = "PT8H"
  principal_id     = aws_identitystore_group.platform.group_id
  account_ids      = [var.sandbox_account_id]
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
