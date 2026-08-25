variable "account_id" {
  description = "Account this stack is applied to. Also fed to the provider's allowed_account_ids, so a stale profile aborts before it can create anything in the wrong account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account id."
  }
}

variable "region" {
  description = "Region for the state bucket. us-east-1 because CloudFront requires its ACM certificates there and there is no reason to split."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = <<-EOT
    Value of the Environment tag on every resource. Not cosmetic: the
    SandboxRestrictions SCP (p-ufly0ag5) carries a DenyUntaggedResources
    statement keyed on aws:RequestTag/Environment, so an untagged apply fails
    the moment that policy is attached to the account.
  EOT
  type        = string

  validation {
    condition     = contains(["sandbox", "prod"], var.environment)
    error_message = "environment must be sandbox or prod."
  }
}

variable "bootstrap_assume_role_arn" {
  description = "Role to assume for this stack. Null means credentials come from the profile/environment. During bootstrap this is the OrganizationAccountAccessRole in the target account, because the deploy role does not exist yet."
  type        = string
  default     = null
}

variable "deploy_role_trusted_permission_set_names" {
  description = "IAM Identity Center permission set names allowed to assume the deploy role. The preferred path — no static keys. See modules/deploy-role/variables.tf."
  type        = list(string)
  default     = []
}

variable "deploy_role_trusted_principal_arns" {
  description = "Exact IAM principal ARNs allowed to assume the deploy role, for principals that are not Identity Center identities. See modules/deploy-role/variables.tf."
  type        = list(string)
  default     = []
}

variable "deploy_role_require_mfa" {
  description = "Add the MFA condition to the exact-ARN trust statement. Has no effect on the Identity Center statement."
  type        = bool
  default     = true
}

variable "managed_bucket_prefixes" {
  description = "Workload bucket name prefixes the deploy role may manage. Kept narrow on purpose; widen only when a real plan is shown to fail without it."
  type        = list(string)
  default     = ["proso-site-"]
}
