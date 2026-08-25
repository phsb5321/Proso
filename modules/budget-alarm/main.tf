# A monthly cost budget that emails a human before the bill becomes a surprise.
#
# ADR-001 §4.2 makes this the first apply in any account: nothing else is
# created until spend is observable. AWS Budgets itself is free for the first
# two budgets per account, so the guardrail costs nothing to keep.

resource "aws_budgets_budget" "monthly_cost" {
  name         = var.name
  budget_type  = "COST"
  limit_amount = var.monthly_limit_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    # Amortized, credit-free numbers are what a bill actually looks like once a
    # promotional credit lapses. Including credits would silently mask spend
    # for as long as the credit lasts, which is precisely when a mistake gets
    # made and not noticed.
    use_amortized  = true
    include_credit = false
    include_refund = false
  }

  # Early warnings on actual spend.
  dynamic "notification" {
    for_each = toset(var.actual_thresholds_percent)
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.notification_emails
    }
  }

  # A forecast breach is the one that arrives in time to do something about it:
  # a runaway resource trips this days before actual spend crosses the limit.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.forecast_threshold_percent
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.notification_emails
  }
}
