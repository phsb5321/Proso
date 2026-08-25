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

## Blocked on an Identity Center principal

**This stack has not been applied.** It is complete, validated, scanned and
tested, but there is no credential that may legitimately run the apply.

Measured 25/08/2026:

```console
$ aws sts get-caller-identity --profile PERSONAL_ROOT
{ "Arn": "arn:aws:iam::851725512267:root" }          # literal root

$ aws iam list-roles --profile PERSONAL_ROOT \
    | jq -r '.Roles[] | select(.Path|startswith("/aws-service-role/")|not) | .RoleName'
                                                      # (empty — no roles at all)

$ aws sso-admin list-permission-sets \
    --instance-arn arn:aws:sso:::instance/ssoins-7223fcff316331ec | jq -c .PermissionSets
[]
$ aws identitystore list-users --identity-store-id d-9067ca0796 | jq -c .Users
[]
```

Identity Center is **enabled but empty**: no permission set, no identity-store
user, no assignment. The only credential on this host that can reach
Sandbox-Account is `PERSONAL_ROOT`, and ADR-001 §4.3 reserves root for exactly
one operation, which is not this one.

Populating Identity Center is the **Account Foundation tab**'s work and needs
Pedro (an identity for a real person, and MFA enrolment). The unblocking
sequence, run once from the management account:

```bash
INST=arn:aws:sso:::instance/ssoins-7223fcff316331ec

# 1. an identity for Pedro, 2. a permission set, 3. assign it to Sandbox
aws identitystore create-user --identity-store-id d-9067ca0796 ...
aws sso-admin create-permission-set --instance-arn "$INST" \
    --name ProsoInfraDeploy --session-duration PT1H
aws sso-admin create-account-assignment --instance-arn "$INST" \
    --target-id 699475944323 --target-type AWS_ACCOUNT \
    --permission-set-arn <arn> --principal-type USER --principal-id <id>
```

Then, on this host, no static key is ever written to disk:

```bash
aws configure sso --profile sandbox   # start URL from the Identity Center console
aws sso login --profile sandbox
aws sts get-caller-identity --profile sandbox   # expect .../AWSReservedSSO_ProsoInfraDeploy_*
```

Set `deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]` (already
the value in `example.tfvars`) so the deploy role trusts that permission set.

### Also worth knowing before the first apply

Guardrail ADR-001 §4.2 — *"a budget alarm is the FIRST apply in any account"* —
means `stacks/10-account-baseline` must land in Sandbox-Account **before** this
stack. That stack belongs to the Account Foundation tab. Nothing here depends on
it technically; the ordering is the guardrail, not a `depends_on`.

---

## First apply: the chicken-and-egg

This stack creates the bucket that this stack's state will live in, so the first
run cannot use the backend it is about to build. `backend.tf` must be absent for
exactly one apply, then restored and migrated into.

```bash
cd stacks/00-bootstrap
cp example.tfvars sandbox.tfvars      # sandbox.tfvars is gitignored
export AWS_PROFILE=sandbox            # Identity Center session, not root

# --- phase 1: local state -------------------------------------------------
mv backend.tf backend.tf.bootstrap-off
terraform init                        # no backend block -> local state
terraform plan  -var-file=sandbox.tfvars
terraform apply -var-file=sandbox.tfvars

# --- phase 2: migrate state into the bucket it just created ---------------
mv backend.tf.bootstrap-off backend.tf
terraform init -backend-config=sandbox.s3.tfbackend -migrate-state
#   Terraform asks: "Do you want to copy existing state to the new backend?"
#   -> yes

# --- phase 3: verify, then remove the local copy --------------------------
terraform plan -var-file=sandbox.tfvars     # expect "No changes"
aws s3 ls "s3://proso-tfstate-699475944323/00-bootstrap/"
rm terraform.tfstate terraform.tfstate.backup
```

Every **later** stack and every fresh clone skips phase 1 entirely — the bucket
already exists, so `terraform init -backend-config=<env>.s3.tfbackend` is all
that is needed.

> `kms_key_id` in `sandbox.s3.tfbackend` is not optional. With `encrypt = true`
> alone the backend sends `x-amz-server-side-encryption: AES256`, which the
> bucket's `DenyUnencryptedWrites` policy rejects — the apply would fail with
> `AccessDenied` on the first state write.

## Proving the lock (definition of done)

Two concurrent plans; the second must block rather than proceed.

```bash
# terminal A — hold the lock
terraform plan -var-file=sandbox.tfvars -lock-timeout=0 &

# terminal B — immediately
terraform plan -var-file=sandbox.tfvars -lock-timeout=0
# expect: Error acquiring the state lock ... ConditionalCheckFailed
#         Lock Info: Path: proso-tfstate-699475944323/00-bootstrap/terraform.tfstate.tflock
```

Then confirm the lock object is really an S3 object and that no DynamoDB table
was ever involved:

```bash
aws s3api list-objects-v2 --bucket proso-tfstate-699475944323 \
    --prefix 00-bootstrap/ --query 'Contents[].Key'
aws dynamodb list-tables --region us-east-1     # expect []
```

**Status: not yet run** — blocked on the credential above.

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
