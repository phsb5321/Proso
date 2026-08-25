output "minimum_password_length" {
  description = "Effective minimum console password length."
  value       = aws_iam_account_password_policy.this.minimum_password_length
}

output "expire_passwords" {
  description = "Whether AWS considers passwords expiring under this policy."
  value       = aws_iam_account_password_policy.this.expire_passwords
}
