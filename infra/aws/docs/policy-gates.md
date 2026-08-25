# Policy gates — how this repo is kept honest

ADR-001 §4 lists seven guardrails. Four of them are only worth the words if a
machine enforces them, and this is that machine. Read the ADR first; this
document is the operational half.

## One entrypoint

```bash
nix develop -c scripts/gate.sh
```

CI runs that exact command. There is no CI-only policy, no extra flag the
pipeline passes, and no stage that exists in one place and not the other — so
"it passed locally" and "it passed in CI" are the same claim rather than two
similar ones.

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

Run one stage with `scripts/gate.sh --stage <name>`.

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
nix develop -c scripts/falsify-gates.sh
```

A green pipeline means one of two things — everything is safe, or nothing is
being checked — and they look identical from outside. An empty repository, a
mis-scoped `skip-path`, a renamed flag that silently disables a scanner, a
`--soft-fail` someone added to unblock a release: each produces a green tick.

Five assertions distinguish the two, and CI runs them on every push so the proof
is current rather than a screenshot from the day it was built:

| | Assertion |
|---|---|
| A | Trivy flags the committed FAIL fixture |
| B | Checkov flags the committed FAIL fixture |
| C | planting a public S3 bucket in a scanned path turns the pipeline RED; removing it returns GREEN |
| D | the ratchet rejects an undocumented suppression, **and** an accepted check re-used on a different resource |
| E | `terraform test` fails when the module regresses |
| F | the secret scanner flags a planted credential |
| G | the stack policy rejects an unclassified stack, a never-apply stack in the drift plan, and a workflow that applies one |

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
hook protects nothing. The security gate is enforced server-side, where
`--no-verify` does not reach.

## CI

`.forgejo/workflows/terraform-ci.yml`, on the self-hosted Forgejo runner.
GitHub Actions is blocked at the dispatch layer for this account and bills real
money once restored; `.forgejo/workflows/` is a path GitHub ignores, which is
the cost control.

Jobs run on the `:host` labels (`[self-hosted, Linux, X64]`) so `nix develop`
uses the host store and every job runs the binaries pinned in `flake.lock`. The
container label would mean re-installing the toolchain from the internet at an
unpinned version on every run.

`.forgejo/workflows/terraform-drift.yml` runs `scripts/drift-check.sh` nightly
at 04:00 BRT. Read-only by construction: `plan` only, `-lock=false`, no apply
path. Exit 2 means drift and fails the job on purpose — a green tick next to
"drift found" is how drift gets ignored for three weeks.

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

`scripts/ci-assume-role.sh` wraps every AWS-touching command. It does two things
before running anything:

1. **Scrubs the ambient credential chain** — `AWS_ACCESS_KEY_ID`, the session
   token, `AWS_PROFILE`, and the shared config/credentials files (pointed at
   `/dev/null`), plus IMDS. This is the control, not defence in depth: the
   runner host carries a `PERSONAL_ROOT` profile holding literal root keys for
   `arn:aws:iam::851725512267:root`. Without scrubbing, the SDK's default chain
   would fall back to it and the job would run as **root against the management
   account**, succeeding silently — the worst available outcome, and exactly
   what ADR-001 §4.3 forbids.
2. **Verifies the assumed identity** is in Sandbox-Account `699475944323` and
   exits otherwise. A trust policy pointing at the wrong account otherwise
   produces a perfectly good plan against the wrong infrastructure, and nothing
   in plan output says which account it ran in.

The token itself is minted from Forgejo's OIDC endpoint (`permissions:
id-token: write`) into `$RUNNER_TEMP` under `umask 077` and deleted on exit. No
long-lived key exists anywhere in this pipeline.

## What is not wired yet, and why

| Blocked | Needs | Owner |
|---|---|---|
| `plan` + `drift` jobs | `AWS_ROLE_TO_ASSUME` — an OIDC deploy role in Sandbox-Account 699475944323, trusting this Forgejo issuer | Account Foundation tab |
| drift actually planning anything | per-stack `<env>.tfvars` (and `<env>.s3.tfbackend` where the stack uses a partial backend), following each stack's own README convention. These are gitignored — §4.5 — so CI must materialise them from Forgejo secrets. `scripts/drift-check.sh` names the exact missing file per stack and fails rather than skipping. | Pedro / Account Foundation tab |
| CI running at all | a git remote; this repo has none, so nothing mirrors to Forgejo | Pedro |
| `apply` job | a budget alarm first (ADR-001 §4.2), then an explicit `workflow_dispatch` with manual approval | Account Foundation tab, then Pedro |

There is no window where the drift job is permanently red waiting on that
config: the job is gated on `AWS_ROLE_TO_ASSUME`, so it does not run at all
until the role exists, and whoever provisions the role provisions the tfvars.

The plan and drift jobs are guarded on `vars.AWS_ROLE_TO_ASSUME` rather than
commented out, so they start working the moment the role exists and stay
visibly pending until then. Everything up to and including the OIDC handshake is
unexercised until that role exists — the gate and falsification jobs are the
parts proven today.

## Known follow-up

`actions/checkout@v4` is a mutable tag resolved through Forgejo's action
registry, so a moved tag could alter the workspace before the gate runs.
Pinning to a commit SHA (`uses: https://code.forgejo.org/actions/checkout@<sha>`)
is the fix. Deliberately not done here: it cannot be verified without a live
Forgejo run, this repo has no remote yet, and shipping an unverifiable SHA that
breaks every workflow is worse than the risk it removes. Do it in the same
change that first proves CI runs.

## Adding a stack

Nothing to register. `scripts/gate.sh` discovers every directory containing a
`.tf` file, so a new `stacks/NN-name/` is gated from its first commit. It needs
a `*.tftest.hcl` (ADR-001 §4.7) — see `policy/fixtures/compliant/main.tftest.hcl`
for the credential-free mock-provider pattern that keeps `terraform test`
runnable with no AWS access.
