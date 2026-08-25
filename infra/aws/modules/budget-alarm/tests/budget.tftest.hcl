# Hermetic: every assertion is decided at plan time, so these run with mock
# credentials and never touch an AWS account.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}

variables {
  name                = "test-budget"
  monthly_limit_usd   = "5"
  notification_emails = ["pedrobalbino@pm.me"]
}

run "budget_is_monthly_and_uses_the_configured_limit" {
  command = plan

  assert {
    condition     = aws_budgets_budget.monthly_cost.limit_amount == "5"
    error_message = "budget limit must be the value passed in, not a provider default"
  }

  assert {
    condition     = aws_budgets_budget.monthly_cost.time_unit == "MONTHLY"
    error_message = "a budget on any other period would not match the billing cycle it is meant to guard"
  }

  assert {
    condition     = aws_budgets_budget.monthly_cost.budget_type == "COST"
    error_message = "budget_type must be COST — a USAGE budget does not observe spend"
  }
}

run "every_threshold_produces_a_notification_with_a_subscriber" {
  command = plan

  variables {
    actual_thresholds_percent = [50, 80, 100]
  }

  # Three ACTUAL thresholds plus the forecast notification.
  assert {
    condition     = length(aws_budgets_budget.monthly_cost.notification) == 4
    error_message = "expected one notification per ACTUAL threshold plus one FORECASTED notification"
  }

  assert {
    condition = alltrue([
      for n in aws_budgets_budget.monthly_cost.notification :
      length(n.subscriber_email_addresses) > 0
    ])
    error_message = "a notification with no subscriber fires into the void"
  }

  assert {
    condition = length([
      for n in aws_budgets_budget.monthly_cost.notification :
      n if n.notification_type == "FORECASTED"
    ]) == 1
    error_message = "the forecast alert is the one that arrives in time to act on; it must exist exactly once"
  }
}

run "credits_do_not_mask_spend" {
  command = plan

  assert {
    condition     = one(aws_budgets_budget.monthly_cost.cost_types).include_credit == false
    error_message = "counting credits hides real spend for exactly as long as the credit lasts"
  }
}

run "rejects_a_budget_nobody_is_told_about" {
  command = plan

  variables {
    notification_emails = []
  }

  expect_failures = [var.notification_emails]
}

run "rejects_a_malformed_subscriber" {
  command = plan

  variables {
    notification_emails = ["pedro at pm.me"]
  }

  expect_failures = [var.notification_emails]
}

run "rejects_a_zero_limit" {
  command = plan

  variables {
    monthly_limit_usd = "0"
  }

  expect_failures = [var.monthly_limit_usd]
}

run "rejects_a_threshold_outside_the_percentage_range" {
  command = plan

  variables {
    actual_thresholds_percent = [50, 150]
  }

  expect_failures = [var.actual_thresholds_percent]
}
