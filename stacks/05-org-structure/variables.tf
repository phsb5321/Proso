variable "management_account_id" {
  description = "The organisation's management account. This stack may only run there."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "management_account_id must be exactly 12 digits."
  }
}

variable "sandbox_account_id" {
  description = "Sandbox-Account, the target of the SandboxAdmin permission set."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.sandbox_account_id))
    error_message = "sandbox_account_id must be exactly 12 digits."
  }
}

variable "root_id" {
  description = "Organizations root id (r-xxxx). Parent of every OU."
  type        = string

  validation {
    condition     = can(regex("^r-[0-9a-z]{4,32}$", var.root_id))
    error_message = "root_id must look like r-y7xb."
  }
}

variable "sandboxes_ou_id" {
  description = "Existing Sandboxes OU. Extended, not replaced."
  type        = string

  validation {
    condition     = can(regex("^ou-[0-9a-z]{4,32}-[0-9a-z]{8,32}$", var.sandboxes_ou_id))
    error_message = "sandboxes_ou_id must look like ou-y7xb-qkp97z4j."
  }
}

variable "attach_service_control_policies" {
  description = "Attach SandboxRestrictions to the Sandboxes OU. Requires SERVICE_CONTROL_POLICY to be enabled on the root first (see the note in main.tf); leave false until it is, or the apply fails."
  type        = bool
  default     = false
}

variable "sso_instance_arn" {
  description = "ARN of the existing IAM Identity Center instance."
  type        = string
}

variable "identity_store_id" {
  description = "Identity store backing that instance."
  type        = string

  validation {
    condition     = can(regex("^d-[0-9a-f]{10}$", var.identity_store_id))
    error_message = "identity_store_id must look like d-9067ca0796."
  }
}

variable "operator_user_name" {
  description = "Identity Center user name for the operator."
  type        = string
}

variable "operator_display_name" {
  description = "Display name shown in the access portal."
  type        = string
}

variable "operator_given_name" {
  description = "Given name."
  type        = string
}

variable "operator_family_name" {
  description = "Family name."
  type        = string
}

variable "operator_email" {
  description = "Where Identity Center sends the one-time password invitation. Must be reachable."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.operator_email))
    error_message = "operator_email must be an email address; the invitation cannot be delivered otherwise."
  }
}

variable "region" {
  description = "Region for the provider. Identity Center is regional — it lives where it was enabled."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS profile. Leave null to take credentials from the environment."
  type        = string
  default     = null
}
