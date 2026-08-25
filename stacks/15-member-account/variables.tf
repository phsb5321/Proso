variable "management_account_id" {
  description = "Account creation happens from the management account and nowhere else."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "management_account_id must be exactly 12 digits."
  }
}

variable "account_name" {
  description = "Name of the new member account."
  type        = string
  default     = "proso-prod"
}

variable "account_email" {
  description = "Root email of the new account. Must be globally unique across all of AWS and must remain deliverable — it is the only recovery path for that account's root user."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.account_email))
    error_message = "account_email must be an email address."
  }
}

variable "workloads_ou_id" {
  description = "OU the account is created in. Comes from stacks/05-org-structure output workloads_ou_id."
  type        = string

  validation {
    condition     = can(regex("^ou-[0-9a-z]{4,32}-[0-9a-z]{8,32}$", var.workloads_ou_id))
    error_message = "workloads_ou_id must look like ou-y7xb-xxxxxxxx. Creating the account at the org root instead would leave it outside every OU-level SCP."
  }
}

variable "sso_instance_arn" {
  description = "ARN of the IAM Identity Center instance."
  type        = string
}

variable "platform_admins_group_id" {
  description = "Identity Store group receiving the break-glass permission set. From stacks/05-org-structure."
  type        = string
}

variable "region" {
  description = "Region for the provider."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS profile. Leave null to take credentials from the environment."
  type        = string
  default     = null
}
