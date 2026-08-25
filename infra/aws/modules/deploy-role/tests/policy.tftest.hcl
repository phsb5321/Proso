mock_provider "aws" {}

variables {
  account_id                   = "699475944323"
  state_bucket_arn             = "arn:aws:s3:::proso-tfstate-699475944323"
  state_kms_key_arn            = "arn:aws:kms:us-east-1:699475944323:key/00000000-0000-0000-0000-000000000000"
  trusted_permission_set_names = ["ProsoInfraDeploy"]
  read_only_bucket_prefixes    = ["sandbox-cloudtrail-699475944323"]
  tags                         = { Environment = "sandbox" }
}

run "denies_iam_and_organizations" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Deny" && s.Resource == "*" && try(toset(tolist(s.Action)), toset([tostring(s.Action)])) == toset([
        "iam:Add*",
        "iam:Attach*",
        "iam:ChangePassword",
        "iam:Create*",
        "iam:Deactivate*",
        "iam:Delete*",
        "iam:Detach*",
        "iam:Enable*",
        "iam:PassRole",
        "iam:Put*",
        "iam:Remove*",
        "iam:Reset*",
        "iam:Resync*",
        "iam:Set*",
        "iam:Tag*",
        "iam:Untag*",
        "iam:Update*",
        "iam:Upload*",
        "organizations:*",
      ])
    ]) == 1
    error_message = "The permissions policy must explicitly deny every IAM mutation verb family while leaving read-only drift calls possible."
  }

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Deny" && s.Resource == "*" && contains(try(tolist(s.Action), []), "organizations:*")
    ]) == 1
    error_message = "The permissions policy must contain an explicit Deny of organizations:* on all resources."
  }
}

run "is_not_administrator_access" {
  command = plan

  # The failure this catches is a lazy widen-to-green: someone hits a denied
  # call and replaces the scoped statements with Allow "*" on "*".
  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Allow" && contains(try(tolist(s.Action), []), "*")
    ]) == 0
    error_message = "No Allow statement may grant Action \"*\" — that is AdministratorAccess by another name."
  }

  # Trivy AWS-0345. Asserted here as well as in the scanner so the fix cannot
  # regress in an environment where only `terraform test` runs.
  assert {
    condition = alltrue([
      for s in jsondecode(output.permissions_policy_json).Statement :
      !contains(try(tolist(s.Action), [try(tostring(s.Action), "")]), "s3:*")
      if s.Effect == "Allow"
    ])
    error_message = "No Allow statement may grant s3:* — it includes PutBucketPublicAccessBlock, which would let the deploy role make a site bucket public."
  }

  # The site is served through CloudFront with OAC (ADR-001 §3). A role that
  # can call PutBucketWebsite can quietly stand up an unprotected HTTP origin.
  assert {
    condition = alltrue([
      for s in jsondecode(output.permissions_policy_json).Statement :
      !contains(try(tolist(s.Action), []), "s3:PutBucketWebsite")
      if s.Effect == "Allow"
    ])
    error_message = "The deploy role must not be able to enable an S3 website endpoint."
  }
}

run "refuses_to_destroy_its_own_backend" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Deny" && s.Action == "s3:DeleteBucket" && s.Resource == "*"
    ]) == 1
    error_message = "ADR-001 §4.6: deleting any bucket must be denied in IAM, not just in a runbook."
  }

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Deny" && s.Action == "kms:ScheduleKeyDeletion"
    ]) == 1
    error_message = "Scheduling deletion of the state CMK must be denied."
  }
}

run "baseline_drift_is_read_only" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Allow" &&
      contains(try(tolist(s.Action), []), "iam:GetAccountPasswordPolicy") &&
      contains(try(tolist(s.Action), []), "iam:GetRolePolicy") &&
      contains(try(tolist(s.Action), []), "iam:ListRolePolicies") &&
      contains(try(tolist(s.Action), []), "cloudtrail:Get*") &&
      contains(try(tolist(s.Action), []), "kms:Describe*")
    ]) == 1
    error_message = "The routine role must be able to refresh every non-S3 account-baseline resource during a drift plan."
  }

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Sid == "BaselineBucketRead" &&
      toset(s.Action) == toset(["s3:Get*", "s3:List*"]) &&
      toset(s.Resource) == toset([
        "arn:aws:s3:::sandbox-cloudtrail-699475944323*",
      ])
    ]) == 1
    error_message = "Baseline buckets must be prefix-scoped, Get/List-only, and exclude object ARNs so audit log contents stay unreadable."
  }

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Sid == "BudgetRead" &&
      s.Resource == "arn:aws:budgets::699475944323:budget/*" &&
      contains(try(tolist(s.Action), []), "budgets:ListTagsForResource")
    ]) == 1
    error_message = "Budget reads must remain scoped to this account's budget ARNs rather than Resource = \"*\"."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(output.permissions_policy_json).Statement :
      !contains(try(tolist(s.Action), []), "budgets:*") &&
      !contains(try(tolist(s.Action), []), "budgets:ModifyBudget") &&
      !contains(try(tolist(s.Action), []), "cloudtrail:StopLogging")
      if s.Effect == "Allow"
    ])
    error_message = "A drift reader must not be able to delete the budget or stop the audit trail."
  }
}

