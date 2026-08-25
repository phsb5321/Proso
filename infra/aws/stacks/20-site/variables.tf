variable "account_id" {
  description = "Account this stack is applied to. ADR-001 (25/08/2026): the workload account is Sandbox-Account 699475944323; no new account is created."
  type        = string
  default     = "699475944323"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account id."
  }
}

variable "assume_role_arn" {
  description = "Role assumed for plan and apply. The least-privilege proso-deploy role from stacks/00-bootstrap, not an admin role. Null uses ambient credentials."
  type        = string
  default     = null
}

variable "region" {
  description = "Must be us-east-1: CloudFront reads its certificate only from there."
  type        = string
  default     = "us-east-1"
}

variable "name" {
  description = "Resource name prefix."
  type        = string
  default     = "proso-site"
}

variable "environment" {
  description = "Value of the Environment tag, which the SandboxRestrictions SCP requires on every create call."
  type        = string
  default     = "sandbox"

  validation {
    condition     = contains(["sandbox", "prod"], var.environment)
    error_message = "environment must be sandbox or prod."
  }
}

variable "domain_names" {
  description = "Domains the certificate covers. The site publishes no www host — see sitemap.xml on the gh-pages branch."
  type        = list(string)
  default     = ["proso.com.br"]
}

variable "attach_custom_domain" {
  description = <<-EOT
    Leave false until the ACM certificate is ISSUED. Phase 1 verifies the site on
    the *.cloudfront.net domain; phase 2 attaches the alias. The DNS cutover
    itself is Pedro's, not this stack's.
  EOT
  type        = bool
  default     = false
}

variable "site_source_dir" {
  description = <<-EOT
    Assembled site tree — what scripts/deploy-site.sh produces from the Proso
    repo (packages/site + packages/legal + the gh-pages updates.json and
    releases/). Terraform reads updates.json and releases/*.xpi from it so their
    keys and content types are enforced at plan time. null leaves those objects
    unmanaged, which is only correct before the tree has been assembled.
  EOT
  type        = string
  default     = null
}
