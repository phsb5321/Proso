# `stacks/20-site` — status, 25/08/2026

Built and gated offline. **Not applied**: there is no credential into
`Sandbox-Account` that is not the management-account root, and ADR-001 §4.3
reserves root for one operation that belongs to another tab.

## Blocked: no non-root path into Sandbox-Account 699475944323

> **CLEARED 25/08/2026 by the Account Foundation tab (`58a6e4d`).** A `sandbox`
> profile now exists in `~/.aws/config`. It chains through an interim IAM user
> `pedro-ops` in the management account and assumes
> `OrganizationAccountAccessRole` in 699475944323 — use `--profile sandbox`, or
> `aws_profile = "sandbox"` in a tfvars file.
>
> ```console
> $ aws --profile sandbox sts get-caller-identity
> { "Account": "699475944323", "Arn":
>   "arn:aws:sts::699475944323:assumed-role/OrganizationAccountAccessRole/botocore-session-1787667530" }
> ```
>
> `stacks/10-account-baseline` has since been applied through it, budget alarm
> first per ADR-001 §4.2. `pedro-ops` is a static key and therefore interim: the
> permanent path is the Identity Center permission sets in
> `stacks/05-org-structure`, and `pedro-ops` is deleted at step 3 of
> `docs/root-key-retirement-plan.md`. Everything below is unchanged — it is the
> evidence that produced the fix.

This blocks `stacks/00-bootstrap` and `stacks/10-account-baseline` too — nothing
can be applied in the sandbox until it is cleared.

Root cannot assume a role. Measured, not assumed:

```console
$ aws sts get-caller-identity --profile PERSONAL_ROOT
{ "UserId": "851725512267", "Account": "851725512267",
  "Arn": "arn:aws:iam::851725512267:root" }

$ aws sts assume-role --profile PERSONAL_ROOT \
    --role-arn arn:aws:iam::699475944323:role/OrganizationAccountAccessRole \
    --role-session-name site-tab-probe
aws: [ERROR]: An error occurred (AccessDenied) when calling the AssumeRole
operation: Roles may not be assumed by root accounts.
```

And no other principal has an API key:

```console
$ aws iam list-users --profile PERSONAL_ROOT --query 'Users[].UserName'
admin  admin-user  dokku-backup-user  exec-job-aggregator-ses
proxmox-backup  restic-objectlock-v1  ses-smtp-alertmanager

$ aws iam list-access-keys --user-name admin-user --profile PERSONAL_ROOT
(empty)
$ aws iam list-attached-user-policies --user-name admin-user --profile PERSONAL_ROOT
arn:aws:iam::aws:policy/AdministratorAccess
```

`~/.aws/credentials` holds `PERSONAL_ROOT` (root) plus three DeliCasa profiles
for an unrelated account. Nothing reaches 699475944323.

### The unblock, and why it is not mine

Identity Center is enabled and **empty**, which is the same conclusion
`stacks/00-bootstrap` reached independently:

```console
$ aws sso-admin list-instances --profile PERSONAL_ROOT
ssoins-7223fcff316331ec | d-9067ca0796 | ACTIVE | created 2025-03-23

$ aws sso-admin list-permission-sets \
    --instance-arn arn:aws:sso:::instance/ssoins-7223fcff316331ec
(empty)
$ aws identitystore list-users --identity-store-id d-9067ca0796
(empty)
```

Per the ADR correction of 25/08/2026, the answer is a **permission set**, not an
IAM user: an identity for Pedro, a `ProsoInfraDeploy` permission set, and an
assignment onto 699475944323. `modules/deploy-role` already trusts exactly that
principal pattern. That work is brief 04's and needs Pedro (a real person's
identity, MFA enrolment).

There is also a console-only fallback, worth recording but **not** recommended
now that the ADR says not to create IAM users for access:

```console
$ aws iam get-login-profile --user-name admin-user --profile PERSONAL_ROOT
{ "UserName": "admin-user", "CreateDate": "2025-03-26T23:00:09+00:00" }
$ aws iam list-mfa-devices --user-name admin-user --profile PERSONAL_ROOT
arn:aws:iam::851725512267:u2f/user/admin-user/Bitwarden-MZFYVDMZZFF2HFLFCICKKP2MNI
$ aws organizations describe-account --account-id 699475944323 --profile PERSONAL_ROOT
Id 699475944323 | JoinedMethod CREATED | 2024-12-27 | ACTIVE
```