run "permission_set_trust_is_account_scoped_by_condition" {
  command = plan

  # The account principal is only safe because of the ArnLike condition. If the
  # condition is ever dropped, this statement trusts every principal in the
  # account — the single most dangerous edit that could be made to this module.
  assert {
    condition = alltrue([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      length(try(s.Condition.ArnLike["aws:PrincipalArn"], [])) > 0
      if try(s.Principal.AWS, "") == "arn:aws:iam::699475944323:root"
    ])
    error_message = "An account-root Principal in the trust policy must always be narrowed by an aws:PrincipalArn condition."
  }

  assert {
    condition = flatten([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      try(s.Condition.ArnLike["aws:PrincipalArn"], [])
    ]) == ["arn:aws:iam::699475944323:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_ProsoInfraDeploy_*"]
    error_message = "The permission-set pattern must match the Identity Center role path, including the optional region segment."
  }

  # aws:MultiFactorAuthPresent is not how Identity Center signals MFA, so
  # asserting its absence here keeps a well-meaning edit from locking SSO out.
  assert {
    condition = alltrue([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      try(s.Condition.BoolIfExists, null) == null && try(s.Condition.Bool, null) == null
      if s.Sid == "TrustedIdentityCenterPermissionSets"
    ])
    error_message = "The Identity Center trust statement must not carry an MFA condition; MFA is enforced at Identity Center sign-in."
  }

  assert {
    condition = length([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      s if try(s.Principal.AWS, null) == "*"
    ]) == 0
    error_message = "The trust policy must never allow a wildcard principal."
  }
}

run "exact_arn_trust_uses_boolifexists_for_mfa" {
  command = plan

  variables {
    trusted_permission_set_names = []
    trusted_principal_arns       = ["arn:aws:iam::699475944323:role/proso-ci"]
  }

  # Plain Bool is what the IAM reference explicitly calls out as unreliable.
  assert {
    condition = tostring(one([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      s.Condition.BoolIfExists["aws:MultiFactorAuthPresent"]
    ])) == "true"
    error_message = "With require_mfa = true the exact-ARN statement must use BoolIfExists on aws:MultiFactorAuthPresent."
  }
}

run "mfa_condition_is_dropped_for_ci_principals" {
  command = plan

  variables {
    trusted_permission_set_names = []
    trusted_principal_arns       = ["arn:aws:iam::699475944323:role/proso-ci"]
    require_mfa                  = false
  }

  # An OIDC-federated CI principal cannot present MFA; leaving the condition on
  # would make every pipeline run fail with an opaque AccessDenied.
  assert {
    condition = alltrue([
      for s in jsondecode(output.assume_role_policy_json).Statement :
      try(s.Condition, null) == null
    ])
    error_message = "With require_mfa = false the trust policy must carry no MFA condition."
  }
}

run "rejects_an_account_root_trust" {
  command = plan

  variables {
    trusted_principal_arns = ["arn:aws:iam::851725512267:root"]
  }

  expect_failures = [var.trusted_principal_arns]
}

run "rejects_a_trust_list_that_names_nobody" {
  command = plan

  variables {
    trusted_permission_set_names = []
    trusted_principal_arns       = []
  }

  expect_failures = [var.trusted_principal_arns]
}

run "rejects_a_permission_set_arn_passed_as_a_name" {
  command = plan

  variables {
    trusted_permission_set_names = ["arn:aws:sso:::permissionSet/ssoins-7223fcff316331ec/ps-0123456789abcdef"]
  }

  expect_failures = [var.trusted_permission_set_names]
}

# The site stack (stacks/20-site) is the only consumer today, so the role has to
# cover what it actually applies. Every action below was missing when the site
# module landed: an apply would have failed partway through, leaving a
# distribution with no log delivery and a bucket with untagged objects.
run "covers_what_the_site_stack_applies" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s if s.Effect == "Allow" && contains(try(tolist(s.Action), []), "s3:PutObjectTagging")
    ]) == 1
    error_message = "The site module tags updates.json and releases/*.xpi; a tagged PutObject also needs s3:PutObjectTagging."
  }

  assert {
    condition = alltrue([
      for action in [
        "logs:PutDeliverySource",
        "logs:PutDeliveryDestination",
        "logs:CreateDelivery",
        ] : length([
          for s in jsondecode(output.permissions_policy_json).Statement :
          s if s.Effect == "Allow" && contains(try(tolist(s.Action), []), action)
      ]) == 1
    ])
    error_message = "CloudFront standard logging v2 needs the CloudWatch Logs delivery APIs; the legacy logging_config block cannot target a BucketOwnerEnforced bucket."
  }

  # The delivery APIs take resource ARNs, so granting them on "*" would be a
  # quiet widening of a module whose whole point is that it is not.
  assert {
    condition = alltrue([
      for s in jsondecode(output.permissions_policy_json).Statement :
      s.Resource != "*"
      if s.Effect == "Allow" && contains(try(tolist(s.Action), []), "logs:CreateDelivery")
    ])
    error_message = "The log delivery write statement must be ARN-scoped, not Resource = \"*\"."
  }
}
