# `stacks/00-bootstrap` — state backend + deploy role

Creates the two things every later stack depends on:

- the **Terraform state bucket** (private, versioned, CMK-encrypted, access-logged)
  and its KMS key — see [`modules/tfstate-backend`](../../modules/tfstate-backend/);
- the **`proso-deploy` role** that later stacks assume for plan and apply — see
  [`modules/deploy-role`](../../modules/deploy-role/).

There is **no DynamoDB lock table**. Locking is S3-native (`use_lockfile = true`,
Terraform ≥ 1.11), per ADR-001 §2.4. It could not be created here anyway: the
`SandboxRestrictions` SCP denies `dynamodb:CreateTable`.

---

## Status — APPLIED to Sandbox-Account 699475944323 (25/08/2026)

Sandbox-Account is the workload account (ADR-001 §3, operator decision). Applied,
state migrated into the bucket this stack created, locking proven.

```console
$ terraform apply bootstrap.tfplan
Apply complete! Resources: 21 added, 0 changed, 0 destroyed.

$ terraform plan -detailed-exitcode        # after migration
No changes. Your infrastructure matches the configuration.
PLAN_DETAILED_EXITCODE=0
```

Guardrail ADR-001 §4.2 was satisfied first — the budget alarm already existed
when this ran:

```console
$ aws budgets describe-budgets --account-id 699475944323 --profile sandbox
sandbox-monthly-cost: 5.0 USD/MONTHLY
```

Nothing here used root. The apply ran as `pedro-ops` assuming
`OrganizationAccountAccessRole`.

### Verified against the live account, not just against the plan

| Claim | Evidence |
|---|---|
| State is KMS-encrypted with our CMK | `head-object` → `SSEKMSKeyId: .../key/2056b8bb-…` |
| Key rotation is on | `get-key-rotation-status` → `KeyRotationEnabled: true`, next 2027-08-25 |
| Bucket is not public | `get-public-access-block` → all four flags `true` |
| Versioning is on | `get-bucket-versioning` → `Status: Enabled` |
| Access logging is wired | `get-bucket-logging` → `s3-access/proso-tfstate-699475944323/` |
| Deploy role is assumable | `sts assume-role` → `assumed-role/proso-deploy/verify-least-privilege` |
| `iam:*` really is denied | `iam list-users` → `AccessDenied … with an explicit deny in an identity-based policy` |
| `organizations:*` really is denied | `organizations list-accounts` → `AccessDeniedException` |
| `s3:DeleteBucket` really is denied (§4.6) | `delete-bucket` → explicit deny; both buckets still present afterwards |
| Role cannot reach other buckets | `get-object` on `sandbox-cloudtrail-…` → `no identity-based policy allows s3:ListBucket` |

### The one thing that is still transitional

Identity Center is still empty, so `deploy_role_trusted_principal_arns` names
`OrganizationAccountAccessRole` so that the role is assumable at all. That is a
de-escalation path — the role it trusts is already administrator in this account
— but it is not the end state. When `stacks/05-org-structure` is applied, the
`SandboxAdmin` permission set already named in
`deploy_role_trusted_permission_set_names` carries the trust on its own and that
line should be deleted.

---

## First apply: the chicken-and-egg

This stack creates the bucket that this stack's state will live in, so the first
run cannot use the backend it is about to build. `backend.tf` must be absent for
exactly one apply, then restored and migrated into.

This is the sequence that was actually run.

```bash
cd stacks/00-bootstrap
cp example.tfvars sandbox.tfvars      # sandbox.tfvars is gitignored
export AWS_PROFILE=pedro-ops          # NOT root; terraform assumes into Sandbox

# --- phase 1: local state -------------------------------------------------
mv backend.tf backend.tf.bootstrap-off
terraform init                        # no backend block -> local state
terraform plan  -var-file=sandbox.tfvars -out=bootstrap.tfplan
terraform apply bootstrap.tfplan

# --- phase 2: migrate state into the bucket it just created ---------------
mv backend.tf.bootstrap-off backend.tf
terraform init -backend-config=sandbox.s3.tfbackend -migrate-state
#   Terraform asks: "Do you want to copy existing state to the new backend?"
#   -> yes   (-force-copy answers it non-interactively)

# --- phase 3: verify, then remove the local copy --------------------------
terraform plan -var-file=sandbox.tfvars -detailed-exitcode   # expect 0/"No changes"
aws s3 ls "s3://proso-tfstate-699475944323/00-bootstrap/"
rm terraform.tfstate terraform.tfstate.backup
```

