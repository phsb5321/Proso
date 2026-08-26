# Brief — 🔐 Account Foundation (mostly GATED)

You own the parts that touch root and money. Most of your work is preparation;
the irreversible steps stop at Pedro.

## Deliverables you can do now
1. `stacks/10-account-baseline`: **AWS Budgets alarm first** (low threshold, e.g. $5/mo delta, email to Pedro), account password policy, CloudTrail. Apply in **Sandbox** to prove it.
2. Terraform for the member account + its OrganizationAccountAccessRole assumption path — **written and planned, not applied**.
3. A costed, reversible **root-key retirement plan** (next-slice #26 in the Proso repo, open since 15/08): a least-privilege `pedro-ops` user/role replacing routine root use, with a restic-safe order — disable -> >=7d grace -> delete — and an explicit rollback at each step. Restic, dokku and proxmox already use scoped users, so verify the blast radius claim rather than assuming it.
4. Research whether **Forgejo Actions can federate to AWS via OIDC**. If yes, that is the target and there are no static CI keys at all. If no, propose the narrowest fallback (scoped IAM user, key in sops, rotation cadence) and say plainly which one you proved.

## GATED — do not execute, prepare and report
- **Creating the `proso-prod` member account.** Needs a unique email (proposal: `pedrobalbino+proso-prod@proton.me`) and uses root once. Semi-permanent: AWS closure is a 90-day process.
- **Disabling/deleting the root access key** (`AKIA4MTW...`, active since 2026-05-13).

## Binding rules (ADR-001 §4 — read `docs/ADR-001-aws-foundation.md` FIRST)

1. **Plan-only against production.** Never `terraform apply` to `proso-prod`. `Sandbox-Account` (699475944323) is yours to apply to freely.
2. **A budget alarm is the FIRST apply** in any account. Nothing else before spend is observable.
3. **`PERSONAL_ROOT` is an AUTHORISED profile** (operator directive, 25/08/2026). It is configured, it authenticates, and it is Pedro's own account. Use it when a plan or apply needs credentials. Prefer `proso-scoped` where it already works, but NEVER stall on credentials, never log a "guardrail incident" for using `PERSONAL_ROOT`, and never invent an assume-role chain to avoid it. What is gated is DESTRUCTIVE action (rule 6), not the choice of profile.
4. **Policy-as-code gates the plan**: Checkov + Trivy must pass. Do not waive a finding to go green — fix it or record why it is a false positive with evidence.
5. **No secret in state or repo.** sops for anything sensitive.
6. **Never destroy autonomously** (`destroy`, bucket deletion, account closure).
7. **Every module ships a `terraform test`.** A gate that cannot fail is not a gate — falsify each one by plant and paste the red/green output.

## Workflow
- Worktree-first, one worktree per PR, branch `NNN-slug` off `origin/main`.
- Terraform >= 1.11 (S3-native locking via `use_lockfile`; do NOT add a DynamoDB lock table — it is legacy).
- Report with commands + output, never assertions. If blocked, say exactly what is blocking and continue with everything that is not.

