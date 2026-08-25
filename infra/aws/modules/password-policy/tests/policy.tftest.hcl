provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}

run "all_four_character_classes_are_required" {
  command = plan

  assert {
    condition = alltrue([
      aws_iam_account_password_policy.this.require_lowercase_characters,
      aws_iam_account_password_policy.this.require_uppercase_characters,
      aws_iam_account_password_policy.this.require_numbers,
      aws_iam_account_password_policy.this.require_symbols,
    ])
    error_message = "dropping a character class silently shrinks the search space an attacker has to cover"
  }
}

run "users_can_rotate_their_own_password" {
  command = plan

  assert {
    condition     = aws_iam_account_password_policy.this.allow_users_to_change_password
    error_message = "if a user cannot rotate a compromised password without an admin, the incident stays open longer than it needs to"
  }
}

run "defaults_meet_cis_3_0" {
  command = plan

  assert {
    condition     = aws_iam_account_password_policy.this.minimum_password_length >= 14
    error_message = "CIS AWS Foundations 3.0 control 1.8 requires a minimum length of 14"
  }

  assert {
    condition     = aws_iam_account_password_policy.this.password_reuse_prevention == 24
    error_message = "default reuse prevention should be the AWS maximum"
  }
}

run "hard_expiry_never_locks_a_user_out" {
  command = plan

  assert {
    condition     = aws_iam_account_password_policy.this.hard_expiry == false
    error_message = "hard_expiry requires root or an admin to recover a locked-out user; the whole point of this work is to stop needing root"
  }
}

run "rejects_a_short_minimum" {
  command = plan

  variables {
    minimum_password_length = 8
  }

  expect_failures = [var.minimum_password_length]
}

run "rejects_a_reuse_window_aws_will_not_accept" {
  command = plan

  variables {
    password_reuse_prevention = 30
  }

  expect_failures = [var.password_reuse_prevention]
}

run "rejects_a_negative_password_age" {
  command = plan

  variables {
    max_password_age = -1
  }

  expect_failures = [var.max_password_age]
}
