# `stacks/20-site` — status, 25/08/2026

Built and gated offline. **Not applied**: there is no credential into
`Sandbox-Account` that is not the management-account root, and ADR-001 §4.3
reserves root for one operation that belongs to another tab.

## Blocked: no non-root path into Sandbox-Account 699475944323

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

There is a root-free path, which is the point worth carrying to the Account
Foundation tab:

```console
$ aws iam get-login-profile --user-name admin-user --profile PERSONAL_ROOT
{ "LoginProfile": { "UserName": "admin-user",
    "CreateDate": "2025-03-26T23:00:09+00:00", "PasswordResetRequired": false } }

$ aws iam list-mfa-devices --user-name admin-user --profile PERSONAL_ROOT
arn:aws:iam::851725512267:u2f/user/admin-user/Bitwarden-MZFYVDMZZFF2HFLFCICKKP2MNI

$ aws organizations describe-account --account-id 699475944323 --profile PERSONAL_ROOT
Id 699475944323 | JoinedMethod CREATED | 2024-12-27 | ACTIVE
```

`admin-user` has `AdministratorAccess`, a console password (vault entry
`us-east-2.signin.aws.amazon.com`, user `admin-user`) and a Bitwarden-backed U2F
device. `JoinedMethod = CREATED` means Organizations auto-created
`OrganizationAccountAccessRole` in the sandbox when the account was made, so a
management-account principal with `sts:AssumeRole` reaches it.

So the sandbox can be opened **without touching root at all**: sign in to the
console as `admin-user`, create the scoped `pedro-ops` principal that brief 04
already calls for, and assume the org role from it.

Not done here for three reasons: it needs a WebAuthn console login (hardware
MFA, Pedro-gated); creating IAM principals is `stacks/00-bootstrap` and brief 04
scope, not the site stack's; and ADR-001 §4.2 requires the budget alarm to be
the first apply in the account regardless.

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
distribution, and the real `Content-Type` on the wire.

## Done and evidenced

| Gate | Command | Result |
|---|---|---|
| Format | `terraform fmt -recursive -check` | clean |
| Validate | `terraform validate` (module + stack) | Success |
| Unit tests | `terraform test` | 8 passed, 0 failed |
| Falsification | `./tests/falsify.sh` | 8/8 red on plant, green after revert |
| Checkov | `checkov -d . --framework terraform --skip-download` | 63 passed, 0 failed, 13 skipped |
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

1. **[pending] Pedro** — console-login as `admin-user` (not root) and create the
   scoped deploy principal, or hand brief 04 the go to do it.
2. Budget alarm applied in Sandbox (`stacks/10-account-baseline`) — ADR-001 §4.2,
   before this stack or any other.
3. `terraform apply` here in Sandbox, phase 1, then verify on the
   `*.cloudfront.net` domain per `stacks/20-site/README.md`.
4. Correct `updates.json` in the Proso repo, then phase 2.
5. **[pending] Pedro** — the DNS cutover at Cloudflare. Explicitly not this tab's.
