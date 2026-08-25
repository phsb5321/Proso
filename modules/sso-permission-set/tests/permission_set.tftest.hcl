provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}

variables {
  instance_arn = "arn:aws:sso:::instance/ssoins-7223fcff316331ec"
  name         = "TestSet"
  description  = "fixture"
  principal_id = "00000000-0000-0000-0000-000000000000"
  account_ids  = ["699475944323"]
}

run "sessions_are_short_by_default" {
  command = plan

  assert {
    condition     = aws_ssoadmin_permission_set.this.session_duration == "PT4H"
    error_message = "the default session should expire within a working day"
  }
}

run "one_assignment_per_account" {
  command = plan

  variables {
    account_ids = ["699475944323", "851725512267"]
  }

  assert {
    condition     = length(aws_ssoadmin_account_assignment.this) == 2
    error_message = "a permission set must be assigned to every account it is meant to cover; an unassigned set is inert"
  }

  assert {
    condition = alltrue([
      for a in aws_ssoadmin_account_assignment.this : a.target_type == "AWS_ACCOUNT"
    ])
    error_message = "assignments target accounts, not OUs — Identity Center has no OU assignment"
  }

  assert {
    condition     = aws_ssoadmin_account_assignment.this[0].target_id == "699475944323"
    error_message = "assignment order must follow the account_ids list"
  }
}

run "no_inline_policy_means_no_inline_policy_resource" {
  command = plan

  assert {
    condition     = length(aws_ssoadmin_permission_set_inline_policy.this) == 0
    error_message = "an empty inline policy must not create an empty policy resource"
  }
}

run "inline_policy_is_attached_when_given" {
  command = plan

  variables {
    inline_policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Deny\",\"Action\":\"s3:*\",\"Resource\":\"*\"}]}"
  }

  assert {
    condition     = length(aws_ssoadmin_permission_set_inline_policy.this) == 1
    error_message = "a supplied inline policy must actually be attached"
  }
}

run "administrator_access_requires_saying_so_out_loud" {
  command = plan

  variables {
    managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
    allow_admin         = false
  }

  # The precondition on the permission set is what refuses this.
  expect_failures = [aws_ssoadmin_permission_set.this]
}

run "administrator_access_is_allowed_when_declared" {
  command = plan

  variables {
    managed_policy_arns = ["arn:aws:iam::aws:policy/AdministratorAccess"]
    allow_admin         = true
  }

  assert {
    condition     = length(aws_ssoadmin_managed_policy_attachment.this) == 1
    error_message = "an explicitly-allowed admin permission set must still attach its policy"
  }
}

run "rejects_a_session_longer_than_a_working_day" {
  command = plan

  variables {
    session_duration = "PT24H"
  }

  expect_failures = [var.session_duration]
}

run "rejects_a_permission_set_assigned_to_nothing" {
  command = plan

  variables {
    account_ids = []
  }

  expect_failures = [var.account_ids]
}

run "rejects_malformed_inline_policy_json" {
  command = plan

  variables {
    inline_policy = "{not json"
  }

  expect_failures = [var.inline_policy]
}
