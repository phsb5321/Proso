variable "name" {
  description = "Trail name; also used for the KMS alias."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$", var.name))
    error_message = "CloudTrail names are 3-128 chars, must start alphanumeric, and allow only letters, digits, period, underscore and hyphen."
  }
}

variable "bucket_name" {
  description = "Name of the log bucket. Must be globally unique, so include the account id."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be a valid S3 bucket name (lowercase, 3-63 chars)."
  }
}

variable "account_id" {
  description = "AWS account id the trail lives in. Passed rather than discovered so the module's tests stay hermetic."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be exactly 12 digits."
  }
}

variable "region" {
  description = "Home region of the trail."
  type        = string
  default     = "us-east-1"
}

variable "partition" {
  description = "ARN partition. Only 'aws' is in use here; the variable keeps GovCloud/China ARNs from being wrong by construction."
  type        = string
  default     = "aws"
}

variable "log_retention_days" {
  description = "Days before trail objects and their noncurrent versions expire."
  type        = number
  default     = 365

  validation {
    condition     = var.log_retention_days >= 90
    error_message = "log_retention_days must be at least 90: a trail that expires sooner cannot answer a question about last quarter."
  }
}

variable "tags" {
  description = "Tags applied to every taggable resource in the module."
  type        = map(string)
  default     = {}
}
