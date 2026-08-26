# Retiring the root access key — costed, reversible, evidenced

> **Key ids are redacted in this document on purpose.** They were committed
> literally until 25/08/2026, when `gitleaks` (via `make verify`) flagged four
> of them. An access key id is not the secret half of a credential, but it
> names a live credential and helps target it, so it does not belong in a
> tracked file. Read the current ones from the API instead, which is also the
> only way to be sure they are current:
>
> ```bash
> aws iam list-access-keys --user-name pedro-ops --profile PERSONAL_ROOT \
>   --query 'AccessKeyMetadata[].{Id:AccessKeyId,Status:Status,Created:CreateDate}'
> aws iam list-access-keys --profile PERSONAL_ROOT   # the root key
> ```
>
> Substitute the id into the commands below where `<ACCESS-KEY-ID>` appears.



**Date:** 25/08/2026 · **Status:** plan; steps 4–6 are gated on Pedro
**Closes:** Proso `docs/reading-journey-status.md` next-slice #26, open since 15/08/2026
**Binding context:** ADR-001 §4.3, §5

Next-slice #26 states the risk as: *"a leaked root key still bypasses Object
Lock governance and can purge every backup."* This document verifies that claim
against the live account rather than repeating it, then gives the order of
operations that removes the key without a window in which backups stop.

---

## 1. What is actually true (measured 25/08/2026)

### The root key

From the IAM credential report:

```
user=<root_account>
user_creation_time=2024-01-17T17:41:44Z
mfa_active=true
access_key_1_active=true
access_key_1_last_rotated=2026-05-13T02:09:00Z
access_key_1_last_used_date=2026-08-25T14:44:00Z
access_key_1_last_used_region=us-east-1
access_key_1_last_used_service=iam
```

Two things worth stating plainly:

- **The account has MFA.** MFA does not protect an access key. `AKIA4MTW…`
  authenticates on its own, and it carries every root privilege.
- **The key is in use today.** The 14:44Z `iam` entry is from an agent session,
  not a workload — this repo's own bootstrap used root at 14:18Z for
  `CreateUser`/`PutUserPolicy`/`CreateAccessKey`. If another infrastructure tab
  is also holding `PERSONAL_ROOT`, deactivating the key will interrupt it.
  **Coordinate across tabs before step 4.**

### The blast-radius claim, checked

Every backup writer was read directly. All three are bucket-scoped, so none of
them is the exposure:

| User | Buckets it can touch | Explicit Deny |
|---|---|---|
| `restic-objectlock-v1` | `nixos-server-backups`, `nixos-desktop-backups` | `s3:BypassGovernanceRetention`, `PutBucketObjectLockConfiguration`, `PutBucketVersioning`, `DeleteBucket`, `PutBucketPolicy` |
| `proxmox-backup` | `proxmox-backups-home301` | as above plus `PutEncryptionConfiguration`, `PutBucketPublicAccessBlock`, `PutLifecycleConfiguration` |
| `dokku-backup-user` | `dokku-backup-sparkydata-prod` | **none** |

So next-slice #26 is **correct, and for a sharper reason than it states**: the
scoped users are *explicitly denied* `s3:BypassGovernanceRetention`. They cannot
purge an Object-Lock-governed backup even if fully compromised. That leaves the
root key as the exposure — it is not subject to those denies.

Two corrections to the claim as written:

1. **Root is not the only path.** IAM user `admin-user` carries
   `AdministratorAccess`. It has **no access key** (console password only, last
   used 2026-03-26), so it needs an interactive login, but it is a second
   principal that could bypass governance retention. Retiring the root key
   without addressing `admin-user` moves the risk rather than removing it.
2. **`dokku-backup-user` has no Deny block**, unlike its two siblings. Its
   `Allow` list contains no bucket-level or governance actions, so it is not
   currently dangerous, but it is one `PutUserPolicy` away from being so. Adding
   the same Deny block is a five-minute hardening job, independent of this plan.

### The gap that makes this harder than it should be

```
$ AWS_PROFILE=pedro-ops aws cloudtrail describe-trails --query 'trailList[]'
[]
$ AWS_PROFILE=pedro-ops aws cloudtrail list-trails --query 'Trails[]'
[]
```

**There is no CloudTrail trail in the management account.** Root activity exists
only in the 90-day Event history and is written nowhere durable. Consequences:

- Root usage older than 90 days cannot be reviewed, so "nothing depends on this
  key" cannot be proven historically — only observed forward.
- After the key is deleted, there is no durable record to answer *"was it used
  between the last audit and now?"*

**This should be fixed before step 4, not after** — see §7.

---

## 2. Why this was blocked, and what unblocked it

The reason root was still in routine use is that no non-root path was wired.
Measured proof that root cannot simply reach the other account:

