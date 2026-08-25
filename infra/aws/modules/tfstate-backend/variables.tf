variable "account_id" {
  description = "AWS account the backend lives in. Passed explicitly rather than read from aws_caller_identity so that plan and test need no credentials."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account id."
  }
}

variable "bucket_name" {
  description = "Globally-unique name of the state bucket."
  type        = string
}

variable "log_bucket_name" {
  description = "Globally-unique name of the S3 server-access-log bucket that receives the state bucket's logs."
  type        = string
}

variable "noncurrent_version_retention_days" {
  description = "How long superseded state versions are kept before expiry. Every apply writes a new version, so unbounded retention is a slow cost leak; 90 days is far longer than any realistic rollback window."
  type        = number
  default     = 90
}

variable "log_retention_days" {
  description = "How long S3 server access logs are kept."
  type        = number
  default     = 90
}

variable "reader_principal_arns" {
  description = "Extra principals granted decrypt on the state KMS key, on top of account IAM. Normally just the deploy role."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
