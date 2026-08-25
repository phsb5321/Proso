variable "role_name" {
  description = "Name of the deploy role."
  type        = string
  default     = "proso-deploy"
}

variable "trusted_permission_set_names" {
  description = <<-EOT
    IAM Identity Center permission set names allowed to assume this role. This
    is the preferred path (ADR-001 §3 correction): Identity Center issues
    short-lived credentials, so there is no static key to leak or rotate.

    Matched by condition rather than by exact principal because Identity Center
    provisions each permission set as a role whose name carries a generated
    suffix, and whose path may or may not include a region segment:
      arn:aws:iam::<acct>:role/aws-reserved/sso.amazonaws.com/[<region>/]AWSReservedSSO_<name>_<hash>
    That ARN is not knowable at plan time. The Principal is therefore the
    account, and the ArnLike condition is what actually restricts the trust.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for n in var.trusted_permission_set_names : can(regex("^[A-Za-z0-9+=,.@_-]{1,32}$", n))])
    error_message = "Pass the permission set NAME, not its ARN: 1-32 characters from the IAM name character set."
  }
}

variable "trusted_principal_arns" {
  description = <<-EOT
    Exact IAM principal ARNs allowed to assume the deploy role. Prefer
    trusted_permission_set_names. This list exists for a principal that is not
    an Identity Center identity — e.g. a role federated from a Forgejo OIDC
    provider, which the Account Foundation tab is researching.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for a in var.trusted_principal_arns : !endswith(a, ":root")])
    error_message = "An account :root ARN trusts every principal in that account. Name the user or role, or use trusted_permission_set_names."
  }

  validation {
    condition     = length(var.trusted_principal_arns) + length(var.trusted_permission_set_names) > 0
    error_message = "Name at least one permission set or principal; a role nobody can assume is not a deploy path."
  }
}

variable "require_mfa" {
  description = <<-EOT
    Add an aws:MultiFactorAuthPresent condition to the exact-ARN trust
    statement. It deliberately does NOT apply to the Identity Center statement.
    Per the IAM condition-key reference, MFA for Identity Center identities is
    enforced by "attributes for access control ... a SAML assertion claim with
    the authentication method" — not by this key — so requiring it there would
    reject every SSO session rather than harden it. MFA for the SSO path is
    configured inside Identity Center, which the Account Foundation tab owns.
  EOT
  type        = bool
  default     = true
}

variable "max_session_duration" {
  description = "Seconds a session lasts. One hour is the AWS minimum and long enough for a plan/apply."
  type        = number
  default     = 3600
}

variable "state_bucket_arn" {
  description = "ARN of the Terraform state bucket the role may read and write."
  type        = string
}

variable "state_kms_key_arn" {
  description = "ARN of the CMK protecting state."
  type        = string
}

variable "managed_bucket_prefixes" {
  description = "Name prefixes of the S3 buckets this role may manage for workloads (the site stack). Scoped by prefix so the role cannot touch the backup buckets in the management account's naming space."
  type        = list(string)
  default     = ["proso-"]
}

variable "account_id" {
  description = "AWS account the role lives in, used to scope account-level ARNs."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account id."
  }
}

variable "tags" {
  description = "Tags applied to the role."
  type        = map(string)
  default     = {}
}
