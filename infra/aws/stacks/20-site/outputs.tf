output "bucket_name" {
  description = "Origin bucket — pass to scripts/deploy-site.sh."
  value       = module.site.bucket_name
}

output "distribution_id" {
  description = "CloudFront distribution id — pass to scripts/deploy-site.sh."
  value       = module.site.distribution_id
}

output "distribution_domain_name" {
  description = "Verify the site here before touching DNS."
  value       = module.site.distribution_domain_name
}

output "certificate_arn" {
  value = module.site.certificate_arn
}

output "acm_validation_records" {
  description = "Create these at Cloudflare (proxy OFF) to get the certificate issued."
  value       = module.site.acm_validation_records
}

output "cutover_cname" {
  description = "Pedro's final step, after the distribution is verified."
  value       = module.site.cutover_cname
}
