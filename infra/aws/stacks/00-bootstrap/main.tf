provider "aws" {
  region = var.region

  # A wrong or stale profile aborts at provider configuration instead of
  # creating a state bucket in the management account.
  allowed_account_ids = [var.account_id]

  dynamic "assume_role" {
    for_each = var.bootstrap_assume_role_arn == null ? [] : [var.bootstrap_assume_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "terraform-00-bootstrap"
    }
  }

  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Environment = var.environment
    Project     = "proso"
    ManagedBy   = "terraform"
    Stack       = "00-bootstrap"
  }

  state_bucket_name      = "proso-tfstate-${var.account_id}"
  log_bucket_name        = "proso-tfstate-logs-${var.account_id}"
  baseline_bucket_prefix = "${var.environment}-cloudtrail-${var.account_id}"
  denied_state_prefixes  = ["05-org-structure/"]
  drift_bucket_prefixes = [
    local.state_bucket_name,
    local.log_bucket_name,
    local.baseline_bucket_prefix,
  ]
}

module "tfstate_backend" {
  source = "../../modules/tfstate-backend"

  account_id      = var.account_id
  bucket_name     = local.state_bucket_name
  log_bucket_name = local.log_bucket_name

  # Chicken-and-egg: the deploy role's ARN is deterministic from its name, so
  # it can be granted on the key in the same apply that creates the role.
  # Referencing module.deploy_role.role_arn here would be a cycle.
  reader_principal_arns = ["arn:aws:iam::${var.account_id}:role/proso-deploy"]
  sealed_state_prefixes = var.sealed_state_prefixes

  tags = local.tags
}

module "deploy_role" {
  source = "../../modules/deploy-role"

  role_name  = "proso-deploy"
  account_id = var.account_id

  trusted_permission_set_names = var.deploy_role_trusted_permission_set_names
  trusted_principal_arns       = var.deploy_role_trusted_principal_arns
  require_mfa                  = var.deploy_role_require_mfa

  state_bucket_arn  = module.tfstate_backend.bucket_arn
  state_kms_key_arn = module.tfstate_backend.kms_key_arn

  managed_bucket_prefixes = var.managed_bucket_prefixes

  # Both bootstrap and account-baseline are in the nightly drift set. The
  # role may inspect their bucket configuration, but no object ARN is granted.
  read_only_bucket_prefixes = local.drift_bucket_prefixes
  denied_state_prefixes     = local.denied_state_prefixes

  tags = local.tags
}
