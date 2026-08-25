# `20-site` — proso.com.br on S3 + CloudFront

One `static-site` module in `us-east-1`. Everything of substance is documented in
[`../../modules/static-site/README.md`](../../modules/static-site/README.md);
this file is the operating procedure.

## Backend

Partial configuration. The state bucket is an output of `stacks/00-bootstrap`,
so it is supplied at init time rather than hardcoded here:

```bash
cat > backend.hcl <<'EOF'
bucket = "<state bucket from stacks/00-bootstrap>"
EOF

terraform init -backend-config=backend.hcl
```

Locking is `use_lockfile = true` — S3-native, Terraform >= 1.11. There is no
DynamoDB lock table and none should be added.

For offline work (`validate`, `fmt`, `test`, policy scanning) skip the backend
entirely:

```bash
terraform init -backend=false
```

## Order of operations

```bash
# 1. Assemble the site tree. Terraform reads updates.json and releases/*.xpi
#    from it, so this comes before plan, not after.
../../scripts/deploy-site.sh assemble --out /tmp/proso-site

# 2. Plan. attach_custom_domain stays false: phase 1 serves on *.cloudfront.net.
terraform plan -var site_source_dir=/tmp/proso-site

# 3. Apply — Sandbox-Account only, and only after the budget alarm in
#    stacks/10-account-baseline is live in that account (ADR-001 §4.2).
terraform apply -var site_source_dir=/tmp/proso-site

# 4. Publish the pages around the Terraform-owned objects and invalidate.
../../scripts/deploy-site.sh deploy --site /tmp/proso-site

# 5. Verify on the distribution's own domain, before any DNS change.
curl -sI "https://$(terraform output -raw distribution_domain_name)/" | head -3
curl -sI "https://$(terraform output -raw distribution_domain_name)/updates.json"
curl -sI "https://$(terraform output -raw distribution_domain_name)/releases/proso-1.2.1.xpi" \
  | grep -i content-type      # must be application/x-xpinstall
```

## Phase 2 — the custom domain

Only after step 5 is clean:

1. `terraform output acm_validation_records` → create them at Cloudflare, proxy
   **off**.
2. Wait for the certificate to reach `ISSUED`
   (`aws acm describe-certificate --certificate-arn "$(terraform output -raw certificate_arn)"`).
   CloudFront cannot attach a certificate in any other state.
3. `terraform apply -var site_source_dir=... -var attach_custom_domain=true`.
4. **Pedro** flips the `proso.com.br` CNAME (`terraform output cutover_cname`).
   That step is deliberately outside this stack.

Note that step 3 will refuse to plan while `updates.json` still advertises
`update_link` hosts outside `proso.com.br` — as it does today on the `gh-pages`
branch, where every link points at `phsb5321.github.io`. That is content owned
by the Proso repo and has to be corrected there first.

## Cost

Design ceiling is USD 0.01/month.

| Line item | Expected |
|---|---|
| CloudFront requests + transfer | USD 0 — 1 TB / 10M requests free, indefinitely, and the payload is 1.06 MB |
| S3 storage | ~USD 0.00003/month for 1.2 MB |
| S3 + CloudFront access logs | bounded by a 90-day expiry on the log bucket |
| ACM certificate | USD 0 |
| Route 53 | **none created** — DNS stays at Cloudflare, which is why it is USD 0 and not USD 0.50 |
