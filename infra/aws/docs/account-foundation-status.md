# Account foundation status

**Updated:** 25/08/2026 17:45 BRT
**Binding design:** [ADR-001](ADR-001-aws-foundation.md)

This is the operational handoff for stacks 05/10, Identity Center, and the
policy/CI surface. It distinguishes live AWS state from Terraform that is only
planned.

## Done and live

### `stacks/10-account-baseline`

- Sandbox budget `sandbox-monthly-cost`: **USD 5/month**.
- Multi-region KMS-encrypted CloudTrail `sandbox-trail`: logging, with no latest
  delivery error.
- Account password policy: 16 characters, all four character classes, reuse
  prevention 24, no forced expiry.
- State migrated from the ignored local file to the private, versioned,
  KMS-encrypted bootstrap bucket at
  `10-account-baseline/terraform.tfstate`, with S3-native locking.
- A post-migration plan returned detailed exit code **0**: `No changes`.

### Scoped deploy policy

PR #211 merged the read-only refresh surface required by stacks 00 and 10 and
made Checkov parser failures fail closed. The exact live plan was **0 add, 1
in-place IAM policy update, 0 destroy**; that plan was applied through the
non-root transitional route.

After the apply, both stacks were planned through the exact `proso-deploy` role:

| Stack | Result |
|---|---|
| `00-bootstrap` | detailed exit code 0, no changes |
| `10-account-baseline` | detailed exit code 0, no changes |

The role can read bucket configuration but not audit objects: its drift grant
contains bucket ARNs only, never `/*`. All IAM mutation verb families remain
explicitly denied. PR #212 removed the bootstrap-only administrator assumption
from the routine backend/provider path.

### Policy gate

- `make infra-check`: green (fmt, validate, tflint, Trivy, secret scan,
  Checkov, and Terraform tests).
- Eight falsification groups: green, including public-bucket, credential,
  forbidden-stack, missing-root-workflow, and malformed-Terraform plants.
- Checkov's observed false-green (`Parsing errors: 1`, process exit 0) is now a
  gate failure.
- Independent different-family review: `ALLOW` after all findings were repaired.

## Planned, not live

### `stacks/05-org-structure` and Identity Center

The credential-free plan is clean:

```text
Plan: 13 to add, 0 to change, 0 to destroy.
```

It creates the `Workloads` OU, `PlatformAdmins` group and Pedro user, plus these
permission sets and account assignments:

| Permission set | Account | Purpose |
|---|---|---|
| `ProsoInfraDeploy` | 699475944323 | routine scoped Terraform + state |
| `WorkloadBreakGlass` | 699475944323 | PT2H incident/first-bootstrap admin |
| `ManagementOps` | 851725512267 | management metadata/budget/backup-posture audit |

`attach_service_control_policies = false`; the plan contains **zero**
`aws_organizations_policy` or `aws_organizations_policy_attachment` resources.
No Identity Center resource has been applied yet.

The non-root management path is blocked at authentication, not at Terraform:
`aws login` with the existing `admin-user` console identity reached **“Additional
verification required”** for its registered passkey/security key. No temporary
CLI session was issued. Once that passkey gesture is completed, the prepared
13-create plan can be regenerated and applied without root. Creating the
Identity Center user then sends Pedro the one-time activation link; setting the
password and registering Identity Center MFA is the documented human step before
`aws sso login` can prove the new path.

## Pedro-gated AWS actions — deliberately untouched

Exactly the two actions named by the operator remain gated:

1. **Enable `SERVICE_CONTROL_POLICY` on root `r-y7xb`.** Not executed.
   Consequently no SCP was created or attached, and `SandboxRestrictions`
   remains inert.
2. **Retire the root access key.** Not deactivated, deleted, or otherwise
   modified. The ≥7-day backup observation window starts only after the new SSO
   path is proven.

The account move from root into `Sandboxes` OU is also not executed yet because
it uses the same passkey-gated non-root management session. It does not require
root and is reversible.

## CI delivery status

PR #213 moves the credential-free Terraform workflow from the undiscoverable
`infra/aws/.forgejo/` subtree to the git-root `.forgejo/workflows/` path. It
also removes the impossible Forgejo-to-AWS OIDC plan/drift jobs: the issuer is
Tailscale-only, so AWS cannot fetch discovery/JWKS, and no static CI key fallback
is accepted.

That PR is locally green and independently reviewed, but it changes a workflow
and therefore remains **`[pending] Pedro: merge PR #213`** under the repository
merge policy. Forgejo receives only mirrored `main`, so this workflow is an
independent post-merge replay, not a GitHub-PR required check.

## Next executable sequence

1. Pedro completes the existing `admin-user` passkey prompt for `aws login`.
2. Regenerate and inspect the stack-05 plan; require 13 create / 0 change / 0
   destroy and zero SCP resources; apply it.
3. Pedro opens the Identity Center activation email and registers MFA.
4. Prove `ProsoInfraDeploy` with real no-change plans for stacks 00 and 10.
5. Remove the transitional `OrganizationAccountAccessRole` trust and delete the
   interim `pedro-ops` user/key through the short-lived non-root admin session.
6. Only with a separate in-turn authorization: enable SCPs and begin the root-key
   retirement grace window.
