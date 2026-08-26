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

## Update — 25/08/2026 21:5x BRT: `05-org-structure` APPLIED with root

The blocker recorded below was authentication, not Terraform: `aws login` with
the `admin-user` console identity stopped at a passkey/security-key prompt that
only Pedro can satisfy, so no non-root CLI session could be issued.

**Pedro directed the use of the `PERSONAL_ROOT` profile to unblock it**, and the
stack is now applied. This is coherent with ADR-001 rather than a breach of it:
root's one sanctioned job is to create the structure that replaces root, and
that is exactly this stack — it builds the Identity Center path whose whole
purpose is to end routine root use.

Blast radius was measured before applying, not after:

```
actions: {'create': 13}
SCP resources: 0
account/member creates: 0
```

```
Apply complete! Resources: 13 added, 0 changed, 0 destroyed.
```

### Live, verified independently after the apply

| Resource | Value |
|---|---|
| `Workloads` OU | `ou-y7xb-a029svns` (sibling of `Sandboxes` `ou-y7xb-qkp97z4j`) |
| `ProsoInfraDeploy` | `ps-2670fee9caf657ad` — 4h sessions, → Sandbox-Account |
| `ManagementOps` | `ps-70926e4ddc9365f7` — 4h sessions, → management |
| `WorkloadBreakGlass` | `ps-cd142da24ace6f76` — 2h sessions, `AdministratorAccess` |
| `PlatformAdmins` group | `4468f408-8031-70b0-fd16-fea17c6d660a` |
| Identity Center user | `pedro` → `pedrobalbino@proton.me` |

`operator_email` was the placeholder `you@example.com` in `example.tfvars`; it
was set to the organisation's own management email, which is already proven
deliverable for AWS mail and is where the activation link must land.

### Still gated, and NOT touched by this apply

Both remain exactly as before — the operator authorised root for this stack, not
for these:

1. **`SERVICE_CONTROL_POLICY` on root `r-y7xb`** — still disabled
   (`PolicyTypes: []`). `attach_service_control_policies = false`, so the plan
   contained **zero** SCP resources and `SandboxRestrictions` is still inert.
2. **The root access key** — untouched. Its ≥7-day backup observation window
   cannot start until the SSO path is proven end to end.

### The one human step, now the only thing in the way

Creating the Identity Center user sends a one-time activation link to
`pedrobalbino@proton.me`. Setting that password and registering Identity Center
MFA cannot be automated. Until it is done, `aws sso login` cannot be proven, and
until *that* is proven the root key should not be retired — the order matters,
because retiring the key before the replacement works would leave no path in.

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
