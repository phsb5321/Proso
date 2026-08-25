# stacks/05-org-structure

OU layout, SCP attachment, and IAM Identity Center access. This is the stack
that ends routine use of the root user.

**PLAN-ONLY.** It runs in the management account (851725512267), where root and
the backup buckets live. Planned clean on 25/08/2026; not applied.

## Why Identity Center rather than IAM users

ADR-001 §3 (correction): Identity Center is already enabled
(`ssoins-7223fcff316331ec`, identity store `d-9067ca0796`) and has zero users
and zero permission sets — switched on 2025-03-23 and never configured.
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
| `SandboxAdmin` permission set | `AdministratorAccess`, sandbox only, `PT8H` |
| `ManagementOps` permission set | Inline least-privilege, management account, `PT4H` |
| `SandboxGuardrails` SCP + attachment | Off by default — see the prerequisite below |

`ManagementOps` can audit backup posture (bucket versioning, Object Lock
configuration, public-access block) but is explicitly denied `s3:GetObject*`,
every `s3:Put*`/`Delete*`, and `s3:BypassGovernanceRetention`. It can prove the
backups are safe; it cannot read or destroy one.

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

Also not modelled, for the same reason: `Sandbox-Account` currently sits at the
org root (`Paths: o-qtcsgow9oy/r-y7xb/699475944323/`), not inside the
`Sandboxes` OU, so no OU-level SCP would reach it even once enabled. Moving it
is one reversible call:

```bash
aws organizations move-account --account-id 699475944323 \
  --source-parent-id r-y7xb --destination-parent-id ou-y7xb-qkp97z4j
```

Importing the account into Terraform instead would give a stack the ability to
close it — a 90-day operation. Not worth it.

## Plan

```bash
cp example.tfvars management.tfvars   # gitignored; set operator_email
terraform init
terraform plan -var-file=management.tfvars
# Plan: 10 to add, 0 to change, 0 to destroy.
```

## After it is applied

The Identity Center user must accept the emailed one-time password and register
MFA. Nothing automates that. Then:

```bash
aws configure sso --profile pedro-sso
aws sso login --profile pedro-sso
aws --profile pedro-sso sts get-caller-identity
```

Once that works, `docs/root-key-retirement-plan.md` steps 3–6 become actionable.