```
$ AWS_PROFILE=PERSONAL_ROOT aws sts assume-role \
    --role-arn arn:aws:iam::699475944323:role/OrganizationAccountAccessRole \
    --role-session-name probe
An error occurred (AccessDenied) when calling the AssumeRole operation:
Roles may not be assumed by root accounts.
```

IAM Identity Center is already enabled (`ssoins-7223fcff316331ec`, identity
store `d-9067ca0796`) and has **zero users and zero permission sets** — switched
on 2025-03-23 and never configured. Configuring it is the exit: permission sets
issue short-lived credentials per account, with no static key anywhere.

`stacks/05-org-structure` contains that configuration, planned and ready.

---

## 3. Interim credential to be removed (disclosure)

Before the Identity Center correction landed, this tab created an IAM user
`pedro-ops` (`<ACCESS-KEY-ID>`) so that anything at all could run against
Sandbox-Account — root cannot assume roles, and no other programmatic principal
existed. Its policy is `policies/pedro-ops-baseline.json`: assume-role into the
sandbox, read-only org/IAM metadata, and an explicit `Deny` on `s3:*`,
`secretsmanager:*`, `ssm:GetParameter*`, `kms:Decrypt`. Verified:

```
$ AWS_PROFILE=pedro-ops aws s3api list-buckets
An error occurred (AccessDenied) when calling the ListBuckets operation: User:
arn:aws:iam::851725512267:user/pedro-ops is not authorized to perform:
s3:ListAllMyBuckets with an explicit deny in an identity-based policy
```

The secret lives in Bitwarden (`api/aws-pedro-ops`) and in `~/.aws/credentials`
(mode 0600). It is **not** the target state — it is a static key, which is what
this whole document exists to eliminate. It is step 3 below, and it goes away as
soon as Identity Center login works:

Use the short-lived `admin-user` console session obtained with `aws login`, not
`PERSONAL_ROOT`:

```bash
aws --profile pedro-admin-session iam delete-access-key --user-name pedro-ops --access-key-id <ACCESS-KEY-ID>
aws --profile pedro-admin-session iam delete-user-policy --user-name pedro-ops --policy-name pedro-ops-baseline
aws --profile pedro-admin-session iam delete-user --user-name pedro-ops
rbw remove api/aws-pedro-ops
```

---

## 4. Cost

| Item | Cost |
|---|---|
| IAM Identity Center, permission sets, assignments | **$0** — no charge for Identity Center itself |
| Organizations, OUs, SCPs | **$0** |
| Management-account CloudTrail (§7, recommended) | ~**$1.00/mo** KMS CMK + cents of S3; management events on a first trail are free |
| Sandbox baseline already applied | ~**$1.10/mo** (same CMK + storage) |

The whole plan is essentially free. Cost is not the reason it has waited.

---

## 5. Order of operations

Each step names its rollback. Steps 1–3 are reversible in seconds; step 5 is the
only one with a delay, and even that is recoverable within the grace window.

### Step 1 — configure Identity Center (reversible, no impact)

Apply `stacks/05-org-structure`. Creates the `PlatformAdmins` group, three
permission sets with their assignments, the `Workloads` OU, and the Identity
Center user for Pedro.

| Permission set | Account | Grants | Session |
|---|---|---|---|
| `ProsoInfraDeploy` | 699475944323 | assume `proso-deploy`; read/write the state bucket through its CMK | PT4H |
| `WorkloadBreakGlass` | 699475944323 | `AdministratorAccess` | PT2H |
| `ManagementOps` | 851725512267 | org/IAM/Identity Center read, budgets, backup-posture audit; denied backup contents | PT4H |

`ProsoInfraDeploy` is the routine path and holds no admin — ADR-001 §2.5.
`WorkloadBreakGlass` exists for one concrete reason, not as a comfort blanket:
the first `stacks/00-bootstrap` apply *creates* the state bucket and the deploy
role, so until it has run, `ProsoInfraDeploy` grants nothing usable.

- **Gated:** the management account is production; this needs Pedro's go.
- **THE ONE HUMAN STEP.** Creating the Identity Center user makes AWS email a
  one-time password link to `operator_email`. **Pedro must open that link, set a
  password, and register an MFA device.** Nothing automates it — no API sets an
  Identity Center password, and `aws sso login` is a browser device-authorisation
  flow. Every step below is blocked until this is done.
- **Rollback:** `terraform destroy` on this stack (the `Workloads` OU carries
  `prevent_destroy`, so remove it from state first if the OU should stay).

### Step 2 — prove the new path before removing the old one

```bash
aws configure sso --profile proso-deploy   # start URL from the Identity Center console
aws sso login --profile proso-deploy
aws --profile proso-deploy sts get-caller-identity
# expect: arn:aws:sts::699475944323:assumed-role/AWSReservedSSO_ProsoInfraDeploy_<suffix>/<user>
```

