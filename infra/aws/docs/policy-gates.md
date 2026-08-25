# Policy gates — how this repo is kept honest

ADR-001 §4 lists seven guardrails. Four of them are only worth the words if a
machine enforces them, and this is that machine. Read the ADR first; this
document is the operational half.

## One entrypoint

From the Proso repository root:

```bash
nix-shell
make infra-check
```

CI runs that same Make target in the narrower pinned infra shell. There is no
CI-only policy, no extra flag the pipeline passes, and no stage that exists in
one place and not the other — so "it passed locally" and "it passed in CI" are
the same claim rather than two similar ones.

| Stage | Tool | Catches |
|---|---|---|
| `baseline` | `scripts/check-baseline.sh` | an undocumented or expired suppression |
| `stack-policy` | `scripts/check-stack-policy.sh` | an unclassified stack; a never-apply stack being applied or drift-planned |
| `fmt` | `terraform fmt -check -recursive` | formatting drift |
| `validate` | `terraform validate` | broken references, bad types |
| `tflint` | tflint + AWS ruleset | correctness: deprecated syntax, invalid ARNs, dead declarations |
| `trivy` | `trivy config` | safety (Trivy replaces the deprecated tfsec) |
| `secrets` | `trivy fs --scanners secret` + `git ls-files` | ADR §4.5: tracked state/tfvars, credential patterns |
| `checkov` | checkov | safety, second opinion |
| `test` | `terraform test` | resolved **values**, which the scanners never see |

Run one stage with `infra/aws/scripts/gate.sh --stage <name>` from the Proso
root (the script changes into its own subtree).

`baseline` runs first on purpose: a rotten suppression must fail the build even
when the code is clean, otherwise the ratchet quietly becomes a permanent skip.

### Why two security scanners

They disagree, and the disagreements are the point. Checkov flags `CKV_AWS_379`
(no TLS-only bucket policy) on configurations Trivy calls clean; Trivy's
`AVD-AWS-0132` is the clearer of the two on customer-managed keys. The pair
costs a few extra seconds per run.

### The `secrets` stage, and one trap in verifying it

