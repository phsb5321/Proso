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
