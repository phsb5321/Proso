# Tasks — Feature 097

## Audit

- [x] Confirm PR #82 merged Feature 095 as `f217211` before the Product handoff.
- [x] Preserve the stale 095 and historical 096-ledger worktrees unchanged.
- [x] Classify the Firefox diagnostic correction and active-document
  contradictions as post-merge deltas.
- [x] Review Feature 093/096 acceptance against the merged contract and deliver
  the BLOCK findings through `/tmp/proso-product-acceptance-review-20260802.md`.

## Implement

- [x] Add explicit falsifiers to every merged Feature 095 outcome.
- [x] Correct the BYOK proxy oracle.
- [x] Correct README, AGENTS, delivery-harness, and evidence-ledger claims.
- [x] Register the canonical merged spec in the active-doc manifest.
- [x] Add the Feature 097 spec, plan, tasks, and Analyze checklist.

## Verify and deliver

- [x] Run `make docs`, contradiction searches, and `git diff --check`.
- [x] Run the proportional active-document and SpecKit prerequisite gates.
- [ ] Obtain a clean non-OpenAI review and resolve every finding.
- [ ] Commit, push, open the safe docs PR, wait for checks, squash-merge, and
  confirm `state=MERGED`.

## Reversal

One-line rollback after merge: `git revert <097-squash-sha>`.
