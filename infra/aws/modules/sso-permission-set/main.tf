# One IAM Identity Center permission set plus its account assignments.
#
# This is the access primitive for the whole organisation. A permission set is
# materialised as a role in each assigned account and consumed with
# `aws sso login`, so credentials are short-lived and there is no static key to
# leak, rotate, or find in a backup. ADR-001 §3 (correction): Identity Center is
# already enabled, so IAM users are not the access path.

locals {
  grants_admin = contains(var.managed_policy_arns, "arn:${var.partition}:iam::aws:policy/AdministratorAccess")
}

resource "aws_ssoadmin_permission_set" "this" {
  instance_arn = var.instance_arn
  name         = var.name
  description  = var.description

  # How long a console/CLI session lasts before `aws sso login` is needed again.
  session_duration = var.session_duration

  # Where the console drops the user after assuming this permission set.
  relay_state = var.relay_state

  tags = var.tags

  lifecycle {
    precondition {
      condition     = local.grants_admin ? var.allow_admin : true
      error_message = "This permission set attaches AdministratorAccess. That is occasionally right and never accidental — set allow_admin = true at the call site to say so out loud."
    }
  }
}

resource "aws_ssoadmin_managed_policy_attachment" "this" {
  # checkov:skip=CKV_AWS_274:The check greps for the AdministratorAccess ARN. A
  # stronger, falsifiable control already sits above it: the permission set's
  # precondition refuses to plan unless the caller sets allow_admin = true, and
  # tests/permission_set.tftest.hcl proves that refusal by asserting the plan
  # fails without it. So admin here is always a line someone typed on purpose,
  # which is what the check is trying to achieve. The two current callers are a
  # disposable sandbox and a break-glass role; routine production deploys use
  # the least-privilege deploy role from stacks/00-bootstrap instead.
  for_each = toset(var.managed_policy_arns)

  instance_arn       = var.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this.arn
  managed_policy_arn = each.value
}

resource "aws_ssoadmin_permission_set_inline_policy" "this" {
  count = var.inline_policy == null ? 0 : 1

  instance_arn       = var.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this.arn
  inline_policy      = var.inline_policy
}

# The permission set only becomes a usable role once it is assigned to an
# account. An unassigned permission set is inert.
#
# count, not for_each: a caller that creates the account in the same run passes
# an id that is unknown until apply, and for_each cannot key on an unknown
# value. A list's *length* is known even when its elements are not, so count
# plans cleanly. The cost is index-based addressing, which matters only if an
# account is removed from the middle of the list.
resource "aws_ssoadmin_account_assignment" "this" {
  count = length(var.account_ids)

  instance_arn       = var.instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.this.arn

  principal_id   = var.principal_id
  principal_type = var.principal_type

  target_id   = var.account_ids[count.index]
  target_type = "AWS_ACCOUNT"
}
