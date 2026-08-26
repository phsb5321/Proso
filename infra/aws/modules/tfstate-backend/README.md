# `tfstate-backend`

An S3 bucket fit to hold Terraform state, plus the KMS key that protects it and
the bucket that receives its access logs.

ADR-001 §2.3 — *"state is a secret"* — is the reason for most of what is here:
a customer-managed key rather than free SSE-S3, a policy that refuses writes
which are not KMS-encrypted, and access logging.

## What it creates

| Resource | Why |
|---|---|
| `aws_s3_bucket.state` | The state bucket |
| `aws_s3_bucket_versioning.state` | An overwritten state is recoverable |
| `aws_s3_bucket_server_side_encryption_configuration.state` | `aws:kms` with the CMK below |
| `aws_s3_bucket_public_access_block.state` | All four flags |
| `aws_s3_bucket_ownership_controls.state` | `BucketOwnerEnforced` — ACLs cannot re-open it |
| `aws_s3_bucket_policy.state` | Denies non-TLS and non-KMS writes |
| `aws_s3_bucket_lifecycle_configuration.state` | Expires superseded versions after 90 days |
| `aws_s3_bucket_logging.state` | Access logs to the log bucket |
| `aws_s3_bucket_notification.state` | S3 events to the default EventBridge bus |
| `aws_kms_key.state` + alias | CMK, rotation on, 30-day deletion window |
| `aws_s3_bucket.logs` + the same hardening | Log destination |

No DynamoDB table: locking is S3-native (`use_lockfile`).

## Why ARNs are derived rather than read back

`local.state_bucket_arn` is built from the bucket name instead of read from
`aws_s3_bucket.state.arn`. An S3 ARN is a pure function of the name, so
deriving it keeps every policy document **known at plan time**. A reviewer then
sees the actual policy in `terraform plan` output instead of `(known after
apply)`, and the tests can assert on it. The same reasoning applies to the IAM
role ARN in `deploy-role`.

## Accepted deviations

Guardrail ADR-001 §4.4 says a policy finding is fixed, or recorded with
evidence — never waived to go green. Four are recorded, all narrowly scoped to
the resource they apply to (`terraform test` plant 8 confirms the state bucket
is still gated by `CKV_AWS_145`).

| Check | Resource | Why not fixed |
|---|---|---|
| `CKV_AWS_145` (KMS encryption) | log bucket only | **The fix would break the control.** S3 server access logging supports "SSE-S3 only" for the destination bucket ([ServerLogs.html](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html)). A CMK here silently stops log delivery. The state bucket does use a CMK. |
| `CKV_AWS_18` (access logging) | log bucket only | This *is* the log destination. Self-logging makes each delivery generate another record; a third bucket to log the log bucket moves the problem one hop and never terminates. |
| `CKV_AWS_144` (cross-region replication) | both buckets | Cost and blast radius against negligible benefit. State is versioned, and S3 single-region durability is 99.999999999%; a lost state file is recoverable by `terraform import`, which is tedious but not data loss. CRR would add a second regional bucket, a replication IAM role — which the deploy role is explicitly denied the right to create — and per-GB replication charges, against a stack whose target is ~$0/month. Revisit if state ever holds something not reconstructible from the account. |
| `CKV2_AWS_62` | — | **Fixed, not skipped.** Both buckets now emit events to the default EventBridge bus (free; only matched rules and fired targets bill). |

## Cost

The CMK is **USD 1.00/month**. Everything else is storage measured in kilobytes.
Against a current account spend of ~$23.40/month this buys a separate
authorisation boundary for state and a CloudTrail record of every decrypt.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `account_id` | *(required)* | Passed explicitly so plan and test need no credentials |
| `bucket_name` | *(required)* | Globally unique |
| `log_bucket_name` | *(required)* | Globally unique |
| `noncurrent_version_retention_days` | `90` | Every apply writes a version; unbounded retention is a slow cost leak |
| `log_retention_days` | `90` | |
| `reader_principal_arns` | `[]` | Extra principals granted decrypt on the CMK |
| `sealed_state_prefixes` | `[]` | Retired cross-account state denied to every principal at the bucket boundary |
| `tags` | `{}` | Must include `Environment` — the SCP requires it |

## Tests

`terraform test` — no credentials required, the provider is mocked.

```console
$ terraform test
Success! 7 passed, 0 failed.
```

Covers: all four public-access-block flags on both buckets, no wildcard-principal
`Allow` in the bucket policy, `BucketOwnerEnforced`, versioning enabled,
`aws:kms` encryption with rotation, the deny-unencrypted and deny-insecure-
transport statements, sealed-prefix read/write/delete/list denial, log delivery
target, and rejection of malformed account IDs or unsafe sealed prefixes.
