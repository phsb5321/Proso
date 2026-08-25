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

## A third silent failure, found by applying

CloudWatch Logs writes vended logs under a prefix **it** chooses —
`AWSLogs/<account>/CloudFront/`, with `s3_delivery_configuration.suffix_path`
appended below that. Granting the delivery service any other prefix grants
nothing; AWS then injects the statement it needs into the log bucket policy
itself, and the next `terraform apply` deletes that statement and stops log
delivery, from a plan that reads like a formatting change.

So `logs_bucket_policy` writes the statement AWS writes, ARN-bound to the
delivery source. Both bucket policies are built with `jsonencode` rather than
`aws_iam_policy_document`, following `modules/deploy-role`: a data source is
mocked away under `terraform test`, so asserting on it would prove nothing,
while a local can be asserted against directly — which is what
`log_delivery_is_granted_the_prefix_aws_actually_writes_to` does.

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

Ten runs, all offline against a mocked provider — no credentials, no AWS calls.
Two of them are negative: a certificate requested outside `us-east-1` and an
`updates.json` that still advertises the old host must both fail to plan.

A test that cannot fail is not a test, so each run is falsified by plant:

```bash
./tests/falsify.sh
```

It plants the specific regression each run exists to catch, asserts that the
suite goes red on that run and no other, reverts, and confirms the suite is
green again. It refuses to start on a dirty working tree, because it reverts
with `git checkout`.

## Policy-as-code

```bash
checkov -d . --framework terraform --skip-download   # 63 passed, 0 failed, 13 skipped
trivy config --exit-code 1 --misconfig-scanners terraform .   # 0 misconfigurations
tflint --recursive --minimum-failure-severity=warning
```

Every exception carries its reason inline next to the resource it applies to.
The two scanners overlap, so most rows below are one finding under two names.

| Finding | Where | Why it is not fixed |
|---|---|---|
| `CKV_AWS_145`, `AVD-AWS-0132` (customer-managed key) | both buckets | CloudFront OAC cannot decrypt objects encrypted with the AWS-managed `aws/s3` key, because that key policy is not editable. The alternative is a CMK at USD 1.00/month against a USD 0.01/month ceiling — to encrypt files published to the public internet by design. S3 server access logging also cannot write into an SSE-KMS bucket. |
| `CKV_AWS_86`, `AVD-AWS-0010` (CloudFront access logging) | distribution | **False positive.** Access logging is enabled, through standard logging v2 (`aws_cloudwatch_log_delivery`). Both checks only recognise the legacy `logging_config` block, which writes with an ACL grant that a `BucketOwnerEnforced` log bucket cannot accept. |
| `CKV_AWS_68`, `CKV2_AWS_47`, `AVD-AWS-0011` (WAF) | distribution | An AWS WAF web ACL is USD 5.00/month minimum — 500x this stack's entire ceiling — in front of static files with no query processing and no origin compute. |
| `CKV_AWS_374` (geo restriction) | distribution | The site is a public download page for a Firefox add-on. Restricting it by country breaks the product; it does not secure it. |
| `CKV_AWS_310` (origin failover) | distribution | Failover needs a second origin, meaning a second bucket plus replication. The origin is one S3 bucket at 99.99% availability whose source of truth is a git repository, rebuilt in full by one script. |
| `CKV_AWS_174` (viewer TLS >= 1.2) | distribution | Phase-1 only. AWS does not allow `minimum_protocol_version` to be raised on the CloudFront default certificate. The conditional in `viewer_certificate` sets `TLSv1.2_2021` as soon as `attach_custom_domain` is true, which is the only configuration end users reach. |
| `CKV_AWS_144` (cross-region replication) | both buckets | Doubles the storage of a 1.2 MB bucket that is regenerated from git on every deploy. |
| `CKV2_AWS_62` (event notifications) | both buckets | Notifications need a consumer. Wiring S3 to EventBridge with no rule attached satisfies the check and changes nothing; object-level auditing belongs to account-level CloudTrail data events. |
| `CKV_AWS_18`, `AVD-AWS-0089` (access logging) | log bucket only | A log bucket that logs its own access is a write loop. It is the terminal sink; the origin bucket **is** logged, into it. |

Two findings were fixed rather than waived: CloudFront access logging (standard
logging v2) and the missing S3 lifecycle configuration (`CKV2_AWS_61`), which
now expires superseded object versions along with the access logs.

Trivy attributes `AVD-AWS-0132` and `AVD-AWS-0089` per resource, so the log
bucket carries its own copies of the two suppressions above rather than
inheriting the origin bucket's. For the log bucket, `AVD-AWS-0132` is not even a
trade-off: S3 server access logging cannot write into a KMS-encrypted bucket at
all, which Trivy's own rule text states.
