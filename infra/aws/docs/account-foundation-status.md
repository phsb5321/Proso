# Account foundation status

**Updated:** 26/08/2026 02:10 BRT
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

## `05-org-structure` and Identity Center — live

### Applied 25/08/2026

The blocker recorded below was authentication, not Terraform: `aws login` with
the `admin-user` console identity stopped at a passkey/security-key prompt that
only Pedro can satisfy, so no non-root CLI session could be issued.

**Pedro directed the use of the `PERSONAL_ROOT` profile to unblock it**, and the
stack is now applied. ADR-001 §4.3 was subsequently amended: `PERSONAL_ROOT` is
an authorised profile for this project's plans and applies; destructive posture
changes remain separately gated.

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

### State and permission-policy verification — 25/08/2026 23:08 BRT

- A security review rejected stack-05 state in the workload account: both
  `proso-deploy` and ProsoInfraDeploy could rewrite state that `PERSONAL_ROOT`
  later applies. The active 32-resource state now lives in management bucket
  `proso-management-tfstate-851725512267`, encrypted by management CMK
  `00d8ddcb-d5fc-4d48-a85a-8d205dbd38a3`; migration preserved the complete
  resource payload.
- The retired workload prefix `05-org-structure/` is explicitly denied in both
  workload identity policies and sealed against every principal by the bucket
  policy. A live HeadObject probe returns access denied.
- Creating the isolated backend added 19 resources and updated only the
  ProsoInfraDeploy inline policy; it destroyed nothing. Final live plans for
  stacks 00 and 05 both return detailed exit code 0: **no changes**.
- Live permission-set documents match Terraform: ProsoInfraDeploy can assume
  `proso-deploy`, read/write only the state bucket, and use its CMK only through
  S3 with the expected alias; ManagementOps matches the audited read/deny
  policy; WorkloadBreakGlass has only `AdministratorAccess` and a PT2H session.
- IAM simulation proves the AWSReservedSSO Proso role may assume `proso-deploy`
  and read state, while IAM creation and CloudTrail-object reads are denied.
- Profiles `proso-sso` and `management-ops` are preconfigured with non-secret
  portal/account/role metadata. `scripts/prove-sso-path.sh --check` passes now;
  the full proof is ready for the moment Pedro activates the invitation/MFA.

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

`Sandbox-Account` moved from root `r-y7xb` into `Sandboxes`
`ou-y7xb-qkp97z4j` on 25/08/2026. The preflight and postflight both proved the
single-account parent change; `PolicyTypes` remained empty, so no SCP became
effective. The move is reversible and neither gated security action was used.

## CI delivery status — green on Forgejo

PR #213 installed the credential-free Terraform workflow at the git-root path
Forgejo discovers. The first real runs then exposed three host-only failures:

1. DynamicUser state refused direct script execution, then uv Python and
   Terraform provider binaries (`EACCES`). PRs #221/#222 run from an executable,
   trap-cleaned scratch clone.
2. Thirteen Terraform roots copied the same ~887 MB AWS provider until the
   17 GB-free runner hit ENOSPC. PR #223 uses one per-run plugin cache; every
   root symlinks to it. No global GC or shared-cache sweep.
3. TFLint still downloaded/signature-verified its AWS ruleset on every scratch
   run. PR #224 ships ruleset 0.48.0 from the pinned Nix flake.

Forgejo run **18** on merged commit `8971ae3` completed **successfully** from
01:55 to 02:09 BRT on 26/08/2026: policy gate, Checkov, all Terraform tests, and
all falsifiers. It runs without AWS credentials. Because Forgejo receives
mirrored `main`, this is independent post-merge evidence rather than a GitHub-PR
required check.

## Next executable sequence

1. Pedro opens the Identity Center activation email, sets the password, and
   registers MFA.
2. Run `infra/aws/scripts/prove-sso-path.sh`; require the two AWSReservedSSO
   identities, scoped role hop, and clean plans for stacks 00/10/20.
3. After that proof, remove the transitional `OrganizationAccountAccessRole`
   trust and retire the interim `pedro-ops` user/key using the authorised
   `PERSONAL_ROOT` profile.
4. SCP enablement and root-access-key retirement remain separately gated and
   untouched.
