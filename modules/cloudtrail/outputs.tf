output "trail_arn" {
  description = "ARN of the trail."
  value       = aws_cloudtrail.this.arn
}

output "bucket_name" {
  description = "Name of the log bucket."
  value       = aws_s3_bucket.trail.id
}

output "kms_key_arn" {
  description = "ARN of the CMK encrypting the logs."
  value       = aws_kms_key.trail.arn
}
