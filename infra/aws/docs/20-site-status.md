# `stacks/20-site` — status, 31/08/2026

**Live on `https://proso.com.br`** in **Sandbox-Account 699475944323**. The
custom domain now resolves through Cloudflare DNS flattening to the CloudFront
distribution; GitHub Pages is no longer in the apex path.

## Update — 31/08/2026 21:52 BRT

The coordinated phase-2 cutover completed end to end:

1. The corrected site plus the existing update feed and XPIs were verified on
   `d23aubpqrsmco3.cloudfront.net`.
2. Terraform applied one replacement ACM certificate and one in-place
   `updates.json` object change; no resource was destroyed.
3. The exact ACM validation CNAME was added at Cloudflare with proxying off.
4. Certificate `34f6ca26-…` reached `ISSUED`.
5. Terraform attached `proso.com.br`, the certificate, SNI, and
   `TLSv1.2_2021` to `E270HHOCYNLND` in place.
6. Cloudflare changed the apex CNAME from `phsb5321.github.io` to
   `d23aubpqrsmco3.cloudfront.net`, DNS only.

Post-cutover probes return HTTP 200 for the homepage, legal pages, update
manifest, both signed XPIs, and corresponding-source archives for every distributed version plus the 1.2.10 AMO candidate. XPI
content type is `application/x-xpinstall`; source is `application/zip`; both
update hashes match downloaded bytes. The stale public `package.json` was
removed with an S3 versioned delete marker. A final Terraform plan reports
**No changes**.

## What is live

| | |
|---|---|
| Distribution | `E270HHOCYNLND` → `d23aubpqrsmco3.cloudfront.net` |
| Origin bucket | `proso-site-699475944323` — private, OAC-only, versioned, SSE-S3 |
| Log bucket | `proso-site-699475944323-logs` — 90-day expiry |
| Certificate | `arn:aws:acm:us-east-1:699475944323:certificate/34f6ca26-…` — `ISSUED`, attached, `TLSv1.2_2021` |
| State | `s3://proso-tfstate-699475944323/20-site/terraform.tfstate`, S3-native locking |
| Applied as | `proso-deploy` — the least-privilege role, never an admin, never root |

Route 53: **none**. No hosted zone exists or should; DNS stays at Cloudflare.

### Measured on the wire

```console
$ for u in "" updates.json releases/proso-1.2.1.xpi releases/voxpage-1.1.3.xpi \
           pricing.html legal/terms.html sitemap.xml robots.txt; do
    curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' \
      "https://d23aubpqrsmco3.cloudfront.net/$u"; done
200 text/html; charset=utf-8
200 application/json
200 application/x-xpinstall          <- the invariant, on the wire
200 application/x-xpinstall
200 text/html; charset=utf-8
200 text/html; charset=utf-8
200 application/xml
200 text/plain; charset=utf-8

$ curl -sSI http://d23aubpqrsmco3.cloudfront.net/ | head -1
HTTP/1.1 301 Moved Permanently

$ curl -sS -o /dev/null -w '%{http_code}\n' \
    https://proso-site-699475944323.s3.us-east-1.amazonaws.com/index.html
403                                  <- origin is reachable only through the OAC
```

Both silent killers are held where they cannot be forgotten: `.xpi` is served as
`application/x-xpinstall`, and `updates.json` and `releases/` are at the site
root. Terraform owns those three objects, so a regression fails `plan` rather
than a user's browser.

### Historical clean plan — 25/08/2026

This transcript is superseded by the 30/08/2026 drift update above.

```console
$ terraform plan -detailed-exitcode -var-file=sandbox.tfvars
No changes. Your infrastructure matches the configuration.
$ echo $?
0
```

A post-subtree audit found one false-drift source: `aws_s3_object.source` stored
the absolute checkout path, so an identical payload assembled in a feature
worktree planned three object rewrites. The stack and module now reject absolute
payload paths, and `example.tfvars` uses the same relative path in every checkout
while `source_hash` remains the content trigger. The allowlisted Sandbox apply
migrated exactly those paths (`0 added, 3 changed, 0 destroyed`); the follow-up
plan was clean at `-detailed-exitcode` 0. Local MD5s still equal the three live
S3 ETags, and a one-byte disposable `.xpi` change plans exactly one `source_hash`
update. All 12 Terraform invariants turn red under their own falsification plant
and return green after revert.

## Bug found and fixed by applying: the log-delivery policy fought AWS

The first apply succeeded, and the very next plan wanted to change something
nobody had touched:

```console
$ terraform plan -detailed-exitcode
  # module.site.aws_s3_bucket_policy.logs will be updated in-place
      - Sid       = "AWSLogDeliveryWrite1"
      - Resource  = "arn:aws:s3:::proso-site-699475944323-logs/AWSLogs/699475944323/CloudFront/*"
Plan: 0 to add, 1 to change, 0 to destroy.
```

CloudWatch Logs writes vended logs under a prefix **it** chooses —
`AWSLogs/<account>/CloudFront/`, with `suffix_path` appended below that. The
module had granted `cloudfront/*`, a prefix nothing writes to, so the service
injected the statement it actually needed into the bucket policy itself. The
next apply would have deleted that statement and stopped log delivery, with a
plan that read like a formatting change.

Fixed by writing the statement AWS writes, and by dropping the now-duplicated
`cloudfront/` segment from `suffix_path` (the live config had become
`AWSLogs/{account-id}/CloudFront/cloudfront/{DistributionId}/…`). Both bucket
policies moved from `aws_iam_policy_document` to `jsonencode`, following
`modules/deploy-role`'s note that a data source is mocked away under
`terraform test` and asserting on it proves nothing — so the regression now has
a test. Delivery is confirmed working:

```console
$ aws s3 ls s3://proso-site-699475944323-logs/ --recursive
2026-08-25 14:06:35  12601 AWSLogs/699475944323/CloudFront/…/E270HHOCYNLND.2026-08-25-17.…parquet
```

## [pending] Pedro: an orphaned KMS key, USD 1.00/month

`stacks/00-bootstrap` was applied by a sibling agent at 16:30 UTC while this
tab's plan for the same stack was in flight. Mine lost the race and failed with
`EntityAlreadyExists` / `BucketAlreadyExists` — but not before creating one KMS
key, 16 seconds in:

```
KeyId 22610544-2b8a-4ed8-8043-e9ae9f5235a6   Enabled   2026-08-25T13:31:31-03:00
```

It has no alias, no policy grant to anything, and no Terraform state referencing
it — `terraform state rm` was used to drop it rather than have two states
disagree, and the local bootstrap state was discarded in favour of the sibling's
in S3. The live key is `2056b8bb-…`, which is what `alias/proso-tfstate-…` and
the deploy role point at.

It is tagged for identification:

```console
$ aws kms list-resource-tags --key-id 22610544-2b8a-4ed8-8043-e9ae9f5235a6
Status=orphan
Orphan-Reason=duplicate-of-alias-proso-tfstate-created-by-concurrent-apply-2026-08-25
Orphan-Action=schedule-key-deletion-pending-operator
```

Not deleted here: ADR-001 §4.6 — destructive operations are never autonomous —
and `modules/deploy-role` explicitly denies `kms:ScheduleKeyDeletion`. It costs
USD 1.00/month against a USD 5.00/month budget. One command, cancellable for the
whole waiting period:

```bash
aws kms schedule-key-deletion --profile sandbox \
  --key-id 22610544-2b8a-4ed8-8043-e9ae9f5235a6 --pending-window-in-days 30
```

## Cost

Budget `sandbox-monthly-cost` is live at USD 5.00/month; actual spend is USD
0.00 so far. This stack's own ceiling is USD 0.01/month:

| Line item | Expected |
|---|---|
| CloudFront requests + transfer | USD 0 — 1 TB / 10M requests free indefinitely, payload is 1.06 MB |
| S3 storage | under USD 0.001/month for the site, XPIs, and ~8 MB source archive |
| Access logs (S3 + CloudFront) | bounded by the 90-day expiry on the log bucket |
| ACM certificate | USD 0 |
| Route 53 | none created |
| *Orphaned KMS key (above)* | *USD 1.00/month until deleted — not this stack's* |

## Phase 2 — complete

`attach_custom_domain = true` is now the tracked configuration. Reverting it
would detach the certificate and break the public domain; rollback instead
means restoring Cloudflare’s prior apex target while the CloudFront alias stays
ready.

The content blockers are also closed: update links use `proso.com.br`, canonical
and Open Graph URLs use the custom domain, the workspace `package.json` is not a
site asset, and minimal build-tested source closures for 1.1.3, 1.2.1, and the corrected 1.2.10 candidate are publicly available.
The signed self-distributed channel intentionally remains at 1.2.1; the 1.2.10
binary is the separate Mozilla-hosted listing and is awaiting Mozilla review.
