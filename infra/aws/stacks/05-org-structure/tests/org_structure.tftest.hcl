# A composition test, not a module test. It exists for one reason the module
# tests cannot cover: the permission set name is a cross-stack CONTRACT with
# stacks/00-bootstrap, and nothing else in the repo would notice it breaking.
#
# This provider block replaces the stack's own, whose allowed_account_ids would
# need real STS credentials.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
}

variables {
  management_account_id = "851725512267"
  workload_account_id   = "699475944323"

  root_id         = "r-y7xb"
  sandboxes_ou_id = "ou-y7xb-qkp97z4j"

  deploy_role_name  = "proso-deploy"
  state_bucket_name = "proso-tfstate-699475944323"
  state_kms_alias   = "alias/proso-tfstate-699475944323"

  sso_instance_arn  = "arn:aws:sso:::instance/ssoins-7223fcff316331ec"
  identity_store_id = "d-9067ca0796"

  operator_user_name    = "pedro"
  operator_display_name = "Pedro H S Balbino"
  operator_given_name   = "Pedro"
  operator_family_name  = "Balbino"
  operator_email        = "pedrobalbino@pm.me"
}

run "the_deploy_permission_set_name_matches_the_bootstrap_contract" {
  command = plan

  # stacks/00-bootstrap/example.tfvars:
  #   deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]
  # and modules/deploy-role builds its trust from
  #   *AWSReservedSSO_${name}_*
  # so renaming this locks every human out of the deploy role.
  assert {
    condition     = module.infra_deploy.name == "ProsoInfraDeploy"
    error_message = "ProsoInfraDeploy is named in stacks/00-bootstrap's deploy-role trust policy. Renaming it here without renaming it there silently revokes access to the deploy role."
  }
}

run "the_routine_path_is_not_an_admin_path" {
  command = plan

  assert {
    condition     = module.infra_deploy.grants_admin == false
    error_message = "ADR-001 §2.5: routine plan/apply must never run as AdministratorAccess"
  }

  assert {
    condition     = module.workload_break_glass.grants_admin == true
    error_message = "break-glass is the one permission set that is meant to be admin; if it is not, the first bootstrap apply cannot run"
  }
}

run "the_deploy_permission_set_can_reach_the_role_and_the_state_backend" {
  command = plan

  assert {
    condition     = strcontains(local.infra_deploy_inline, "arn:aws:iam::699475944323:role/proso-deploy")
    error_message = "the deploy permission set must be able to assume the deploy role by exact ARN"
  }

  assert {
    condition     = strcontains(local.infra_deploy_inline, "arn:aws:s3:::proso-tfstate-699475944323/*")
    error_message = "Terraform's S3 backend authenticates with the ambient session, so this permission set needs the state bucket directly or `terraform init` fails"
  }

  assert {
    condition     = strcontains(local.infra_deploy_inline, "kms:ViaService")
    error_message = "the KMS grant is Resource:* and must stay bounded by kms:ViaService, or it becomes a general-purpose decrypt permission"
  }

  assert {
    condition = one([
      for s in jsondecode(local.infra_deploy_inline).Statement : s
      if s.Sid == "UseTheStateKeyThroughS3Only"
      ]).Condition == {
      StringEquals = {
        "kms:ViaService" = "s3.us-east-1.amazonaws.com"
      }
      "ForAnyValue:StringEquals" = {
        "kms:ResourceAliases" = "alias/proso-tfstate-699475944323"
      }
    }
    error_message = "state KMS use must require both the exact alias and S3 via-service context"
  }

  assert {
    condition     = !strcontains(local.infra_deploy_inline, "\"s3:*\"")
    error_message = "state access must stay enumerated; s3:* on the state bucket would include bucket-level destruction"
  }

  assert {
    condition = length([
      for s in jsondecode(local.infra_deploy_inline).Statement : s
      if s.Sid == "DenyForeignAccountState" && s.Effect == "Deny" &&
      toset(s.Action) == toset(["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion"]) &&
      s.Resource == "arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/*"
    ]) == 1
    error_message = "ProsoInfraDeploy must deny the management-account state prefix even while it can use every workload state key"
  }
}

run "management_ops_can_audit_but_not_mutate_identity_or_backups" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(file("${path.module}/../../policies/management-ops-inline.json")).Statement : s
      if s.Sid == "ReadOrgIamAndIdentityCenterMetadata" &&
      contains(s.Action, "organizations:List*") &&
      contains(s.Action, "sso:List*") &&
      contains(s.Action, "identitystore:List*")
    ]) == 1
    error_message = "ManagementOps must be able to audit Organizations, IAM Identity Center, and the identity store"
  }

  assert {
    condition = length([
      for s in jsondecode(file("${path.module}/../../policies/management-ops-inline.json")).Statement : s
      if s.Sid == "DenyBackupContentsAndAnyBucketMutation" &&
      contains(s.Action, "s3:GetObject*") &&
      contains(s.Action, "s3:BypassGovernanceRetention") &&
      contains(s.Action, "kms:Decrypt")
    ]) == 1
    error_message = "ManagementOps must remain unable to read or mutate backup contents"
  }

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(file("${path.module}/../../policies/management-ops-inline.json")).Statement : [
        for action in try(s.Action, []) :
        !can(regex("^(organizations|sso|sso-directory|identitystore):(Create|Update|Delete|Put|Attach|Detach|Provision|Tag|Untag)", action))
        if s.Effect == "Allow"
      ]
    ]))
    error_message = "ManagementOps is an audit permission set, not an unreviewed identity or organization mutation path"
  }
}

run "both_permission_sets_land_in_the_workload_account" {
  command = plan

  assert {
    condition     = one(module.infra_deploy.assigned_account_ids) == "699475944323"
    error_message = "ADR-001 §3: the workload account is Sandbox-Account 699475944323"
  }

  assert {
    condition     = one(module.workload_break_glass.assigned_account_ids) == "699475944323"
    error_message = "ADR-001 §3: the workload account is Sandbox-Account 699475944323"
  }
}

run "management_state_stays_in_the_management_account" {
  command = plan

  assert {
    condition = (
      local.management_state_bucket_name == "proso-management-tfstate-851725512267" &&
      local.management_log_bucket_name == "proso-management-tfstate-logs-851725512267"
    )
    error_message = "stack 05 state and access logs must use management-account bucket names"
  }

  assert {
    condition = length([
      for s in jsondecode(module.management_tfstate_backend.key_policy_json).Statement : s
      if s.Sid == "EnableAccountIAM" &&
      s.Principal.AWS == "arn:aws:iam::851725512267:root"
    ]) == 1
    error_message = "the management-state CMK must delegate to management-account IAM"
  }

  assert {
    condition = length([
      for s in jsondecode(module.management_tfstate_backend.key_policy_json).Statement : s
      if s.Effect == "Allow"
    ]) == 1
    error_message = "management-account root delegation must be the only Allow in the management-state CMK policy"
  }
}

run "no_service_control_policy_is_created_by_default" {
  command = plan

  # SCPs are not enabled on the org root, so creating one would fail the apply.
  assert {
    condition     = length(aws_organizations_policy.sandbox_guardrails) == 0
    error_message = "attach_service_control_policies must default to false while the org root reports PolicyTypes: []"
  }
}

run "rejects_a_kms_alias_that_is_not_an_alias" {
  command = plan

  variables {
    state_kms_alias = "proso-tfstate-699475944323"
  }

  expect_failures = [var.state_kms_alias]
}

run "rejects_a_malformed_workload_account_id" {
  command = plan

  variables {
    workload_account_id = "6994759443"
  }

  expect_failures = [var.workload_account_id]
}
