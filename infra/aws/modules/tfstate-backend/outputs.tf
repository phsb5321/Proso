output "bucket_name" {
  description = "Name of the state bucket, for the backend `bucket` argument."
  value       = aws_s3_bucket.state.id
}

output "bucket_arn" {
  description = "ARN of the state bucket. Derived from the name and depends on the resource only for ordering, so callers get a known value at plan time."
  value       = local.state_bucket_arn
  depends_on  = [aws_s3_bucket.state]
}

output "bucket_policy_json" {
  description = "Rendered state bucket policy, exposed for assertion."
  value       = aws_s3_bucket_policy.state.policy
}

output "log_bucket_name" {
  description = "Name of the access-log bucket."
  value       = aws_s3_bucket.logs.id
}

output "kms_key_arn" {
  description = "ARN of the CMK protecting state, for the backend `kms_key_id` argument."
  value       = aws_kms_key.state.arn
}

output "kms_key_alias" {
  description = "Alias of the CMK protecting state."
  value       = aws_kms_alias.state.name
}

output "key_policy_json" {
  description = "Rendered CMK policy. Exposed so a caller can assert on who was actually granted decrypt, rather than trusting that the ARN it passed in was used."
  value       = local.key_policy
}
