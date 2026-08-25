output "permission_set_arn" {
  description = "ARN of the permission set."
  value       = aws_ssoadmin_permission_set.this.arn
}

output "name" {
  description = "Permission set name."
  value       = aws_ssoadmin_permission_set.this.name
}

output "assigned_account_ids" {
  description = "Accounts this permission set is assigned to."
  value       = var.account_ids
}

output "grants_admin" {
  description = "Whether AdministratorAccess is attached."
  value       = local.grants_admin
}
