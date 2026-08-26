# stacks/05-org-structure

OU layout, SCP attachment, and IAM Identity Center access. This is the stack
that ends routine use of the root user.

**APPLIED 25/08/2026.** It runs in management account `851725512267`.
The apply created 13 resources, changed 0, destroyed 0, and included no SCP or
account resource. State is in management-account bucket
`proso-management-tfstate-851725512267` at
`05-org-structure/terraform.tfstate`, CMK-encrypted and S3-native locked.

## Why Identity Center rather than IAM users

ADR-001 §3 (correction): Identity Center is already enabled
(`ssoins-7223fcff316331ec`, identity store `d-9067ca0796`) and has zero users
and had zero users and permission sets before this stack was applied — it was
switched on 23/03/2025 and left unconfigured until 25/08/2026.
Permission sets issue short-lived credentials per account, so there is no static
key to leak, rotate, or find in a backup.

The measured reason this matters:

```
$ AWS_PROFILE=PERSONAL_ROOT aws sts assume-role \
    --role-arn arn:aws:iam::699475944323:role/OrganizationAccountAccessRole ...
An error occurred (AccessDenied): Roles may not be assumed by root accounts.
```

Root cannot reach the sandbox at all. Identity Center can.

## What it creates

| Resource | Note |
|---|---|
| `Workloads` OU | Sibling of the existing `Sandboxes` OU, not a parallel structure |
| `PlatformAdmins` group | The assignment principal — membership changes need no Terraform run |
| Identity Center user | Sends a one-time password email; **the human gate** |
| `ProsoInfraDeploy` permission set | Routine plan/apply in the workload account, `PT4H` |
| `WorkloadBreakGlass` permission set | `AdministratorAccess` in the workload account, `PT2H` |
| `ManagementOps` permission set | Inline least-privilege, management account, `PT4H` |
| `SandboxGuardrails` SCP + attachment | Off by default — see the prerequisite below |

The workload account is **Sandbox-Account 699475944323** (ADR-001 §3, operator
decision 25/08/2026). The account is still *named* `Sandbox-Account` in AWS;
that is a naming artifact of a deliberately reversible decision, not a mistake.

### The three permission sets, and why the split

**`ProsoInfraDeploy`** is the routine path and holds no admin — ADR-001 §2.5.
It grants exactly two things:

1. `sts:AssumeRole` on `proso-deploy`, the least-privilege boundary that
   `stacks/00-bootstrap` owns. The same role is the target for a future OIDC CI
   principal, so there is one policy to audit rather than two.
2. Direct access to the state bucket and its CMK. This is not redundancy:
   Terraform's S3 backend authenticates with the **ambient session**, not with
   the provider's assumed role, and `sandbox.s3.tfbackend` carries no
   `role_arn`. Without it, `terraform init` fails before the deploy role is ever
   reached. The KMS grant is `Resource: "*"` bounded by `kms:ViaService` and
   `kms:ResourceAliases`, because the key ARN does not exist until
   `stacks/00-bootstrap` has been applied.

> **The name is a cross-stack contract.** `stacks/00-bootstrap` sets
> `deploy_role_trusted_permission_set_names = ["ProsoInfraDeploy"]`, and
> `modules/deploy-role` builds its trust from
> `*AWSReservedSSO_${name}_*`. Renaming the permission set here without
> renaming it there silently revokes access to the deploy role — no error, just
> an `AccessDenied` later. `tests/org_structure.tftest.hcl` asserts the literal
> so the break is loud; it is falsified by planting the rename.

**`WorkloadBreakGlass`** exists for one concrete reason: the first
`stacks/00-bootstrap` apply *creates* the state bucket and the deploy role, so
until it has run `ProsoInfraDeploy` grants nothing usable. After that it is for
incidents. Its session is `PT2H` against `ProsoInfraDeploy`'s `PT4H` — privilege
sets session length, not convenience.

**`ManagementOps`** can audit backup posture (bucket versioning, Object Lock
configuration, public-access block) but is explicitly denied `s3:GetObject*`,
every `s3:Put*`/`Delete*`, and `s3:BypassGovernanceRetention`. It can prove the
backups are safe; it cannot read or destroy one. It deliberately cannot reach
the workload account at all — that is what the other two are for.

## The SCP this stack attaches is a replacement, not the existing one

`SandboxRestrictions` (`p-ufly0ag5`) is inert today and must stay that way: it
has two defects that would break the organisation the moment SCPs are switched
on, both found by the site tab (`docs/20-site-status.md`).

