# Feature 237 — Fail closed before adversarial review

## Problem

The receipt write/validate/review trust chain captures command substitutions
with `readonly VALUE="$(command)"`. Bash returns `readonly`'s success status
rather than the command substitution's failure, so `set -e` does not stop. With
a non-empty candidate, a missing or invalid gate receipt can still reach the
model command; failed hash/ref reads can also be trusted as empty values.

## Goal

Every trusted command substitution preserves its failure status, receipt
validation aborts before bundle construction or reviewer launch, and a permanent
isolated self-test proves both the model boundary and the unsafe-pattern ban.

## Requirements

- REQ-1: In receipt write, validate, and review scripts, separate every trusted
  command-substitution assignment from its `readonly` declaration.
- REQ-2: A missing receipt exits non-zero before any reviewer executable runs.
- REQ-3: The self-test rejects the unsafe declaration pattern across the trust
  chain, then uses an isolated temporary Git repository, a non-empty candidate
  diff, and a fake reviewer marker; it never calls a provider.
- REQ-4: The self-test rejects both a touched marker and failure for any reason
  other than the expected missing-receipt message.
- REQ-5: `make adversarial` runs this self-test before the real typed review.
- REQ-6: A verdict must copy each canonical requirement exactly and provide
  meaningful, concrete file-path evidence; schema-valid placeholder prose fails.

## Acceptance

`make adversarial-self-test` prints PASS. Reverting the split assignment makes
the test fail because the fake reviewer marker is touched; a long but generic
fake verdict fails the semantic validator after reviewer launch.
