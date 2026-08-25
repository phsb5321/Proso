# Copy to sandbox.tfvars (gitignored) and apply with -var-file=sandbox.tfvars.

account_id  = "699475944323" # Sandbox-Account
environment = "sandbox"
region      = "us-east-1"

# The deploy role does not exist during the first apply, so the bootstrap run
# assumes the Organizations-created admin role in the target account instead.
# Sandbox-Account has JoinedMethod = CREATED, which is what guarantees that role
# exists:
#   aws organizations describe-account --account-id 699475944323
bootstrap_assume_role_arn = "arn:aws:iam::699475944323:role/OrganizationAccountAccessRole"

# ADR-001 §3 correction: access comes from IAM Identity Center permission sets,
# never from an IAM user. Nothing static to leak, and it is the same mechanism
# that retires the root key.
#
# BLOCKED: this permission set does not exist yet. Identity Center is enabled
# (ssoins-7223fcff316331ec) but empty — measured 25/08/2026:
#   aws sso-admin list-permission-sets --instance-arn arn:aws:sso:::instance/ssoins-7223fcff316331ec
#     -> []
#   aws identitystore list-users --identity-store-id d-9067ca0796
#     -> []
# Creating the permission set and assigning it to 699475944323 is the Account
# Foundation tab's work. See README.md, "Blocked on an Identity Center principal".
deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]

# Left empty on purpose: no IAM user is created for access. This list is for a
# future OIDC-federated CI role only.
deploy_role_trusted_principal_arns = []
