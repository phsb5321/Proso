# The account-wide console password policy. Singleton per AWS account — there
# is exactly one, and applying this module overwrites whatever is there.

#trivy:ignore:AVD-AWS-0062 same decision as the CKV_AWS_9 note below
resource "aws_iam_account_password_policy" "this" {
  minimum_password_length = var.minimum_password_length

  require_lowercase_characters = true
  require_uppercase_characters = true
  require_numbers              = true
  require_symbols              = true

  # Without this, a user whose password is compromised cannot rotate it without
  # an administrator, which turns a small incident into a support ticket.
  allow_users_to_change_password = true

  password_reuse_prevention = var.password_reuse_prevention

  # checkov:skip=CKV_AWS_9:Deliberate. Forced periodic rotation is an
  # anti-pattern under NIST SP 800-63B §5.1.1.2 ("SHOULD NOT require memorized
  # secrets to be changed arbitrarily (e.g., periodically)") because it drives
  # users toward predictable increments. AWS agrees: max-password-age was
  # dropped from CIS AWS Foundations 3.0 and from the corresponding Security
  # Hub control. The check encodes CIS 1.x. Set var.max_password_age to a
  # positive number if a compliance regime demands it anyway.
  max_password_age = var.max_password_age > 0 ? var.max_password_age : null

  # hard_expiry locks a user out entirely at expiry, requiring root or an admin
  # to recover. With no expiry configured it is inert, but leaving it false is
  # the safe default if someone later sets max_password_age.
  hard_expiry = false
}
