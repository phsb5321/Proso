output "budget_name" {
  description = "Name of the created budget."
  value       = aws_budgets_budget.monthly_cost.name
}

output "budget_arn" {
  description = "ARN of the created budget."
  value       = aws_budgets_budget.monthly_cost.arn
}

output "notification_count" {
  description = "Total notifications attached (ACTUAL thresholds plus the forecast one)."
  value       = length(var.actual_thresholds_percent) + 1
}
