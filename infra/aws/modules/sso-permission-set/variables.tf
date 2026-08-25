variable "instance_arn" {
  description = "ARN of the IAM Identity Center instance. Passed rather than discovered so this module's tests stay hermetic."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:sso:::instance/ssoins-[0-9a-f]+$", var.instance_arn))
    error_message = "instance_arn must look like arn:aws:sso:::instance/ssoins-XXXXXXXX."
  }
}

variable "name" {
  description = "Permission set name. Appears in the AWS access portal and in the role name inside each account."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,32}$", var.name))
    error_message = "AWS caps permission set names at 32 characters of [A-Za-z0-9+=,.@_-]."
  }
}

variable "description" {
  description = "Why this permission set exists. Shown in the console."
  type        = string
}

variable "session_duration" {
  description = "ISO-8601 session length, e.g. PT4H."
  type        = string
  default     = "PT4H"

  validation {
    condition     = can(regex("^PT([1-9]|1[0-2])H$", var.session_duration))
    error_message = "session_duration must be a whole number of hours from PT1H to PT12H. A session longer than the working day defeats the point of short-lived credentials."
  }
}

variable "managed_policy_arns" {
  description = "AWS-managed or customer-managed policy ARNs to attach."
  type        = list(string)
  default     = []
}

variable "inline_policy" {
  description = "Inline policy JSON, or null for none."
  type        = string
  default     = null

  validation {
    condition     = var.inline_policy == null ? true : can(jsondecode(var.inline_policy))
    error_message = "inline_policy must be valid JSON."
  }
}

variable "allow_admin" {
  description = "Must be true to attach AdministratorAccess. Exists so unlimited access is a decision someone typed, not a default someone inherited."
  type        = bool
  default     = false
}

variable "principal_id" {
  description = "Identity Store group or user id that receives this permission set."
  type        = string
}

variable "principal_type" {
  description = "GROUP or USER. Prefer GROUP — membership changes then need no Terraform run."
  type        = string
  default     = "GROUP"

  validation {
    condition     = contains(["GROUP", "USER"], var.principal_type)
    error_message = "principal_type must be GROUP or USER."
  }
}

variable "account_ids" {
  description = "Accounts this permission set is assigned to."
  type        = list(string)

  validation {
    condition     = length(var.account_ids) > 0
    error_message = "an unassigned permission set grants nothing to nobody; assign it to at least one account."
  }

  validation {
    condition     = alltrue([for a in var.account_ids : can(regex("^[0-9]{12}$", a))])
    error_message = "every account id must be exactly 12 digits."
  }
}

variable "relay_state" {
  description = "Console URL to land on after assuming the role, or null."
  type        = string
  default     = null
}

variable "partition" {
  description = "ARN partition."
  type        = string
  default     = "aws"
}

variable "tags" {
  description = "Tags for the permission set."
  type        = map(string)
  default     = {}
}
