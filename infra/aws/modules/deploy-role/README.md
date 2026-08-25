# `deploy-role`

The role that runs `terraform plan` and `terraform apply`. Deliberately **not**
`AdministratorAccess` (ADR-001 §2.5): it gets the state backend plus what the
site stack needs, and is widened only when a real plan is shown to fail.

## Access model — Identity Center, not IAM users

Per the ADR-001 §3 correction, no IAM user is created for access. IAM Identity
Center is enabled (`ssoins-7223fcff316331ec`), so humans get **permission sets**
assigned per account: short-lived credentials, nothing static to leak or rotate.
This is also the exit from the root-key problem — root is still in use only
because no non-root path was ever wired.

Identity Center provisions a permission set as a role whose ARN is not knowable
at plan time:

```
arn:aws:iam::<account>:role/aws-reserved/sso.amazonaws.com/[<region>/]AWSReservedSSO_<name>_<hash>
```

so the trust statement names the **account** as `Principal` and narrows it with
an `ArnLike` condition on `aws:PrincipalArn`. The two are inseparable: without
the condition that statement trusts every principal in the account. A test
asserts an account-root `Principal` is never present without one, and plant 6
confirms it goes red when the condition is removed.

`trusted_principal_arns` remains for a principal that is *not* an Identity
Center identity — a role federated from a Forgejo OIDC provider, which the
Account Foundation tab is researching. It rejects `:root` ARNs outright.

## MFA

`require_mfa` applies **only** to the exact-ARN statement, and uses
`BoolIfExists`, which the IAM reference recommends over plain `Bool` because the
key is absent for long-term credentials.

It is deliberately **not** applied to the Identity Center statement. Per the IAM
global condition key reference, MFA for Identity Center identities is enforced by
"attributes for access control ... a SAML assertion claim with the authentication
method", not by `aws:MultiFactorAuthPresent`. Adding the condition there would
reject every SSO session rather than harden it. MFA for that path is configured
inside Identity Center, which the Account Foundation tab owns.

## Permissions

**Explicit `Deny` (beats every `Allow`, IAM evaluates deny first):**

| Denied | Scope | Why |
|---|---|---|
| `iam:*` | `*` | A role that can write IAM can grant itself anything |
| `organizations:*` | `*` | Could move accounts or detach the SCPs bounding it |
| `s3:DeleteBucket` | `*` | ADR-001 §4.6 — a bucket-replacing plan is a human decision |
| `kms:ScheduleKeyDeletion`, `kms:DisableKey` | state CMK | Would render all state unreadable |

Encoding §4.6 in IAM rather than in a runbook means an agent that ignores the
runbook is still stopped by the API.

**Allowed:** state bucket and objects; the state CMK; `Get*`/`List*` plus an
enumerated write set on `proso-site-*` buckets; `cloudfront:*`; a fixed ACM
list; `budgets:*` on this account's budgets; read-only CloudWatch.

Site-bucket actions are enumerated rather than `s3:*` because `s3:*` includes
`PutBucketPublicAccessBlock` and `PutBucketAcl` — the deploy role could make the
site bucket public. Trivy `AWS-0345` flags exactly this, and it was a real
finding on the first draft, not a false positive. Deliberately absent:
`s3:DeleteBucket`, `s3:PutBucketAcl`, `s3:PutAccountPublicAccessBlock`, and
`s3:PutBucketWebsite` — ADR-001 §3 serves the site through CloudFront with OAC
and explicitly *not* through a website endpoint, so the role should be unable to
create one.

### Known constraint: `iam:*` is denied outright

The brief requires it, so it is implemented as written. Be aware that some
first-time service enablement needs `iam:CreateServiceLinkedRole`, and a `Deny`
wins unconditionally. If a later plan fails on exactly that, the fix is a
narrow carve-out for the specific `iam:AWSServiceName` — with the failing plan
output as the evidence — not deleting the deny.

`cloudfront:*` will also be denied the moment `SandboxRestrictions` is attached
to the account: that SCP's `DenyPaidServices` statement lists `cloudfront:*`.
The SCP is currently attached to nothing, so it does not bite yet.

## Inputs

| Variable | Default | Notes |
|---|---|---|
| `role_name` | `proso-deploy` | |
| `trusted_permission_set_names` | `[]` | Preferred. Names, not ARNs |
| `trusted_principal_arns` | `[]` | Non-Identity-Center principals only; `:root` rejected |
| `require_mfa` | `true` | Exact-ARN statement only |
| `max_session_duration` | `3600` | AWS minimum, enough for a plan/apply |
| `state_bucket_arn` | *(required)* | |
| `state_kms_key_arn` | *(required)* | |
| `managed_bucket_prefixes` | `["proso-"]` | The stack narrows this to `proso-site-` |
| `account_id` | *(required)* | |

At least one of `trusted_permission_set_names` / `trusted_principal_arns` must
be non-empty — a role nobody can assume is not a deploy path.

## Tests

Policies are built with `jsonencode()` in `locals`, not with
`aws_iam_policy_document`. A data source is mocked away under `terraform test`,
so asserting on it would prove nothing; a local can be asserted directly.

```console
$ terraform test
Success! 9 passed, 0 failed.
```
