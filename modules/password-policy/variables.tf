variable "minimum_password_length" {
  description = "Minimum console password length."
  type        = number
  default     = 16

  validation {
    condition     = var.minimum_password_length >= 14
    error_message = "minimum_password_length must be at least 14 (CIS AWS Foundations 3.0, control 1.8)."
  }

  validation {
    condition     = var.minimum_password_length <= 128
    error_message = "AWS caps console passwords at 128 characters."
  }
}

variable "password_reuse_prevention" {
  description = "How many previous passwords are remembered and refused."
  type        = number
  default     = 24

  validation {
    condition     = var.password_reuse_prevention >= 5 && var.password_reuse_prevention <= 24
    error_message = "password_reuse_prevention must be between 5 and 24; AWS refuses values outside that range."
  }
}

variable "max_password_age" {
  description = "Days before a console password expires. 0 disables expiry, which is the default and the NIST-aligned position (see the note in main.tf)."
  type        = number
  default     = 0

  validation {
    condition     = var.max_password_age >= 0 && var.max_password_age <= 1095
    error_message = "max_password_age must be between 0 (no expiry) and 1095."
  }
}
