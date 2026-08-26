# Module tests cover each module's own behaviour. This file covers the things
# that can only be wrong once the two are composed.
mock_provider "aws" {}

variables {
  account_id                               = "699475944323"
  environment                              = "sandbox"
  deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]
}

run "state_key_grants_the_deploy_role" {
  command = plan

  # The deploy role's ARN is hardcoded into the key policy to break a
  # dependency cycle. If the role is ever renamed and this is not updated, the
  # role silently loses the ability to read state — an error that only shows up
  # at the next apply, in another stack.
  assert {
    condition = contains(
      flatten([
        for s in jsondecode(module.tfstate_backend.key_policy_json).Statement :
        try(tolist(s.Principal.AWS), [])
      ]),
      module.deploy_role.role_arn
    )
    error_message = "The state CMK policy must name the deploy role that this stack actually creates."
  }
}

run "everything_carries_the_environment_tag" {
  command = plan

  # SandboxRestrictions (p-ufly0ag5) denies any request without
  # aws:RequestTag/Environment. Losing this tag makes every apply fail with an
  # opaque explicit-deny once that SCP is attached.
  assert {
    condition     = lookup(local.tags, "Environment", null) == "sandbox"
    error_message = "default_tags must set Environment, or the SCP denies the request."
  }
}

run "deploy_role_can_read_the_baseline_without_changing_it" {
  command = plan

  assert {
    condition = toset(local.drift_bucket_prefixes) == toset([
      "proso-tfstate-699475944323",
      "proso-tfstate-logs-699475944323",
      "sandbox-cloudtrail-699475944323",
    ])
    error_message = "The nightly drift role must inspect bootstrap and account-baseline bucket configuration without receiving object ARNs."
  }
}

run "management_state_is_sealed_from_workload_identities" {
  command = plan

  assert {
    condition = (
      toset(var.sealed_state_prefixes) == toset(local.denied_state_prefixes) &&
      toset(local.denied_state_prefixes) == toset(["05-org-structure/"])
    )
    error_message = "the resource-policy seal and deploy-role deny must cover the same retired management-state prefix"
  }
}

run "access_is_identity_center_only" {
  command = plan

  # ADR-001 §3 correction: no IAM user is created for access. A user ARN
  # appearing in the trust policy means someone reintroduced a static key.
  assert {
    condition = length([
      for a in flatten([
        for s in jsondecode(module.deploy_role.assume_role_policy_json).Statement :
        try(tolist(s.Principal.AWS), [try(tostring(s.Principal.AWS), "")])
      ]) : a if can(regex(":user/", a))
    ]) == 0
    error_message = "The deploy role must not trust an IAM user; access is via Identity Center permission sets."
  }
}

run "rejects_prod_typo_in_environment" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [var.environment]
}
