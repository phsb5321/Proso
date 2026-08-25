# infra/aws — Proso cloud infrastructure

Terraform for Proso's AWS footprint. Design, guardrails and the SOTA review that
produced them: [`docs/ADR-001-aws-foundation.md`](docs/ADR-001-aws-foundation.md).

**Read the ADR before running anything.** Three rules matter most:

1. `terraform apply` against the production account requires Pedro's explicit go.
   `Sandbox-Account` (699475944323) is the free-iteration account.
2. A **budget alarm is the first apply** in any account — nothing else is created
   until spend is observable.
3. **Root credentials are used for exactly one operation** (creating the member
   account) and never for routine work.

## Layout

| Path | Purpose |
|---|---|
| `stacks/00-bootstrap` | State bucket + deploy role. Starts on local state, then migrates into itself. |
| `stacks/10-account-baseline` | Budget alarm, CloudTrail, password policy. |
| `stacks/20-site` | S3 + CloudFront + OAC + ACM for `proso.com.br` (≈ $0/month). |
| `modules/` | Golden modules; each ships a `terraform test`. |

One state file per stack, so a mistake in one cannot lock or corrupt another.

## Quick start

```bash
cd stacks/00-bootstrap
terraform init
terraform plan            # plan-only is always safe
```

## Cost

The site stack is designed to land under **$0.01/month**: CloudFront's 1 TB /
10M-request free tier is indefinite, the payload is 1.06 MB, and DNS stays at
Cloudflare so no Route 53 hosted zone is billed. Current account spend is
~$23.40/month, essentially all backup storage.
