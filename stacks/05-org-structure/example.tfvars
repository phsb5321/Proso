# Copy to management.tfvars (gitignored). Values below are the live, measured
# ids read from the organisation on 25/08/2026.
#
# PLAN-ONLY. This stack touches the management account, where root lives.

management_account_id = "851725512267"
sandbox_account_id    = "699475944323"

root_id         = "r-y7xb"
sandboxes_ou_id = "ou-y7xb-qkp97z4j"
sandbox_scp_id  = "p-ufly0ag5"

# Leave false until `aws organizations enable-policy-type --root-id r-y7xb
# --policy-type SERVICE_CONTROL_POLICY` has been run; the root currently
# reports PolicyTypes: [], so an attachment would fail.
attach_service_control_policies = false

sso_instance_arn  = "arn:aws:sso:::instance/ssoins-7223fcff316331ec"
identity_store_id = "d-9067ca0796"

operator_user_name    = "pedro"
operator_display_name = "Pedro H S Balbino"
operator_given_name   = "Pedro"
operator_family_name  = "Balbino"
operator_email        = "you@example.com"

region      = "us-east-1"
aws_profile = "pedro-ops"