| Defect | Consequence | Fix |
|---|---|---|
| Denies `cloudfront:*` as a "paid service" | The site stack — the workload this org exists for — could not be applied at any privilege level, since an SCP denies admins too. CloudFront's 1 TB / 10M-request free tier is indefinite and the payload is 1.06 MB. | Removed from the deny list |
| Denies any create call with no `Environment` tag, via `NotAction` + `Null: aws:RequestTag/Environment` | Unsatisfiable, not merely strict: `aws:RequestTag` exists only on operations that accept tags at creation. `s3:CreateBucket` does not (the provider calls `PutBucketTagging` afterwards), and sub-resources such as bucket policies and public-access blocks take no tags at all. As written it forbids Terraform. | Dropped. Tag hygiene belongs in an Organizations **tag policy**; spend is caught by the budget alarm. |

`policies/sandbox-guardrails.json` keeps the useful half — denying genuinely
expensive services, which also enforces two ADR-001 decisions in IAM rather than
in prose (`route53:*` denied because DNS stays at Cloudflare; `dynamodb:CreateTable`
denied because state locking is S3-native) — and adds a rule the old policy
lacked: nothing in the sandbox may stop CloudTrail or delete the budget.

Once the replacement is attached, the old one can go:
`aws organizations delete-policy --policy-id p-ufly0ag5`.

## Prerequisite before `attach_service_control_policies = true`

Measured 25/08/2026: the org root reports `PolicyTypes: []`, so
`SERVICE_CONTROL_POLICY` is not enabled. No SCP can be **created or** attached
until:

```bash
aws organizations enable-policy-type --root-id r-y7xb --policy-type SERVICE_CONTROL_POLICY
# reverse: aws organizations disable-policy-type --root-id r-y7xb --policy-type SERVICE_CONTROL_POLICY
```

Deliberately CLI, not Terraform: the only resource that owns this is
`aws_organizations_organization`, and importing it would hand this stack
authority over the organisation's feature set for the sake of a one-time toggle.

The account move is deliberately not modelled: importing the account into
Terraform would give this stack authority to close it, a 90-day operation.
`Sandbox-Account` was moved from root `r-y7xb` into `Sandboxes`
`ou-y7xb-qkp97z4j` on 25/08/2026 while `PolicyTypes` was still empty, so the
move changed no effective permission. Reverse if needed:

```bash
aws --profile PERSONAL_ROOT organizations move-account \
  --account-id 699475944323 \
  --source-parent-id ou-y7xb-qkp97z4j --destination-parent-id r-y7xb
```

## State and current plan

```bash
cp example.tfvars management.tfvars   # gitignored; set operator_email/profile
AWS_PROFILE=PERSONAL_ROOT terraform init -reconfigure \
  -backend-config=management.s3.tfbackend
AWS_PROFILE=PERSONAL_ROOT terraform plan \
  -var-file=management.tfvars -detailed-exitcode
# No changes. Your infrastructure matches the configuration.
```

The first apply used local state. A temporary copy in the workload backend was
rejected during review because workload identities could rewrite state that
`PERSONAL_ROOT` later applies. Stack 05 now owns a separate management-account
backend; the active state was migrated there byte-for-byte (resource payload).
The retired workload prefix is denied in both workload identities and sealed by
the workload bucket policy.

## Activation and SSO proof

Creating the Identity Center user makes AWS email a one-time password link to
`operator_email`. **Pedro must open that link, set a password, and register an
MFA device.** This cannot be automated: no API sets an Identity Center password,
and `aws sso login` is a browser device-authorisation flow. Everything else in
the root-key exit is blocked until it is done.

The access portal is `https://d-9067ca0796.awsapps.com/start/`. Profiles
`proso-sso` (`ProsoInfraDeploy`, workload account) and `management-ops`
(`ManagementOps`, management account) can be configured before activation; they
contain no secret.

From the Proso root, inside `nix-shell`:

```bash
infra/aws/scripts/prove-sso-path.sh --check  # ready before activation
infra/aws/scripts/prove-sso-path.sh          # browser login + MFA, then proof
```

The full proof verifies both AWSReservedSSO identities, assumes the scoped
`proso-deploy` workload role, and requires no-change plans for stacks 00, 10,
and 20. It then proves ManagementOps can read organization/IAM/backup posture.
Any 403, wrong account/role, missing backend, or Terraform drift fails closed.

Once it passes, the Identity Center path is proven. SCP enablement and root-key
retirement remain separately gated operator security decisions.
