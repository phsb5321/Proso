# `static-site`

Private S3 origin behind CloudFront with Origin Access Control, plus the ACM
certificate CloudFront needs. Built for `proso.com.br`, which is 1.06 MB of
static files and an add-on auto-update payload.

There is no S3 website endpoint and no public bucket policy. The only principal
that can read the origin is the distribution created here, matched by ARN.

## The two invariants this module exists to hold

Both failure modes are silent: nothing errors, no request 500s, users simply
cannot install or stop receiving updates.

1. **`.xpi` is served as `application/x-xpinstall`.** Firefox refuses to install
   an add-on offered under any other type. `aws s3 sync` guesses content types
   from the local mimetypes database, which has never heard of `.xpi` and would
   publish it as `binary/octet-stream`.
2. **`updates.json` sits at the site root and the `.xpi` files under
   `releases/`.** The `update_url` compiled into every already-installed copy of
   the extension is absolute. Move the manifest under a prefix and every
   installed extension stops updating, with no channel left to tell them.

They are encoded as resource arguments in `releases.tf`, not as runbook prose,
so a regression fails `terraform plan`. Terraform owns those objects for exactly
this reason; `scripts/deploy-site.sh` syncs the marketing pages around them and
verifies them afterwards.

A third check rides along: once `attach_custom_domain` is true, the module
refuses to publish an `updates.json` whose `update_link` hosts do not match the
primary domain. Publishing a manifest that still points at the old host is worse
than not publishing one at all.

## Two-phase domain attachment

`attach_custom_domain` exists because a CloudFront distribution cannot attach an
ACM certificate that is not yet `ISSUED`, and issuing it needs a DNS record that
lives at Cloudflare.

| Phase | `attach_custom_domain` | Serves on | Certificate |
|---|---|---|---|
| 1 | `false` (default) | `*.cloudfront.net` | requested, pending validation |
| 2 | `true` | `var.domain_names` | attached, must be `ISSUED` |

Between the two, someone creates the records from the `acm_validation_records`
output at Cloudflare with proxying **off**. The final CNAME cutover
(`cutover_cname` output) is Pedro's, not this module's.

## Usage

```hcl
module "site" {
  source = "../../modules/static-site"

  name                 = "proso-site"
  domain_names         = ["proso.com.br"]
  attach_custom_domain = false
  release_source_dir   = "/path/to/assembled/site"
}
```

`release_source_dir` is the tree produced by `scripts/deploy-site.sh assemble`:
`updates.json` at its root and `releases/*.xpi` beneath it. Leave it `null` and
those objects are simply not managed — which also means the invariants above are
not enforced, so do not leave it `null` in a real deployment.

The provider must be in **us-east-1**. The certificate resource asserts this as
a precondition rather than trusting the caller.

## Tests

```bash
terraform init -backend=false
terraform test
```

Eight runs, all offline against a mocked provider — no credentials, no AWS
calls. Two of them are negative: a certificate requested outside `us-east-1` and
an `updates.json` that still advertises the old host must both fail to plan.

## Policy-as-code exceptions

Each `checkov:skip` in this module carries its reason inline. Summarised:

| Finding | Where | Why it is skipped |
|---|---|---|
| `CKV_AWS_145` (SSE-KMS) | both buckets | CloudFront OAC cannot decrypt objects encrypted with the AWS-managed `aws/s3` key, because that key policy is not editable. The alternative is a customer-managed key at USD 1.00/month against a USD 0.01/month ceiling — to encrypt files that are published to the public internet by design. |
| `CKV_AWS_18` (access logging) | log bucket | A log bucket that logs its own access is a write loop. It is the terminal sink; the origin bucket **is** logged, into it. |
| `CKV_AWS_68`, `CKV2_AWS_47` (WAF) | distribution | An AWS WAF web ACL is USD 5.00/month minimum — 500x this stack's entire ceiling — in front of static files with no query processing and no origin compute. |
| `CKV_AWS_374` (geo restriction) | distribution | The site is a public download page for a Firefox add-on. Restricting it by country breaks the product; it does not secure it. |

Everything else is fixed rather than waived, including CloudFront access
logging, which uses standard logging v2 (the vended-log pipeline) because the
legacy `logging_config` block writes with an ACL grant and the log bucket has
ACLs disabled.
