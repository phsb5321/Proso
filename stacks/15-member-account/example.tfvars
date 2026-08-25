# Copy to prod.tfvars (gitignored).
#
# GATED — ADR-001 §5. `terraform plan` freely; `terraform apply` only with
# Pedro's explicit, in-turn go. Account closure takes 90 days.

management_account_id = "851725512267"

account_name = "proso-prod"
# Must be globally unique across all AWS accounts and must stay deliverable.
account_email = "pedrobalbino+proso-prod@proton.me"

# From `terraform output workloads_ou_id` in stacks/05-org-structure.
workloads_ou_id = "ou-y7xb-REPLACE-ME"

sso_instance_arn = "arn:aws:sso:::instance/ssoins-7223fcff316331ec"
# From `terraform output platform_admins_group_id` in stacks/05-org-structure.
platform_admins_group_id = "REPLACE-ME"

region      = "us-east-1"
aws_profile = "pedro-ops"
