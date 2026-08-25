# Copy to sandbox.tfvars (gitignored) and adjust.
#
#   terraform apply -var-file=sandbox.tfvars -target=module.budget   # budget first
#   terraform apply -var-file=sandbox.tfvars                         # then the rest

account_id  = "699475944323"
environment = "sandbox"
region      = "us-east-1"
aws_profile = "sandbox"

# Sandbox baseline is ~USD 1.10/month (KMS CMK 1.00 + trail storage). A USD 5
# ceiling leaves room to iterate and still trips long before it matters.
monthly_budget_usd         = "5"
budget_notification_emails = ["you@example.com"]

log_retention_days = 365
