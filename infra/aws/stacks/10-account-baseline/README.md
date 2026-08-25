# stacks/10-account-baseline

Budget alarm, console password policy, and a multi-region CloudTrail. The first
thing that exists in any account.

**Applied and verified in Sandbox-Account (699475944323) on 25/08/2026.**

## Apply order — the budget goes first

ADR-001 §4.2: nothing is created in an account until spend is observable.

```bash
cp example.tfvars sandbox.tfvars     # gitignored; edit the email
AWS_PROFILE=sandbox terraform init -backend-config=sandbox.s3.tfbackend
terraform apply -var-file=sandbox.tfvars -target=module.budget   # 1. budget only
terraform apply -var-file=sandbox.tfvars                         # 2. everything else
```

`-target` prints a "resource targeting is in effect" warning. That is expected
here and is the point: the first apply is deliberately partial.

## What it costs

| Item | Monthly |
|---|---|
| AWS Budgets (first two budgets per account) | $0 |
| CloudTrail management events, first trail | $0 |
| KMS customer-managed key for log encryption | $1.00 |
| S3 storage for trail + access logs | cents |

≈ **$1.10/month.** The `$5` default budget trips well before that matters.

## State

State is in the private, versioned, CMK-encrypted bootstrap bucket at
`10-account-baseline/terraform.tfstate`, with S3-native locking. The original
local state was migrated on 25/08/2026; do not reintroduce local state or a
DynamoDB lock table.

## Verified after apply

```
$ aws --profile sandbox cloudtrail get-trail-status --name sandbox-trail
{"IsLogging": true, "LatestDeliveryError": null, "LatestNotificationError": null}

$ aws --profile sandbox s3api get-public-access-block --bucket sandbox-cloudtrail-699475944323
{"BlockPublicAcls": true, "IgnorePublicAcls": true,
 "BlockPublicPolicy": true, "RestrictPublicBuckets": true}

$ curl -s -o /dev/null -w '%{http_code}\n' http://sandbox-cloudtrail-699475944323.s3.amazonaws.com/
403
```

## Policy-as-code deviations

Checkov and Trivy pass with zero failures. Six checks are skipped inline, each
next to the code it applies to, with the reasoning in the comment:

| Check | Where | Why |
|---|---|---|
| `CKV_AWS_9` / `AVD-AWS-0062` | password policy | Forced rotation is an anti-pattern under NIST SP 800-63B §5.1.1.2 and was dropped from CIS AWS Foundations 3.0. The check encodes CIS 1.x. |
| `CKV_AWS_356`, `CKV_AWS_109`, `CKV_AWS_111` | KMS key policy | False positives. A KMS *key policy* must use `Resource: "*"`, which KMS reads as "this key" — the ARN does not exist while the key is being created. |
| `CKV_AWS_144` | log bucket | Cross-region replication doubles storage and adds a bucket plus a role, to protect a sandbox audit log whose loss costs nothing. |
| `CKV2_AWS_62` | log bucket | Event notifications with nothing subscribed is a gate that cannot fail. |
| `CKV2_AWS_10` / `AVD-AWS-0162` | trail | CloudWatch Logs delivery is billed per GB in and per GB stored, for metric filters this account does not consume. **Not skipped for the management account** — see `docs/root-key-retirement-plan.md` §7. |
| `CKV_AWS_252` | trail | An SNS topic on a trail fires every ~5 minutes forever with no subscriber. |

## Running it against the management account

Don't, without Pedro's go — that account holds root and the backup buckets, so
it is production under ADR-001 §4.1. The stack itself is account-agnostic:
`allowed_account_ids` makes Terraform refuse to plan if the credentials resolve
anywhere other than the `account_id` in the tfvars.
