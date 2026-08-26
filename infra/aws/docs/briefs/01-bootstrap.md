# Brief — 🧱 Bootstrap (state + deploy role) · stacks/00-bootstrap

Build the Terraform foundation everything else depends on.

## Deliverables
1. `stacks/00-bootstrap` creating, **in Sandbox-Account first**:
   - S3 state bucket: private (all public access blocked), versioned, SSE encryption, access logging.
   - A least-privilege **deploy role** assumable for plan/apply. NOT AdministratorAccess — scope it to what the site stack actually needs (S3, CloudFront, ACM, budgets) and widen only with evidence.
2. Backend config using **`use_lockfile = true`** (Terraform >= 1.11). No DynamoDB table.
3. The chicken-and-egg migration: start on local state, apply, then migrate state INTO the bucket it just created. Document the exact command sequence in the stack README.
4. `terraform test` covering: bucket is not public, versioning on, encryption on, role policy denies `iam:*` and `organizations:*`.

## Definition of done
`terraform plan` clean, applied in Sandbox, state migrated and locking proven (two concurrent plans — second must block). Falsify at least one test by plant.

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

