# `20-site` — proso.com.br on S3 + CloudFront

One `static-site` module in `us-east-1`, applied to **Sandbox-Account
699475944323** — the workload account per ADR-001's operator decision of
25/08/2026. Everything of substance is documented in
[`../../modules/static-site/README.md`](../../modules/static-site/README.md);
this file is the operating procedure. Current state:
[`../../docs/20-site-status.md`](../../docs/20-site-status.md). The custom domain is live; `attach_custom_domain = true` is the steady state.

## Credentials

Never root. The chain is `pedro-ops` (management account, assume-role only) →
`OrganizationAccountAccessRole` (sandbox) → `proso-deploy`, the least-privilege
role from `stacks/00-bootstrap`. Terraform performs the last hop itself, from
`assume_role_arn` in the tfvars:

```bash
export AWS_PROFILE=sandbox     # pedro-ops -> OrganizationAccountAccessRole
aws sts get-caller-identity    # expect .../assumed-role/OrganizationAccountAccessRole/...
```

## Backend

Partial configuration — the state bucket belongs to `stacks/00-bootstrap`, so it
is supplied at init time rather than hardcoded here. The committed
`sandbox.s3.tfbackend` holds it:

```bash
terraform init -backend-config=sandbox.s3.tfbackend
```

`kms_key_id` in that file is not optional: with `encrypt = true` alone the
backend sends `x-amz-server-side-encryption: AES256`, which the state bucket's
`DenyUnencryptedWrites` policy rejects.

Locking is `use_lockfile = true` — S3-native, Terraform >= 1.11. There is no
DynamoDB lock table and none should be added.

For offline work (`validate`, `fmt`, `test`, policy scanning) skip the backend
entirely:

```bash
terraform init -backend=false
```

## Order of operations

Enter the Proso root `nix-shell`, then return here. `cp example.tfvars
sandbox.tfvars` first; it is gitignored and carries the account, the role to
assume, and the path to the assembled site.

```bash
# From the Proso repository root:
nix-shell
cd infra/aws/stacks/20-site
test -e sandbox.tfvars || cp example.tfvars sandbox.tfvars

# 1. Assemble the site tree. Terraform reads updates.json and releases/*.xpi
#    from it, so this comes before plan, not after.
../../scripts/deploy-site.sh assemble

# 2. Gate, then plan. ADR-001 §4.4 — policy-as-code gates the plan, so the gate
#    runs before it, not after the fact.
(cd ../../../.. && make infra-check)
terraform plan -var-file=sandbox.tfvars -out=site.tfplan

# 3. Apply. The budget alarm in stacks/10-account-baseline must already be live
#    in the account (ADR-001 §4.2); it is.
terraform apply site.tfplan

# 4. Publish the pages around the Terraform-owned objects and invalidate.
#    updates.json and releases/*.xpi are NOT synced here — Terraform owns them,
#    and the script verifies rather than overwrites them.
../../scripts/deploy-site.sh deploy \
  --site ~/Documents/Code/personal/proso/.artifacts/site \
  --bucket "$(terraform output -raw bucket_name)" \
  --distribution "$(terraform output -raw distribution_id)"

# 5. Verify on the distribution's own domain, before any DNS change.
D=$(terraform output -raw distribution_domain_name)
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://$D/"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://$D/updates.json"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://$D/releases/proso-1.2.1.xpi"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://$D/releases/proso-1.2.9-sources.zip"
#   -> XPI: 200 application/x-xpinstall; source: 200 application/zip

# 6. Prove there is no drift. Anything other than 0 here means the config and
#    the account disagree — see docs/20-site-status.md for the one time that
#    was AWS editing a bucket policy behind Terraform's back.
terraform plan -detailed-exitcode -var-file=sandbox.tfvars
```

## Custom-domain certificate recovery

Phase 2 completed on 31/08/2026. Keep `attach_custom_domain = true`. If a future certificate is
`VALIDATION_TIMED_OUT`, its output cannot be used to revive it: follow
[`../../docs/20-site-status.md`](../../docs/20-site-status.md), apply only the
reviewed replacement once Pedro is ready to validate it, then read the new
outputs.

1. `terraform output acm_validation_records` → create them at Cloudflare, proxy
   **off**.
2. Wait for the certificate to reach `ISSUED`
   (`aws acm describe-certificate --certificate-arn "$(terraform output -raw certificate_arn)"`).
   CloudFront cannot attach a certificate in any other state.
3. `terraform apply -var-file=sandbox.tfvars -var attach_custom_domain=true`.
4. **Pedro** flips the `proso.com.br` CNAME (`terraform output cutover_cname`).
   That step is deliberately outside this stack.

The attach step refuses to plan if `updates.json` advertises update hosts outside
`proso.com.br`. The `gh-pages` release payload now uses the custom domain; keep
that invariant when publishing later self-distributed versions.

## Cost

Design ceiling is USD 0.01/month.

| Line item | Expected |
|---|---|
| CloudFront requests + transfer | USD 0 — 1 TB / 10M requests free, indefinitely, and the payload is 1.06 MB |
| S3 storage | ~USD 0.00003/month for 1.2 MB |
| S3 + CloudFront access logs | bounded by a 90-day expiry on the log bucket |
| ACM certificate | USD 0 |
| Route 53 | **none created** — DNS stays at Cloudflare, which is why it is USD 0 and not USD 0.50 |
