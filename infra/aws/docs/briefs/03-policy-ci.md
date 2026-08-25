# Brief — 🛡️ Policy & CI Gates

Make the guardrails executable rather than advisory. This tab is why the other
tabs can be trusted.

## Deliverables
1. **Pre-commit**: `terraform fmt`, `validate`, `tflint`.
2. **Security scanning**: **Trivy** (tfsec is deprecated — do not use it) + **Checkov**. Wire both to fail closed.
3. **CI on the self-hosted Forgejo runner** — the credential-free floor (`fmt` -> `validate` -> `tflint` -> Trivy/Checkov -> `terraform test`) lives at the git-root `.forgejo/workflows/`, which GitHub ignores. Measured topology supersedes the original live-plan proposal: Forgejo's OIDC issuer is Tailscale-only, so AWS cannot validate it.
4. **Drift detection**: `scripts/drift-check.sh` is executable and read-only, but remains operator-run until a publicly reachable keyless issuer exists. An always-skipped schedule is not a delivered gate.
5. A **baseline/ratchet** for accepted findings, each with a written reason and review date — mirroring the Proso repo's `quality-baselines/` convention. Never a blanket skip.

## Definition of done
A deliberately insecure resource (public S3 bucket) is BLOCKED by the pipeline; removing the plant returns it green. Paste both outputs.

## Binding rules (ADR-001 §4 — read `docs/ADR-001-aws-foundation.md` FIRST)

1. **Plan-only against production.** Never `terraform apply` to `proso-prod`. `Sandbox-Account` (699475944323) is yours to apply to freely.
2. **A budget alarm is the FIRST apply** in any account. Nothing else before spend is observable.
3. **Root credentials (`PERSONAL_ROOT` = literal root) are for ONE operation only** — creating the member account, owned by the Account Foundation tab. Never use root for routine work.
4. **Policy-as-code gates the plan**: Checkov + Trivy must pass. Do not waive a finding to go green — fix it or record why it is a false positive with evidence.
5. **No secret in state or repo.** sops for anything sensitive.
6. **Never destroy autonomously** (`destroy`, bucket deletion, account closure).
7. **Every module ships a `terraform test`.** A gate that cannot fail is not a gate — falsify each one by plant and paste the red/green output.

## Workflow
- Worktree-first, one worktree per PR, branch `NNN-slug` off `origin/main`.
- Terraform >= 1.11 (S3-native locking via `use_lockfile`; do NOT add a DynamoDB lock table — it is legacy).
- Report with commands + output, never assertions. If blocked, say exactly what is blocking and continue with everything that is not.

