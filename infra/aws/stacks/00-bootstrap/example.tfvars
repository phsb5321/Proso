# Copy to sandbox.tfvars (gitignored) and apply with -var-file=sandbox.tfvars.

# Sandbox-Account is THE workload account, per the operator decision recorded in
# ADR-001 §3. No new account is created; stacks/15-member-account stays written
# and unapplied.
account_id  = "699475944323"
environment = "sandbox"
region      = "us-east-1"

# Routine end state: the ambient session is already proso-deploy, so the
# provider must not assume back into the bootstrap administrator role. The
# historical first apply temporarily set OrganizationAccountAccessRole here
# because proso-deploy did not exist yet; that chicken-and-egg phase is complete.
bootstrap_assume_role_arn = null

# End state (ADR-001 §3 correction): access via IAM Identity Center, no static
# key. ProsoInfraDeploy is the permission set stacks/05-org-structure creates
# for routine Terraform work in this account.
#
# THIS NAME IS A CONTRACT with that stack, in both directions: the deploy role's
# trust matches …:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_ProsoInfraDeploy_*,
# and stacks/05-org-structure/tests/org_structure.tftest.hcl asserts the literal
# so a rename breaks loudly instead of silently locking everyone out.
#
# Safe to name before it exists: until that stack is applied the ArnLike
# condition simply matches nothing — no error, no drift.
deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]

# TRANSITIONAL. Identity Center is still empty, so without this the deploy role
# would be created assumable by nobody and could not be exercised at all. This
# is a de-escalation path, not an escalation one: OrganizationAccountAccessRole
# is already AdministratorAccess in this account, so trusting it to assume a
# strictly weaker role grants nothing new — it lets an apply run under the
# scoped role instead of under admin.
#
# Remove this line once `aws sso login` works; the permission set above then
# carries the trust on its own. Note that stacks/05-org-structure also creates
# WorkloadBreakGlass precisely because the FIRST bootstrap apply predates both
# the state bucket and this role — that is the durable replacement for the
# OrganizationAccountAccessRole trust below, not ProsoInfraDeploy.
deploy_role_trusted_principal_arns = ["arn:aws:iam::699475944323:role/OrganizationAccountAccessRole"]

# OrganizationAccountAccessRole is assumed from an access key with no MFA in the
# session, so BoolIfExists("aws:MultiFactorAuthPresent") would evaluate false and
# deny. MFA for the durable path is enforced inside Identity Center, which is
# where it belongs.
deploy_role_require_mfa = false
