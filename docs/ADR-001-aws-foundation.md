# ADR-001 — AWS foundation for Proso: SOTA review and architecture

**Date:** 25/08/2026 · **Status:** accepted (design), implementation gated
**Scope:** how Proso's cloud footprint is built, secured, and operated on AWS.

This is the shared contract every infrastructure tab works from. Read it before
touching a `.tf` file. It records what was *measured* about the current account,
what the 2026 state of the art actually says, and which of those the project
adopts — with the reasons, so a later reader can disagree on evidence rather
than taste.

---

## 1. Measured starting state (25/08/2026)

Not assumed — read from the live account:

| Fact | Value |
|---|---|
| Organization | `o-qtcsgow9oy`, FeatureSet **ALL**, master `pedrobalbino@proton.me` |
| Accounts | `Pedro Balbino` **851725512267** (management), `Sandbox-Account` **699475944323** |
| Region | `us-east-1` |
| Current spend | **USD 23.40/month** (July), dominated by backup buckets |
| Existing buckets | 5, incl. `nixos-server-backups` with **Object Lock** |
| Existing IAM users | 7, incl. scoped `restic-objectlock-v1`, `dokku-backup-user`, `proxmox-backup` |
| **`PERSONAL_ROOT` profile** | **`arn:aws:iam::851725512267:root` — literal ROOT credentials** |
| Root access key | `AKIA4MTW…` created 2026-05-13, **Active** |

The last two rows are the single most important finding, and they are already a
known, recorded risk — `docs/reading-journey-status.md` next-slice #26 in the
Proso repo: *"a leaked root key still bypasses Object Lock governance and can
purge every backup."*

## 2. What the 2026 state of the art says

Sources reviewed 25/08/2026 via the self-hosted SearXNG instance; each claim
below was corroborated by at least one canonical or vendor page.

### Security

1. **No long-lived credentials.** The 2026 consensus is keyless CI via OIDC
   federation into a scoped role. Long-lived access keys — *especially root
   keys, which account MFA does not protect* — are the top finding in every
   current best-practice writeup.
2. **Account-level isolation.** A workload gets its own Organizations member
   account; SCPs provide preventive guardrails that IAM alone cannot. The
   baseline is org-level CloudTrail plus delegated GuardDuty/Security Hub.
3. **State is a secret.** The state file contains resource metadata and can
   contain secrets: private bucket, versioned, encrypted, access-logged.
4. **S3-native state locking.** Terraform ≥1.11 supports `use_lockfile = true`,
   which **removes the DynamoDB lock table entirely** — fewer resources, less
   cost, less drift surface. The old `dynamodb_table` pattern is legacy.
5. **Least privilege deploy role**, never `AdministratorAccess` for routine
   plan/apply.

### Alignment (agent guardrails)

This project is built largely by AI agents, which is itself a threat model. The
2026 guidance is layered and explicit: *policy-as-code, scoped IAM roles,
input/output validation, and human-in-the-loop approvals* — with policy-as-code
described as "a set of executable rules that evaluate every plan and block what
violates your standards", sitting inside a wider set that includes **golden
modules** and constrained agent permissions.

Adopted as hard rules in §4.

### Integration quality

The reference pipeline is: `fmt` → `validate` → `tflint` (correctness) →
`Trivy` / `Checkov` (safety) → `plan` → **gated** `apply`. Note **Trivy replaces
the deprecated tfsec**. Module behaviour is covered by native `terraform test`;
drift is caught by a scheduled plan.

### Terraform vs OpenTofu

Both are mature and near-identical day to day. Terraform leads on Stacks/HCP;
OpenTofu leads on licence (MPL vs BSL) and ships **native state encryption**.
**Decision: Terraform**, per the operator's explicit instruction. Recorded
because it is a real fork: OpenTofu is a drop-in swap if the BSL licence or
client-side state encryption later matters.

## 3. Architecture

### Account model

```
o-qtcsgow9oy  (management, 851725512267)  <- root lives here; NOT a workload account
├── Sandbox-Account (699475944323)        <- iterate here, real applies, disposable
└── proso-prod      (to be created)       <- the workload account, GATED (§5)
```

Rationale: "everything separate" is satisfied at the **account** boundary, which
is the only boundary AWS treats as a hard security and billing partition. Blast
radius of a mistake in `proso-prod` cannot reach the backup buckets in the
management account.

### First workload: the static site (≈ $0/month)

Measured payload: **1.06 MB across 27 files**, including both `.xpi` releases.

- **S3** private bucket, no website endpoint
- **CloudFront** + **Origin Access Control** (OAC) — required anyway for HTTPS
  on a custom domain; its **1 TB / 10M-request free tier is indefinite for every
  account**, so serving 1 MB is free in practice
- **ACM** certificate in `us-east-1` (CloudFront requires that region — already ours)
- **DNS stays at Cloudflare**: a CNAME to the distribution. Deliberately *not*
  Route 53, which would add $0.50/month/zone for nothing.

Two failure modes that must be encoded in the module, not in a runbook:

- `.xpi` objects **must** carry `Content-Type: application/x-xpinstall` or
  Firefox refuses to install them.
- `updates.json` and `releases/` **must** land at the site root, or every
  already-installed extension silently stops updating.

### Explicitly NOT migrating: the API

The NestJS + Prisma API runs on Dokku at **$0**. Cheapest AWS equivalents:
Lightsail nano + co-located Postgres **$3.50–5/mo**; Lightsail + RDS
`t4g.micro` **~$17–20/mo**. It would buy nothing today — the API returns 402 to
everyone, and its real blocker is five missing `PADDLE_*` env names, which no
change of host fixes. Revisit when there are paying users.

## 4. Guardrails — binding on every tab

1. **Plan-only by default.** No `terraform apply` against `proso-prod` without
   Pedro's explicit, in-turn go. `Sandbox-Account` may be applied to freely.
2. **A budget alarm is the FIRST apply** in any account. Nothing else is created
   until spend is observable.
3. **Root is used for exactly one operation** — creating the member account —
   and never for routine work. Every other call assumes a scoped role.
4. **Policy-as-code gates the plan.** Checkov + Trivy must pass; a failing
   policy blocks the apply rather than being waived.
5. **No secret in state or repo.** sops for anything sensitive; state bucket
   private, versioned, encrypted.
6. **Destructive operations** (`destroy`, bucket deletion, account closure) are
   never autonomous.
7. **Every module ships a `terraform test`** and is falsifiable — a gate that
   cannot fail is not a gate.

## 5. Gated on Pedro

- **Create `proso-prod` member account** — needs a unique email (proposal:
  `pedrobalbino+proso-prod@proton.me`) and uses root once. Semi-permanent:
  AWS account closure is a 90-day process.
- **Retire the root access key** (`AKIA4MTW…`) once the deploy role works —
  this is next-slice #26 finally becoming actionable.
- **DNS cutover** of `proso.com.br` from GitHub Pages to CloudFront — the last
  step, taken only after the distribution is verified on its own domain.

## 6. Repository layout

```
stacks/                 one state per stack, no cross-stack coupling
  00-bootstrap/         state bucket + deploy role   (chicken-and-egg: local state, then migrate)
  10-account-baseline/  budget alarm, CloudTrail, password policy
  20-site/              S3 + CloudFront + OAC + ACM
modules/                golden modules, each with terraform test
docs/                   ADRs (this file)
```

State keys are per-stack so a mistake in one cannot lock or corrupt another.
