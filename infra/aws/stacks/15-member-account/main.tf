locals {
  tags = {
    ManagedBy   = "terraform"
    Stack       = "15-member-account"
    Environment = "prod"
  }
}

# GATED — ADR-001 §5. Do not apply without Pedro's explicit, in-turn go.
#
# Two properties make this different from every other resource in the repo:
#
#   * It uses the root user once. Organizations account creation is the single
#     operation ADR-001 §4.3 reserves for root.
#   * It is close to irreversible. Closing an AWS account starts a 90-day
#     suspension before the account is deleted, the email address stays claimed
#     during that window, and the account still counts against the org quota.
#
# Hence the two guards below.
resource "aws_organizations_account" "proso_prod" {
  name  = var.account_name
  email = var.account_email

  # Land it directly in the Workloads OU. Creating it at the root and moving it
  # afterwards leaves a window in which no OU-level SCP applies.
  parent_id = var.workloads_ou_id

  # The cross-account role the management account uses to reach in. Terraform's
  # default name; kept explicit because everything downstream assumes it.
  role_name = "OrganizationAccountAccessRole"

  # Lets an IAM principal in this account see its own billing data without
  # needing the management account.
  iam_user_access_to_billing = "ALLOW"

  # GUARD 1: removing this resource from Terraform must never close the AWS
  # account. Default is false; stated because the failure mode is a 90-day
  # suspension nobody meant to start.
  close_on_deletion = false

  tags = local.tags

  lifecycle {
    # GUARD 2: `terraform destroy` fails at plan time rather than detaching a
    # live production account from its OU.
    prevent_destroy = true

    # The account's own email and name can only be changed by signing in to it,
    # so drift here is not something this stack should try to correct.
    ignore_changes = [email, name, role_name, iam_user_access_to_billing]
  }
}

# The workload account gets the same access primitive as everything else: a
# permission set from the existing Identity Center instance, not an IAM user.
module "prod_admin" {
  source = "../../modules/sso-permission-set"

  instance_arn = var.sso_instance_arn
  name         = "ProsoProdAdmin"
  description  = "Break-glass administrator inside proso-prod. Routine deploys use the least-privilege deploy role from stacks/00-bootstrap, not this."

  managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
  allow_admin         = true

  # Shorter than the sandbox equivalent: this one reaches production.
  session_duration = "PT2H"

  principal_id = var.platform_admins_group_id
  account_ids  = [aws_organizations_account.proso_prod.id]
  tags         = local.tags
}
