# Brief — 🌐 Site (S3 + CloudFront) · stacks/20-site

The actual deliverable, and the one with user impact: `proso.com.br` currently
serves **three false claims** ("Coming Soon" x3, "free tier works immediately",
"unlimited browser TTS") from GitHub Pages, and its `updates.json` advertises
**1.1.3 + 1.2.1** while the shipped extension is **1.2.9**.

## Deliverables
1. `modules/static-site`: private S3 bucket + CloudFront + **Origin Access Control** (not legacy OAI) + ACM cert in `us-east-1`.
2. `stacks/20-site` consuming it.
3. **Two encoded invariants** (module-level, not runbook prose) — both are silent failures:
   - `.xpi` objects MUST be served `Content-Type: application/x-xpinstall`, or Firefox refuses to install.
   - `updates.json` and `releases/` MUST land at the site ROOT, or every installed extension silently stops updating.
4. A deploy script that syncs `packages/site` + the `gh-pages` `releases/` tree with correct content-types and a CloudFront invalidation.
5. `terraform test`: bucket not public, OAC attached, default root object set, cert in us-east-1.

## Source of truth for content
The corrected site is already staged on the `gh-pages` branch of the Proso repo (27 files, 1.06 MB, includes both XPIs). Do not re-author the copy.

## Cost ceiling
This must land under $0.01/month: CloudFront free tier (1 TB / 10M req, indefinite) covers it. **Do not create a Route 53 hosted zone** — DNS stays at Cloudflare, $0.50/mo saved for nothing.

## Explicitly NOT yours
The DNS cutover. Build it, verify on the CloudFront domain, then stop and report — Pedro flips the CNAME.

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

