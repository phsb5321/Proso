output "bucket_name" {
  description = "Origin bucket. The deploy script syncs into it."
  value       = aws_s3_bucket.site.id
}

output "log_bucket_name" {
  description = "Access log sink for both S3 server access logs and CloudFront standard logs."
  value       = aws_s3_bucket.logs.id
}

output "distribution_id" {
  description = "CloudFront distribution id. The deploy script invalidates against it."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "The *.cloudfront.net domain. Verify the site here before any DNS change."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "certificate_arn" {
  description = "ACM certificate ARN. Attached to the distribution only when attach_custom_domain is true."
  value       = aws_acm_certificate.this.arn
}

output "acm_validation_records" {
  description = <<-EOT
    DNS records to create at Cloudflare so the certificate can be issued.
    Proxying must be OFF for a CNAME validation record.
  EOT
  value = [
    for option in aws_acm_certificate.this.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "cutover_cname" {
  description = "The record Pedro creates at Cloudflare once the distribution is verified."
  value = {
    for domain in var.domain_names : domain => {
      type  = "CNAME"
      value = aws_cloudfront_distribution.this.domain_name
    }
  }
}