`trivy config` scans for *misconfiguration only*, so ADR §4.5 ("no secret in
state or repo") was the one §4 rule with nothing enforcing it — `.gitignore` is
a convenience, not a boundary, and does nothing about a file already tracked or
added with `git add -f`. The stage checks both halves: no tracked `*.tfstate` /
`*.tfvars`, and no credential pattern anywhere in the tree.

If you verify it by hand, **do not use AWS's documentation example key**
(`AKIAIOSFODNN7EXAMPLE`). Trivy allowlists that pair as a known non-secret, so
the scan comes back clean — which looks exactly like a scanner that is switched
off. `falsify-gates.sh` assertion F uses a randomly generated key of the right
shape instead, assembled from fragments at runtime so the probe does not exist
as a literal in the script and trip the stage on every clean run.

## The gate's own test

```bash
nix develop ./infra/aws -c infra/aws/scripts/falsify-gates.sh
```

A green pipeline means one of two things — everything is safe, or nothing is
being checked — and they look identical from outside. An empty repository, a
mis-scoped `skip-path`, a renamed flag that silently disables a scanner, a
`--soft-fail` someone added to unblock a release: each produces a green tick.

Eight assertions distinguish the two, and CI runs them on every push so the proof
is current rather than a screenshot from the day it was built:

| | Assertion |
|---|---|
| A | Trivy flags the committed FAIL fixture |
| B | Checkov flags the committed FAIL fixture |
| C | planting a public S3 bucket in a scanned path turns the pipeline RED; removing it returns GREEN |
| D | the ratchet rejects an undocumented suppression, **and** an accepted check re-used on a different resource |
| E | `terraform test` fails when the module regresses |
| F | the secret scanner flags a planted credential |
| G | the stack policy requires Terraform CI at the git-root Forgejo path, rejects an unclassified stack, a never-apply stack in drift, and a workflow that applies one |
| H | Checkov fails when any Terraform file cannot be parsed, even though Checkov itself exits 0 |

A and B scan a **copy** of the fixture from outside the repo. Both scanners
auto-discover config from the working directory, and both configs skip that
directory — in place they would report "not scanned" and the assertion would
pass for the wrong reason.

Every assertion matches an expected **string** in the output, not just a
non-zero exit. A scanner that crashed on a missing policy bundle, a
`terraform init` that could not reach the registry, and a typo in the script all
exit non-zero and would otherwise be recorded as "correctly RED".

The script mutates the checkout (it regresses `main.tf`, edits the baseline, and
writes a plant directory). Snapshots are taken up front and restored by a trap
on `EXIT`, `INT` and `TERM`; it refuses to start if the plant path already
exists rather than deleting a directory it did not create; and both transient
plants are `.gitignore`d, so even a `SIGKILL` cannot leave a public bucket or a
credential staged for commit.

## Fixtures

| Path | Role | Scanned by the normal gate? |
|---|---|---|
| `policy/fixtures/compliant/` | green control + reference shape for the site origin bucket | yes |
| `policy/fixtures/violations/` | red control (public bucket, public ACL, anonymous policy) | **no** — `falsify-gates.sh` only |

Deleting or "fixing" the violations fixture breaks `falsify-gates.sh`. That is
the intended alarm, not a bug.

Without fixtures the gate would run against an empty tree and exit 0 on every
stage, which is why `validate` treats "no `.tf` anywhere" as a failure.

## Accepting a finding

Never with `skip-check`. See [`quality-baselines/README.md`](../quality-baselines/README.md):
the machine half records *which*, the human half records *why*, *who* and
*until when*, and an expired acceptance is a build failure.

The baseline is keyed by file **and resource**, so it suppresses the accepted
instance rather than the check. A new bucket that trips `CKV_AWS_144` still
fails even though an existing bucket's `CKV_AWS_144` is accepted — verified
during the definition-of-done run.

`check-baseline.sh` matches on the same `(file, resource, check)` tuple. Matching
on the check id alone would mean the first acceptance of a check silently
pre-approves every later occurrence of it, which is the blanket skip the whole
directory exists to prevent; assertion D proves that case is rejected.

## Pre-commit

```bash
nix develop -c lefthook install
```

`pre-commit` runs the fast correctness stages (fmt, validate, tflint, baseline);
`pre-push` runs the whole gate. Trivy and Checkov are deliberately absent from
`pre-commit` — a hook slow enough to be annoying gets bypassed, and a bypassed
hook protects nothing. Forgejo independently replays the gate when the GitHub
`main` mirror advances; branch protection is unavailable, so that replay is
post-merge evidence rather than a required pre-merge check.

## CI

The git-root `.forgejo/workflows/terraform-ci.yml` runs on the self-hosted
Forgejo runner. Forgejo discovers workflows only at the repository root; the
subtree path imported by PR #209 was inert. `check-stack-policy.sh` now requires
the root file, and falsifier G proves removing it turns the gate red.

GitHub Actions is blocked at the dispatch layer for this account and bills real
money once restored; `.forgejo/workflows/` is a path GitHub ignores, which is
the cost control. The job uses `:host` labels (`[self-hosted, Linux, X64]`) and
`nix develop ./infra/aws`, so it reuses the host store and pinned infra flake
without installing the whole pnpm monorepo.

Only credential-free policy and falsification run in Forgejo. Live plan/drift
is deliberately operator-run: Forgejo's OIDC issuer is Tailscale-only, so AWS
cannot fetch its discovery/JWKS documents. Keeping an always-skipped scheduled
job would be completion theatre, not drift detection. The GitHub-to-Forgejo
mirror carries only `main`, so this is an independent post-merge replay, not a
GitHub-PR required check.

## Which account each stack targets, and what may be applied

The operator decided on 25/08/2026 that the workload account is the **existing
Sandbox-Account 699475944323** and that no new account is created. That makes
`stacks/15-member-account` a stack whose purpose is now ruled out: it creates
`aws_organizations_account.proso_prod`, and an AWS account takes 90 days to
close, so it is the least reversible action available anywhere in this repo.

Until `policy/stack-policy.json` existed, "never applied" was a paragraph in an
ADR — exactly the class of guardrail this tab replaces. Every stack now carries
a classification:

| Stack | Account | Apply | In drift plan |
|---|---|---|---|
| `00-bootstrap` | workload `699475944323` | allowed | yes |
| `05-org-structure` | management `851725512267` | gated | no |
| `10-account-baseline` | workload | allowed | yes |
| `15-member-account` | management | **forbidden** | no |
| `20-site` | workload | allowed | yes |

`scripts/check-stack-policy.sh` fails the gate when a stack has no entry (a new
stack must be classified by a human, not defaulted), when a `forbidden` entry
lacks a substantive reason and an ADR citation, when a `forbidden` stack is put
in the drift plan or declares a backend, and when any workflow applies or
destroys one.

It does **not** try to intercept a human typing `terraform apply` in that
directory. Nothing in a repo can, and claiming otherwise would be worse than
saying so. The controls that do hold: CI has no apply job at all, drift never
plans it, the deploy role is scoped to the workload account while that stack
targets management, and flipping the entry is a reviewable one-line diff that
fails the gate unless a new ADR entry comes with it.

### Why drift skips two stacks

Both exclusions exist to stop the nightly job being red for a reason nobody
should act on — which is how the one real drift alert gets ignored:

- `15-member-account` has no state and never will, so every resource reads as
  missing. Permanent "drift".
- `05-org-structure` targets the management account. CI authenticates as the
  workload deploy role and cannot read Organizations, so the plan simply errors.

Skips are printed with their reason on every run, never silent.

## Credentials in CI

The active Forgejo workflow has **no AWS credential and no AWS-touching job**.
That is the safety control: the runner host carries a `PERSONAL_ROOT` profile,
and an SDK fallback to it would silently run as root against the management
account. Credential-free Terraform validation uses mocked providers and
`-backend=false` in an isolated `TF_DATA_DIR`.

`scripts/ci-assume-role.sh` remains a prepared fail-closed wrapper for a future
publicly verifiable Actions OIDC issuer: it scrubs environment/profile/IMDS,
requires a web-identity token, and refuses any account other than
`699475944323`. It is not invoked by Forgejo because AWS cannot validate that
private issuer. No long-lived CI key fallback is accepted.

## What is not wired yet, and why

| Blocked | Needs |
|---|---|
| keyless scheduled plan/drift | a publicly reachable OIDC issuer; GitHub Actions OIDC is the documented target, but GitHub dispatch is billing-blocked |
| CI tfvars | non-secret per-stack values materialised only when keyless live plans exist; tracked backend configs already contain no secrets |
| apply job | not planned; applies stay operator-run and policy-gated |

Local scoped plans are executable today: stacks 00 and 10 were both proven at
exit 0 through `proso-deploy` on 25/08/2026. `scripts/drift-check.sh` remains the
read-only multi-stack entrypoint; it is not represented as scheduled until it
can really authenticate.

## Known follow-up

`actions/checkout@v4` is a mutable tag resolved through Forgejo's action
registry, so a moved tag could alter the workspace before the gate runs.
Pinning to a commit SHA (`uses: https://code.forgejo.org/actions/checkout@<sha>`)
is the fix. Do it only with a live Forgejo run proving that exact SHA resolves;
a syntactically valid but unavailable pin disables the whole gate.

## Adding a stack

Nothing to register. `scripts/gate.sh` discovers every directory containing a
`.tf` file, so a new `stacks/NN-name/` is gated from its first commit. It needs
a `*.tftest.hcl` (ADR-001 §4.7) — see `policy/fixtures/compliant/main.tftest.hcl`
for the credential-free mock-provider pattern that keeps `terraform test`
runnable with no AWS access.
