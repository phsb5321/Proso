output "role_arn" {
  description = <<-EOT
    ARN of the deploy role, for the backend `role_arn` / `assume_role` block.
    Derived from the account and name rather than read back from
    aws_iam_role.deploy.arn: an IAM role ARN is a pure function of those two,
    so deriving it keeps the value known at plan time. depends_on still ties
    the output to the resource, so nothing consumes it before the role exists.
  EOT
  value       = "arn:aws:iam::${var.account_id}:role/${var.role_name}"
  depends_on  = [aws_iam_role.deploy]
}

output "role_name" {
  description = "Name of the deploy role."
  value       = var.role_name
  depends_on  = [aws_iam_role.deploy]
}

output "permissions_policy_json" {
  description = "Rendered permissions policy. Exposed so tests and reviewers can assert on what was actually granted rather than on what the source appears to say."
  value       = local.permissions_policy
}

output "assume_role_policy_json" {
  description = "Rendered trust policy."
  value       = local.assume_role_policy
}
