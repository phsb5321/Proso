output "workloads_ou_id" {
  description = "Feed this to stacks/15-member-account as workloads_ou_id."
  value       = aws_organizations_organizational_unit.workloads.id
}

output "platform_admins_group_id" {
  description = "Identity Store group that holds every permission set assignment."
  value       = aws_identitystore_group.platform.group_id
}

output "infra_deploy_permission_set_arn" {
  description = "ARN of the ProsoInfraDeploy permission set — the routine path."
  value       = module.infra_deploy.permission_set_arn
}

output "infra_deploy_permission_set_name" {
  description = "Feed this to stacks/00-bootstrap as deploy_role_trusted_permission_set_names."
  value       = module.infra_deploy.name
}

output "workload_break_glass_permission_set_arn" {
  description = "ARN of the WorkloadBreakGlass permission set."
  value       = module.workload_break_glass.permission_set_arn
}

output "management_ops_permission_set_arn" {
  description = "ARN of the ManagementOps permission set."
  value       = module.management_ops.permission_set_arn
}