`admin-user` holds `AdministratorAccess`, a console password (vault entry
`us-east-2.signin.aws.amazon.com`) and a Bitwarden U2F device, and
`JoinedMethod = CREATED` means `OrganizationAccountAccessRole` already exists in
the sandbox. So Identity Center can be populated from that console session
without root ever being used — which is also the honest exit from next-slice #26.

## Second blocker: the sandbox SCP forbids this stack outright

> **FIXED 25/08/2026 by the Account Foundation tab.** Both findings below were
> correct and both are addressed in `stacks/05-org-structure`, which now authors
> a replacement SCP, `SandboxGuardrails` (`policies/sandbox-guardrails.json`),
> instead of attaching `SandboxRestrictions`:
>
> 1. **`cloudfront:*` is no longer denied.** The free tier is indefinite and the
>    payload is 1.06 MB, so the deny was aimed at the wrong risk.
> 2. **The untagged-resource rule is gone entirely**, not narrowed. Your
>    diagnosis understates it: `aws:RequestTag` only exists on operations that
>    accept tags at creation, and `s3:CreateBucket` is not one of them — the
>    provider issues `PutBucketTagging` afterwards — so even a fully tagged
>    bucket would have been denied. Tag hygiene belongs in an Organizations tag
>    policy; spend is caught by the budget alarm, which is already applied.
>
> `SandboxGuardrails` keeps the useful half (deny genuinely expensive services,
> which also enforces ADR-001's "DNS stays at Cloudflare" and "no DynamoDB lock
> table" decisions) and adds one the old policy lacked: nothing in the sandbox
> may stop CloudTrail or delete the budget.
>
> Still gated, and it is why this is not yet live: the org root reports
> `PolicyTypes: []`, so SCPs are not enabled at all and no policy can be created
> or attached until
> `aws organizations enable-policy-type --root-id r-y7xb --policy-type SERVICE_CONTROL_POLICY`
> is run. `SandboxRestrictions` (p-ufly0ag5) can be deleted once the replacement
> is attached.

Independent of credentials. `SandboxRestrictions` denies `cloudfront:*`:

```console
$ aws organizations describe-policy --policy-id p-ufly0ag5 --query 'Policy.Content'
{ "Sid": "DenyPaidServices", "Effect": "Deny", "Action": [ "rds:*",
  "ec2:RunInstances", ..., "route53:*", "cloudfront:*", "apigateway:*", ... ] }
{ "Sid": "DenyUntaggedResources", "Effect": "Deny",
  "NotAction": ["iam:*","organizations:*","budgets:*","cloudwatch:Get*", ...],
  "Condition": { "Null": { "aws:RequestTag/Environment": true } } }
```

A CloudFront distribution is the entire point of this stack, so under that SCP
the stack cannot be applied in Sandbox-Account at any privilege level — an SCP
denies admins too.

It does not bite **today**, because the policy is attached to nothing and the
account is not in the OU it was written for:

```console
$ aws organizations list-targets-for-policy --policy-id p-ufly0ag5
(empty)
$ aws organizations list-parents --child-id 699475944323
PARENTS  r-y7xb  ROOT                       # not in ou-y7xb-qkp97z4j
$ aws organizations list-accounts-for-parent --parent-id ou-y7xb-qkp97z4j
(empty)
```

So it is a scheduled break, not a live one. Two things follow, both for the
Account Foundation tab:

1. `DenyPaidServices` needs a CloudFront carve-out, or the site stack is verified
   somewhere other than the sandbox. CloudFront's free tier is indefinite, so it
   is not a paid service at this size — the deny is aimed at the wrong risk.
2. `DenyUntaggedResources` denies *any* create call whose request carries no
   `Environment` tag, and roughly half of an S3 + CloudFront stack is
   sub-resources that take no tags at all (`aws_s3_bucket_public_access_block`,
   `aws_s3_bucket_policy`, `aws_cloudfront_origin_access_control`,
   `aws_s3_bucket_versioning`, ...). No amount of tagging satisfies it. As
   written it forbids Terraform, not untagged resources.

What this stack does about it: the provider `default_tags` now carry
`Environment`, so every taggable resource satisfies the condition. That is
necessary, not sufficient.

## Fixed in passing: the deploy role could not have applied this stack

`modules/deploy-role` (landed by `stacks/00-bootstrap`) was missing
`s3:PutObjectTagging` — the site module tags `updates.json` and
`releases/*.xpi`, and a tagged `PutObject` is authorised as both actions — and
the whole CloudWatch Logs delivery API set that CloudFront standard logging v2
needs. The apply would have failed partway through. Both are added, ARN-scoped,
with a `covers_what_the_site_stack_applies` run so the gap cannot come back.

The log-delivery ARN scoping is unverified against a live apply, for the same
reason everything else here is: no credential reaches the account.

### What that leaves unverified

Everything below the plan boundary. The configuration itself is complete — with
credentials removed, the plan fails on credentials and nothing else:

```console
$ terraform plan -var site_source_dir=…/site      # backend stripped, no creds
Error: No valid credential sources found
  with provider["registry.terraform.io/hashicorp/aws"]
```

Unverified until an apply happens: that CloudFront standard logging v2 attaches
cleanly to a `BucketOwnerEnforced` bucket, that the OAC bucket policy admits the
distribution, that the deploy role's log-delivery ARN scoping is accepted, and
the real `Content-Type` on the wire.

## Done and evidenced

| Gate | Command | Result |
|---|---|---|
| Format | `terraform fmt -recursive -check` | clean |
| Validate | `terraform validate` (module + stack) | Success |
| Unit tests | `terraform test` | 8 passed, 0 failed (27 across the repo) |
| Falsification | `./tests/falsify.sh` | 8/8 red on plant, green after revert |
| Checkov | `checkov -d . --framework terraform --skip-download` | 109 passed, 0 failed, 17 skipped (repo-wide) |
| Trivy | `trivy config --exit-code 1 --misconfig-scanners terraform .` | 0 misconfigurations |
| TFLint | `tflint --recursive --minimum-failure-severity=warning` | 0 issues |
| ShellCheck / shfmt | `scripts/deploy-site.sh`, `tests/falsify.sh` | clean |
| Assemble | `./scripts/deploy-site.sh assemble` | 27 files, 1.2 MB — matches ADR-001 §1 |

Every policy exception is stated inline at the resource it applies to and
tabulated in `modules/static-site/README.md`.

## Content defects found, owned by the Proso repo

Not fixed here — the brief says do not re-author the copy — but they will bite
at cutover:

1. `updates.json` on `gh-pages` still advertises `https://phsb5321.github.io/Proso/releases/…`
   for both add-ons. Published as-is behind `proso.com.br`, installed extensions
   keep updating from GitHub Pages, and the migration achieves nothing. The
   module refuses to plan this once `attach_custom_domain = true`, which is the
   intended forcing function rather than a surprise at 3am.
2. `updates.json` advertises 1.1.3 and 1.2.1; the shipped extension is 1.2.9.
3. `index.html` sets `canonical` and `og:url` to `https://phsb5321.github.io/Proso/`
   while `sitemap.xml` and `robots.txt` already say `https://proso.com.br/`.
4. `packages/site/package.json` is published as a site asset. Harmless, but it
   is build metadata on a public page.

## Next actions

1. **[pending] Pedro** — populate Identity Center (user + `ProsoInfraDeploy`
   permission set + assignment onto 699475944323), or hand brief 04 the go. The
   console session for it is `admin-user`, not root.
2. **[pending] brief 04** — decide `SandboxRestrictions` before it is attached:
   CloudFront carve-out, and a `DenyUntaggedResources` rule that does not deny
   every untaggable sub-resource.
3. Budget alarm applied in Sandbox (`stacks/10-account-baseline`) — ADR-001 §4.2,
   before this stack or any other.
4. `terraform apply` here in Sandbox, phase 1, then verify on the
   `*.cloudfront.net` domain per `stacks/20-site/README.md`.
5. Correct `updates.json` in the Proso repo, then phase 2.
6. **[pending] Pedro** — the DNS cutover at Cloudflare. Explicitly not this tab's.
