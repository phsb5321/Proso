output "workloads_ou_id" {
  description = "Feed this to stacks/15-member-account as workloads_ou_id."
  value       = aws_organizations_organizational_unit.workloads.id
}

output "platform_admins_group_id" {
  description = "Identity Store group that holds every permission set assignment."
  value       = aws_identitystore_group.platform.group_id
}

output "sandbox_admin_permission_set_arn" {
  description = "ARN of the SandboxAdmin permission set."
  value       = module.sandbox_admin.permission_set_arn
}

output "management_ops_permission_set_arn" {
  description = "ARN of the ManagementOps permission set."
  value       = module.management_ops.permission_set_arn
}
