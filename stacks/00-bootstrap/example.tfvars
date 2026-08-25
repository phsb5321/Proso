# Copy to sandbox.tfvars (gitignored) and apply with -var-file=sandbox.tfvars.

# Sandbox-Account is THE workload account, per the operator decision recorded in
# ADR-001 §3. No new account is created; stacks/15-member-account stays written
# and unapplied.
account_id  = "699475944323"
environment = "sandbox"
region      = "us-east-1"

# The deploy role does not exist during the first apply, so the bootstrap run
# assumes the Organizations-created admin role in the target account instead.
# Sandbox-Account has JoinedMethod = CREATED, which is what guarantees that role
# exists:
#   aws organizations describe-account --account-id 699475944323
bootstrap_assume_role_arn = "arn:aws:iam::699475944323:role/OrganizationAccountAccessRole"

# End state (ADR-001 §3 correction): access via IAM Identity Center, no static
# key. SandboxAdmin is the permission set stacks/05-org-structure creates for
# this account. Named here ahead of time because the ArnLike condition simply
# matches nothing until that stack is applied — no error, no drift.
deploy_role_trusted_permission_set_names = ["SandboxAdmin"]

# TRANSITIONAL. Identity Center is still empty, so without this the deploy role
# would be created assumable by nobody and could not be exercised at all. This
# is a de-escalation path, not an escalation one: OrganizationAccountAccessRole
# is already AdministratorAccess in this account, so trusting it to assume a
# strictly weaker role grants nothing new — it lets an apply run under the
# scoped role instead of under admin.
#
# Remove this line once `aws sso login` works; the permission set above then
# carries the trust on its own.
deploy_role_trusted_principal_arns = ["arn:aws:iam::699475944323:role/OrganizationAccountAccessRole"]

# OrganizationAccountAccessRole is assumed from an access key with no MFA in the
# session, so BoolIfExists("aws:MultiFactorAuthPresent") would evaluate false and
# deny. MFA for the durable path is enforced inside Identity Center, which is
# where it belongs.
deploy_role_require_mfa = false