Then re-run a real plan through it — the applied baseline is the honest test,
because a wrong permission set shows up as a diff or a 403, not as silence:

```bash
cd stacks/10-account-baseline
terraform plan -var-file=sandbox.tfvars -var='aws_profile=proso-deploy'
# expect: No changes. Your infrastructure matches the configuration.
```

- **Rollback:** none needed; nothing has been removed.
- **Do not continue until this works.** Everything after this point removes a
  credential.

### Step 3 — delete `pedro-ops` (reversible with the non-root admin session)

Run the four commands in §3. This removes the last static key this repo created.

- **Rollback:** recreate the same user/policy/key through the short-lived
  `pedro-admin-session`. The historical root-bootstrap script was removed once
  the scoped role worked; its implementation remains available in git history,
  but root is no longer an allowed routine identity.

### Step 4 — deactivate the root key, DO NOT delete (GATED)

```bash
aws --profile PERSONAL_ROOT iam update-access-key \
  --access-key-id <ACCESS-KEY-ID> --status Inactive
```

- **Rollback, instant:** the same command with `--status Active`. This is the
  whole reason deactivation and deletion are separate steps.
- **Coordinate first.** Any other agent session or script holding
  `PERSONAL_ROOT` breaks here. Grep for it:
  `grep -rn 'PERSONAL_ROOT' ~/Documents/Code ~/NixOS ~/.aws 2>/dev/null`.

### Step 5 — wait ≥ 7 days, watching the things that must not break

The grace window exists because the backup jobs are the failure mode nobody
notices immediately. Restic runs daily; Proxmox and Dokku similarly. Seven days
covers a weekly cadence with margin.

Check at the start and end of the window:

```bash
# restic still writing off-site
ssh Nix.Server "sudo systemctl status restic-backups-s3-daily.timer"
ssh Nix.Server "sudo bash -c 'set -a; source /etc/restic/aws-env; \
  export RESTIC_REPOSITORY=s3:s3.us-east-1.amazonaws.com/nixos-server-backups; \
  export RESTIC_PASSWORD_FILE=/etc/restic/password; restic snapshots --latest 1'"

# every scoped key still being used, i.e. nothing silently switched to root
for u in restic-objectlock-v1 proxmox-backup dokku-backup-user ses-smtp-alertmanager; do
  aws --profile pedro-sso iam list-access-keys --user-name "$u" \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text | while read -r k; do
      echo -n "$u $k "; aws --profile pedro-sso iam get-access-key-last-used \
        --access-key-id "$k" --query 'AccessKeyLastUsed.LastUsedDate' --output text
  done
done
```

A `LastUsedDate` that stops advancing is the signal to roll back step 4.

- **Rollback:** reactivate the key; investigate; restart the window.

### Step 6 — delete the root key (GATED, irreversible)

```bash
aws --profile PERSONAL_ROOT iam delete-access-key --access-key-id <ACCESS-KEY-ID>
```

- **Rollback:** none. A new root key can be created, but this specific
  credential is gone — which is the point.
- Root itself remains, reachable by console with MFA for the operations that
  genuinely require it (billing changes, account closure, support plan).

### Step 7 — close the second path

`admin-user` still holds `AdministratorAccess` with a console password. Once
`ManagementOps` and `WorkloadBreakGlass` cover daily work, either delete it or reduce
it to a documented break-glass identity with MFA enforced. Track it as its own
slice; it is not a reason to delay steps 1–6.

---

## 6. What each step buys

| After step | Root key can still… | Backups purgeable by |
|---|---|---|
| now | everything, non-interactively | root key, `admin-user` |
| 4 | nothing (inactive) | `admin-user` (interactive + MFA) |
| 6 | nothing, permanently | `admin-user` (interactive + MFA) |
| 7 | nothing, permanently | nobody without a deliberate policy change |

---

## 7. Recommended alongside, not blocking

1. **A CloudTrail trail in the management account.** Today there is none (§1).
   `stacks/10-account-baseline` already builds exactly this and is proven in
   Sandbox; pointing it at the management account is a variable change plus a
   gated apply. Better still, make it an **organization trail** so member
   accounts are covered by one trail.
2. **A CloudWatch metric filter + alarm on root usage.** This is the one place
   `CKV2_AWS_10` (CloudTrail → CloudWatch Logs), skipped in the sandbox module
   for cost, genuinely earns its keep: an alarm on `userIdentity.type = Root`
   turns "was the root key used?" from an audit question into a notification.
3. **The Deny block on `dokku-backup-user`**, matching its two siblings.
4. **Enable `SERVICE_CONTROL_POLICY` on the org root.** Measured: the root
   reports `PolicyTypes: []`, so the existing `SandboxRestrictions` SCP is inert
   and cannot even be attached. One reversible call:
   `aws organizations enable-policy-type --root-id r-y7xb --policy-type SERVICE_CONTROL_POLICY`.
