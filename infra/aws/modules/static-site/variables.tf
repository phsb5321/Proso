variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}$", var.name))
    error_message = "name must be lowercase alphanumeric with hyphens, 2-41 chars (it seeds an S3 bucket name)."
  }
}

variable "bucket_name" {
  description = "Explicit origin bucket name. Defaults to <name>-<account_id>, which is globally unique without a random suffix."
  type        = string
  default     = null
}

variable "domain_names" {
  description = "Domains the certificate covers. First entry is the primary; the rest become SANs."
  type        = list(string)

  validation {
    condition     = length(var.domain_names) > 0
    error_message = "at least one domain name is required — the certificate is requested before the cutover."
  }
}

variable "attach_custom_domain" {
  description = <<-EOT
    Phase switch. false: the distribution serves on its *.cloudfront.net domain
    with the CloudFront default certificate, so the stack can be applied and
    verified before DNS moves. true: attach var.domain_names as aliases with the
    ACM certificate — only valid once that certificate is ISSUED, which requires
    the validation records in acm_validation_records to exist at Cloudflare.
  EOT
  type        = bool
  default     = false
}

variable "default_root_object" {
  description = "Object served for a request to the distribution root."
  type        = string
  default     = "index.html"

  validation {
    condition     = length(var.default_root_object) > 0
    error_message = "default_root_object must be set — an empty root returns the S3 bucket listing denial instead of the site."
  }
}

variable "release_source_dir" {
  description = <<-EOT
    Directory holding the auto-update payload: updates.json plus a releases/
    subdirectory of .xpi files. Terraform owns these objects rather than the
    deploy script so their keys and content types are enforced at plan time.
    Set to null to manage them out of band (the invariants are then unenforced).
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.release_source_dir == null ? true : !startswith(var.release_source_dir, "/")
    error_message = "release_source_dir must be relative to the Terraform root so state is portable across worktrees."
  }
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 covers NA+EU; the free tier applies to all of them."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be one of PriceClass_100, PriceClass_200, PriceClass_All."
  }
}

variable "log_retention_days" {
  description = "Days before S3 server access logs expire. Bounds the only line item this stack can grow."
  type        = number
  default     = 90

  validation {
    condition     = var.log_retention_days >= 1
    error_message = "log_retention_days must be at least 1."
  }
}

variable "tags" {
  description = "Tags applied to every taggable resource."
  type        = map(string)
  default     = {}
}
