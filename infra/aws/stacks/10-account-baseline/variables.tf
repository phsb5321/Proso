variable "account_id" {
  description = "The account this stack is allowed to touch. Terraform refuses to plan against anything else."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be exactly 12 digits."
  }
}

variable "environment" {
  description = "Environment name; prefixes every resource and lands in the Environment tag."
  type        = string

  validation {
    condition     = contains(["sandbox", "prod"], var.environment)
    error_message = "environment must be one of: sandbox, prod."
  }
}

variable "region" {
  description = "Home region."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS profile to use. Leave null to take credentials from the environment."
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "Monthly spend limit this account is expected to stay under."
  type        = string
}

variable "budget_notification_emails" {
  description = "Who hears about a threshold breach."
  type        = list(string)
}

variable "log_retention_days" {
  description = "Days before CloudTrail objects expire."
  type        = number
  default     = 365
}
