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
| `stacks/05-org-structure` | OUs, SCP attachment, Identity Center permission sets. Plan-only — management account. |
| `stacks/10-account-baseline` | Budget alarm, CloudTrail, password policy. **Applied in Sandbox.** |
| `stacks/15-member-account` | Creates `proso-prod` in the `Workloads` OU. **Written, never applied** — ADR-001 §3 makes Sandbox-Account the workload account. Kept so graduating later is one apply, not a redesign. |
| `stacks/20-site` | S3 + CloudFront + OAC + ACM for `proso.com.br` (≈ $0/month). |
| `modules/` | Golden modules; each ships a `terraform test`. |
| `policies/` | Standalone IAM policy JSON referenced by stacks. |
| `scripts/` | The policy gate, its falsification test, and one-off bootstrap scripts. |
| `policy/fixtures/` | Green and red controls that keep the gate falsifiable. |
| `quality-baselines/` | Accepted findings — each with a reason and an expiry date. |
| `.forgejo/workflows/` | CI on the self-hosted runner. Not `.github/` — that path bills money. |

## Access

Access is IAM Identity Center permission sets, not IAM users — short-lived
credentials, no static key to leak or rotate. See
[`stacks/05-org-structure`](stacks/05-org-structure/README.md) and, for the plan
that retires the root access key,
[`docs/root-key-retirement-plan.md`](docs/root-key-retirement-plan.md).

CI federates to AWS over OIDC. Forgejo Actions supports OIDC but its issuer is
Tailscale-only, so AWS cannot validate the token — measured and written up in
[`docs/forgejo-oidc-federation.md`](docs/forgejo-oidc-federation.md). GitHub
Actions OIDC is the target instead.

## Toolchain

Terraform ≥ 1.11 (S3-native state locking via `use_lockfile`; no DynamoDB lock
table). The Proso root `shell.nix` declares Terraform, tflint, Trivy, Checkov's
`uv` runner, AWS CLI, jq and curl. Do not assemble an ad-hoc Nix shell for this
subtree.

One state file per stack, so a mistake in one cannot lock or corrupt another.

## Quick start

Run the repository-level entrypoints from the Proso root:

```bash
nix-shell                    # enter the toolchain declared by ./shell.nix
make infra-check             # fmt -> validate -> tflint -> Trivy/Checkov -> test
make infra-drift             # read-only plans; requires the documented sandbox config

cd infra/aws/stacks/00-bootstrap
test -e sandbox.tfvars || cp example.tfvars sandbox.tfvars
terraform init -backend-config=sandbox.s3.tfbackend
terraform plan -lock=false -var-file=sandbox.tfvars
```

How the gates work, what is deliberately not wired yet, and how to accept a
finding without turning the ratchet into a blanket skip:
[`docs/policy-gates.md`](docs/policy-gates.md).

## Cost

The site stack is designed to land under **$0.01/month**: CloudFront's 1 TB /
10M-request free tier is indefinite, the payload is 1.06 MB, and DNS stays at
Cloudflare so no Route 53 hosted zone is billed. Current account spend is
~$23.40/month, essentially all backup storage.
