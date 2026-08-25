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
| `fmt` | `terraform fmt -check -recursive` | formatting drift |
| `validate` | `terraform validate` | broken references, bad types |
| `tflint` | tflint + AWS ruleset | correctness: deprecated syntax, invalid ARNs, dead declarations |
| `trivy` | `trivy config` | safety (Trivy replaces the deprecated tfsec) |
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
| D | the ratchet rejects an undocumented suppression |
| E | `terraform test` fails when the module regresses |

A and B scan a **copy** of the fixture from outside the repo. Both scanners
auto-discover config from the working directory, and both configs skip that
directory — in place they would report "not scanned" and the assertion would
pass for the wrong reason.

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

## What is not wired yet, and why

| Blocked | Needs | Owner |
|---|---|---|
| `plan` job | `AWS_ROLE_TO_ASSUME` — an OIDC deploy role in Sandbox-Account 699475944323 | Account Foundation tab |
| CI running at all | a git remote; this repo has none, so nothing mirrors to Forgejo | Pedro |
| `apply` job | a budget alarm first (ADR-001 §4.2), then an explicit `workflow_dispatch` with manual approval | Account Foundation tab, then Pedro |

The plan and drift jobs are guarded on `vars.AWS_ROLE_TO_ASSUME` rather than
commented out, so they start working the moment the role exists and stay
visibly pending until then.

They must never fall back to the `PERSONAL_ROOT` profile. That profile is
`arn:aws:iam::851725512267:root` — literal root credentials, which ADR-001 §4.3
reserves for exactly one operation and which account MFA does not protect.

## Adding a stack

Nothing to register. `scripts/gate.sh` discovers every directory containing a
`.tf` file, so a new `stacks/NN-name/` is gated from its first commit. It needs
a `*.tftest.hcl` (ADR-001 §4.7) — see `policy/fixtures/compliant/main.tftest.hcl`
for the credential-free mock-provider pattern that keeps `terraform test`
runnable with no AWS access.
