output "state_bucket_name" {
  description = "Value for the backend `bucket` argument."
  value       = module.tfstate_backend.bucket_name
}

output "state_kms_key_arn" {
  description = "Value for the backend `kms_key_id` argument."
  value       = module.tfstate_backend.kms_key_arn
}

output "log_bucket_name" {
  description = "Bucket receiving S3 server access logs for the state bucket."
  value       = module.tfstate_backend.log_bucket_name
}

output "deploy_role_arn" {
  description = "Role every later stack assumes for plan and apply."
  value       = module.deploy_role.role_arn
}

output "backend_block" {
  description = "The exact backend configuration this stack's outputs imply, so the migration step is copy-paste rather than transcription."
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket       = "${module.tfstate_backend.bucket_name}"
        key          = "<stack-name>/terraform.tfstate"
        region       = "${var.region}"
        encrypt      = true
        kms_key_id   = "${module.tfstate_backend.kms_key_arn}"
        use_lockfile = true
      }
    }
  EOT
}
