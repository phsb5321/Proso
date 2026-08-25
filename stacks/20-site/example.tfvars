# Copy to sandbox.tfvars (gitignored) and apply with -var-file=sandbox.tfvars.

# ADR-001, operator decision of 25/08/2026: the workload account IS
# Sandbox-Account. stacks/15-member-account stays written and never applied.
account_id  = "699475944323"
environment = "sandbox"
region      = "us-east-1"

# Least privilege, per ADR-001 §2.5. Created by stacks/00-bootstrap; it trusts
# OrganizationAccountAccessRole, so the chain is
# pedro-ops -> OrganizationAccountAccessRole -> proso-deploy.
assume_role_arn = "arn:aws:iam::699475944323:role/proso-deploy"

domain_names = ["proso.com.br"]

# PHASE 1. Leave false until the certificate is ISSUED — CloudFront cannot
# attach a PENDING_VALIDATION certificate, and the site is verified on its
# *.cloudfront.net domain before DNS is touched at all.
attach_custom_domain = false

# The assembled site tree: `scripts/deploy-site.sh assemble --out <dir>`.
# Terraform reads updates.json and releases/*.xpi from here so their keys and
# content types are enforced at plan time.
site_source_dir = "/home/notroot/Documents/Code/personal/proso/.artifacts/site"
