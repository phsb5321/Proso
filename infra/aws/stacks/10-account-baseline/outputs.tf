output "budget_name" {
  description = "Name of the monthly cost budget."
  value       = module.budget.budget_name
}

output "budget_notification_count" {
  description = "How many thresholds are wired to an email."
  value       = module.budget.notification_count
}

output "cloudtrail_arn" {
  description = "ARN of the account trail."
  value       = module.cloudtrail.trail_arn
}

output "cloudtrail_bucket" {
  description = "Bucket holding the trail logs."
  value       = module.cloudtrail.bucket_name
}

output "minimum_password_length" {
  description = "Effective console password minimum."
  value       = module.password_policy.minimum_password_length
}
