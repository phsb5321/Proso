variable "name" {
  description = "Budget name, unique within the account."
  type        = string
}

variable "monthly_limit_usd" {
  description = "Monthly cost limit in USD that thresholds are measured against."
  type        = string

  validation {
    condition     = can(tonumber(var.monthly_limit_usd)) && tonumber(var.monthly_limit_usd) > 0
    error_message = "monthly_limit_usd must be a positive number; a zero or unparseable limit makes every threshold meaningless."
  }
}

variable "notification_emails" {
  description = "Addresses that receive threshold breaches."
  type        = list(string)

  validation {
    condition     = length(var.notification_emails) > 0
    error_message = "notification_emails must not be empty: a budget nobody is told about is not a guardrail."
  }

  validation {
    condition     = alltrue([for e in var.notification_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "every entry in notification_emails must be an email address."
  }
}

variable "actual_thresholds_percent" {
  description = "Percentages of the limit at which an ACTUAL-spend alert fires."
  type        = list(number)
  default     = [50, 80, 100]

  validation {
    condition     = length(var.actual_thresholds_percent) > 0
    error_message = "at least one ACTUAL threshold is required."
  }

  validation {
    condition     = alltrue([for t in var.actual_thresholds_percent : t > 0 && t <= 100])
    error_message = "ACTUAL thresholds are percentages in (0, 100]."
  }
}

variable "forecast_threshold_percent" {
  description = "Percentage of the limit at which a FORECASTED-spend alert fires."
  type        = number
  default     = 100

  validation {
    condition     = var.forecast_threshold_percent > 0
    error_message = "forecast_threshold_percent must be positive."
  }
}