> **The backend does not inherit the provider's `assume_role`.** It authenticates
> before any variable is evaluated, so `bootstrap_assume_role_arn` cannot reach
> it. Phase 2 first failed with:
>
> ```
> Error: Error loading state:
>     Unable to access object "00-bootstrap/terraform.tfstate" in S3 bucket
>     "proso-tfstate-699475944323": ... StatusCode: 403 ... api error Forbidden
> ```
>
> — the backend was authenticating as `pedro-ops` in the *management* account,
> and S3 answers a cross-account `HeadObject` with 403 rather than 404, so it
> reads like a permissions bug on an object that does not exist yet. The fix is
> the `assume_role` block now in `sandbox.s3.tfbackend`, which keeps backend and
> provider on the same identity regardless of the caller's profile. Terraform
> aborted cleanly — *"the state in both the source and the destination remain
> unmodified"* — so this is recoverable, not destructive.

Every **later** stack and every fresh clone skips phase 1 entirely — the bucket
already exists, so `terraform init -backend-config=<env>.s3.tfbackend` is all
that is needed.

> `kms_key_id` in `sandbox.s3.tfbackend` is not optional. With `encrypt = true`
> alone the backend sends `x-amz-server-side-encryption: AES256`, which the
> bucket's `DenyUnencryptedWrites` policy rejects — the apply would fail with
> `AccessDenied` on the first state write.

## Proving the lock (definition of done)

Two concurrent plans; the second must block rather than proceed.

Run from **two separate working directories**, each with its own `.terraform`,
so this is a genuine cross-process race rather than one directory racing itself.

```bash
# A — grabs the lock
( cd stacks/00-bootstrap && terraform plan -var-file=sandbox.tfvars ) &
sleep 3
# B — a second checkout, refusing to wait
( cd "$B/stacks/00-bootstrap" && terraform plan -var-file=sandbox.tfvars -lock-timeout=0 )
```

B is refused, and the refusal is an S3 conditional write — `PreconditionFailed`
is what S3-native locking looks like; there is no DynamoDB anywhere in it:

```
Error: Error acquiring the state lock
Error message: operation error S3: PutObject, https response error
StatusCode: 412 ... api error PreconditionFailed: At least one of the
pre-conditions you specified did not hold
Lock Info:
  ID:        4ca7e90e-0866-77f7-522a-2882c03a35ec
  Path:      proso-tfstate-699475944323/00-bootstrap/terraform.tfstate
  Operation: OperationTypePlan
  Who:       notroot@desktop
  Version:   1.15.8
B_EXIT=1
```

A finished normally (`No changes`, exit 0). The lock object was observed while
held, and is gone once released:

```console
$ # while A holds it
OBSERVED lock object: 00-bootstrap/terraform.tfstate.tflock
{ "SSE": "aws:kms", "Len": 240 }

$ # after release
[ "00-bootstrap/terraform.tfstate" ]

$ aws dynamodb list-tables --region us-east-1
{ "TableNames": [] }
```

If a crashed apply leaves a lock behind, `terraform force-unlock <id>`. Nothing
expires `.tflock` automatically; see the note in
[`modules/tfstate-backend/main.tf`](../../modules/tfstate-backend/main.tf) for
why a lifecycle rule cannot do it safely.

## Local verification (no credentials needed)

Every gate below runs offline, because the tests use `mock_provider`.

```bash
terraform fmt -recursive -check
terraform init -backend=false && terraform validate
terraform test                       # here, and in each module directory
trivy config --exit-code 1 --severity LOW,MEDIUM,HIGH,CRITICAL \
      --tf-vars example.tfvars .
checkov -d ../.. --framework terraform --var-file example.tfvars
```

## Variables

| Variable | Default | Notes |
|---|---|---|
| `account_id` | *(required)* | Also becomes the provider's `allowed_account_ids`, so a stale profile aborts before creating anything |
| `environment` | *(required)* | `sandbox` or `prod`; drives the `Environment` tag the SCP requires |
| `region` | `us-east-1` | CloudFront needs its ACM certs here |
| `bootstrap_assume_role_arn` | `null` | `OrganizationAccountAccessRole` during phase 1, when the deploy role does not exist yet |
| `deploy_role_trusted_permission_set_names` | `[]` | Preferred access path — Identity Center, no static keys |
| `deploy_role_trusted_principal_arns` | `[]` | Only for a non-Identity-Center principal, e.g. a future OIDC CI role |
| `deploy_role_require_mfa` | `true` | Applies to the exact-ARN statement only — see `modules/deploy-role/README.md` |
| `managed_bucket_prefixes` | `["proso-site-"]` | Widen only with evidence of a failing plan |
