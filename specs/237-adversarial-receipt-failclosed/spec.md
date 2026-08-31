# Feature 237 — Fail closed before adversarial review

## Problem

`adversarial-review.sh` captures the receipt validator with
`readonly VALUE="$(command)"`. Bash returns `readonly`'s success status rather
than the command substitution's failure, so `set -e` does not stop. With a
non-empty candidate, a missing or invalid gate receipt can still reach the model
command.

## Goal

Any receipt-validation failure aborts before bundle construction or reviewer
launch, and a permanent isolated self-test proves the model boundary stays
unreached.

## Requirements

- REQ-1: Preserve the validator's non-zero status by separating assignment from
  the `readonly` declaration.
- REQ-2: A missing receipt exits non-zero before any reviewer executable runs.
- REQ-3: The self-test uses an isolated temporary Git repository, a non-empty
  candidate diff, and a fake reviewer marker; it never calls a provider.
- REQ-4: The self-test rejects both a touched marker and failure for any reason
  other than the expected missing-receipt message.
- REQ-5: `make adversarial` runs this self-test before the real typed review.

## Acceptance

`make adversarial-self-test` prints PASS. Reverting the split assignment makes
the same test fail because the fake reviewer marker is touched.
