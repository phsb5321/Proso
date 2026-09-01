# `stacks/20-site` — status, 30/08/2026

**Live** on `https://d23aubpqrsmco3.cloudfront.net` in **Sandbox-Account
699475944323**, per the operator decision recorded in ADR-001 (`da2c65a`): the
workload account is Sandbox-Account and no new account is created.

DNS is untouched. `proso.com.br` still points at GitHub Pages; the cutover is
Pedro's, and nothing in this stack performs it.

## Update — 30/08/2026 11:53 BRT

A read-only drift replay after PR #231 requested the two stacks this handoff
owns:

- `00-bootstrap`: no changes.
- `20-site`: `1 to add, 0 to change, 0 to destroy` — a replacement ACM
  certificate only.

Policy-listed `10-account-baseline` was not part of this scoped command; this is
not a claim that every drift-enabled stack was replayed.

ACM still returns the original certificate ARN, now with status
`VALIDATION_TIMED_OUT` (`FAILED` in the list summary). CloudTrail contains no
`DeleteCertificate` event. The AWS provider treats that terminal certificate
as absent, which is why Terraform describes it as deleted and proposes a new
request.

The live distribution is unaffected: the root and `updates.json` return 200,
the `.xpi` returns `application/x-xpinstall`, and CloudFront still has no aliases.
`proso.com.br` still serves GitHub Pages. No apply, destroy, state mutation, or
DNS change was made.

**[pending] Pedro:** coordinate a fresh certificate request with the Cloudflare
validation record. Applying the replacement before that window would only
repeat the timeout; both the apply and every DNS change remain explicitly
gated.

## Update — 31/08/2026 21:40 BRT — root cause of the first timeout; zone measured healthy

Read-only evidence gathered 31/08:

- ACM `626a3f28-…` expected the validation record
  `_2d2f3e6a75c9b9320d5cb5f2d66d39cb.proso.com.br` CNAME
  `_bab0230780051a82f7f869e8d14a322d.jkddzztszm.acm-validations.aws.`.
- That record EXISTS in the Cloudflare zone today: `kolton.ns.cloudflare.com`
  serves it authoritatively (a proxied record would be hidden — so proxying is
  OFF), and 1.1.1.1, 8.8.8.8, and 9.9.9.9 all resolve it publicly with the
  exact expected value.
- The zone has no CAA records (`dig proso.com.br CAA` is empty) and no DNSSEC
  delegation (no DS at the .br TLD); neither can block an ACM validator.

So the record is correct but late: the certificate was requested 25/08 13:56
BRT and its 72-hour validation window closed ~28/08 before the record was in
place. The failure was coordination, not DNS. A replacement request with its
CURRENT record present during the window validates under normal conditions,
which retires the "would only repeat the timeout" premise above. The stale
`_2d2f3e6a…` record belongs to the dead certificate; delete it in the same
window.

**[pending] Pedro (same gate, sharpened):** the apply + validation-record
window, then the final cutover. Every step stays explicitly gated; the
window is now evidence-backed end to end.

## What is live

| | |
|---|---|
| Distribution | `E270HHOCYNLND` → `d23aubpqrsmco3.cloudfront.net` |
| Origin bucket | `proso-site-699475944323` — private, OAC-only, versioned, SSE-S3 |
| Log bucket | `proso-site-699475944323-logs` — 90-day expiry |
| Certificate | `arn:aws:acm:us-east-1:699475944323:certificate/626a3f28-…` — `VALIDATION_TIMED_OUT`, **not attached** (phase 1) |
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
| S3 storage | ~USD 0.00003/month for 1.2 MB |
| Access logs (S3 + CloudFront) | bounded by the 90-day expiry on the log bucket |
| ACM certificate | USD 0 |
| Route 53 | none created |
| *Orphaned KMS key (above)* | *USD 1.00/month until deleted — not this stack's* |

## Phase 2 — the custom domain, when Pedro wants it

Blocked on the coordinated validation window only. The content blocker is
gone: the payload on CloudFront has served `https://proso.com.br/releases/…`
update links since the re-assemble (verified 31/08), so the module's
update_link-host forcing function is satisfied and
`attach_custom_domain = true` plans clean once the replacement certificate is
ISSUED.

Order, once Pedro is ready:

1. **Pedro** confirms he is ready to create the Cloudflare validation record
   and authorizes the reviewed Sandbox apply.
2. Re-run the plan and apply only the replacement certificate action — no
   destroy and no unrelated change.
3. Read the replacement's current `acm_validation_records`; **Pedro** creates
   that CNAME at Cloudflare with proxying **off**. Do not reuse a stale value
   copied from this runbook.
4. Wait for `ISSUED` — CloudFront cannot attach a certificate in any other state.
5. `terraform apply -var-file=sandbox.tfvars -var attach_custom_domain=true`.
6. **Pedro** points `proso.com.br` at `d23aubpqrsmco3.cloudfront.net`.

## Content defects, owned by the Proso repo

Updated 31/08 against the live CloudFront payload:

1. RESOLVED — `updates.json` now advertises `https://proso.com.br/releases/…`
   for both add-ons (verified on the wire 31/08).
2. OPEN, owned by the AMO/distribution track: the public channel advertises
   1.1.3 and 1.2.1 while the shipped extension is 1.2.9. Publishing 1.2.9 is
   that track's call, not this stack's.
3. RESOLVED by #239 (2026-08-31): canonical/og:url/JSON-LD across five pages
   plus the legal/terms canonical and brand-home link now say proso.com.br;
   ships with the next `assemble`.
4. OPEN: `packages/site/package.json` is published as a site asset (200 on
   the distribution, 31/08).
