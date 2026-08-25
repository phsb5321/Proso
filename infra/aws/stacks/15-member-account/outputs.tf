output "account_id" {
  description = "Id of the created member account."
  value       = aws_organizations_account.proso_prod.id
}

output "account_arn" {
  description = "ARN of the created member account."
  value       = aws_organizations_account.proso_prod.arn
}

output "org_access_role_arn" {
  description = "Cross-account role the management account can assume into the new account."
  value       = "arn:aws:iam::${aws_organizations_account.proso_prod.id}:role/OrganizationAccountAccessRole"
}
