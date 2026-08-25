locals {
  tags = {
    ManagedBy = "terraform"
    Stack     = "10-account-baseline"
    # The org carries an (unattached) SCP that denies creating resources without
    # an Environment tag. Setting it here means attaching that SCP later is a
    # no-op for this stack rather than an outage.
    Environment = var.environment
  }
}

# ADR-001 §4.2: the budget alarm is the first apply in any account. Apply it on
# its own before anything else exists:
#
#   terraform apply -target=module.budget
#   terraform apply
#
module "budget" {
  source = "../../modules/budget-alarm"

  name                = "${var.environment}-monthly-cost"
  monthly_limit_usd   = var.monthly_budget_usd
  notification_emails = var.budget_notification_emails
}

module "password_policy" {
  source = "../../modules/password-policy"
}

module "cloudtrail" {
  source = "../../modules/cloudtrail"

  name       = "${var.environment}-trail"
  account_id = var.account_id
  region     = var.region

  # S3 bucket names are globally unique; the account id is the shortest thing
  # that guarantees no collision with another AWS customer.
  bucket_name        = "${var.environment}-cloudtrail-${var.account_id}"
  log_retention_days = var.log_retention_days
}
