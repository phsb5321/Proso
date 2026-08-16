# Tasks — Feature 175

| ID | Task | Status |
|---|---|---|
| T001 | Establish that `main` is green and the `tsc` errors are a stale artifact, not broken source | done |
| T002 | Locate the gap: `delivery-doctor.sh:25` tests existence, never freshness | done |
| T003 | Add `scripts/prisma-schema-digest.mjs` | done |
| T004 | Stamp the digest from `generate-prisma.sh`, on both the native and NixOS fallback paths | done |
| T005 | Compare the stamp in `delivery-doctor.sh`; fail closed when it is absent | done |
| T006 | Falsify: drift RED, missing stamp RED, restored GREEN, baseline GREEN | done |
| T007 | `make verify` on the branch | done |
| T008 | Record the Actions outage diagnosis + this fix in `docs/reading-journey-status.md` | done |
| T009 | Run the different-family adversarial gate; verify its three findings against the code | done |
| T010 | Add `scripts/quality/review-metadata.mjs`; reject absent, malformed and impossible review dates and blank ownership | done |
| T011 | Apply it in `knip-ratchet.mjs`, `osv-ratchet.mjs`, `check-active-docs.mjs` | done |
| T012 | Default the gate-receipt base to `origin/main` instead of skipping the check | done |
| T013 | Falsify all four: absent/malformed/impossible expiry, blank ownership, `HEAD^` receipt | done |
| T014 | Re-run `make verify-full` and the adversarial gate | done |
| T015 | Round 2: pin the adversarial base to `origin/main` so an inherited `DIFF_BASE_REF` cannot select it | done |
| T016 | Falsify through the whole path: `DIFF_BASE_REF=HEAD^ make adversarial` must fail | done |
| T017 | Round 3: round-trip the receipt's `verifiedAt` instead of accepting any string | done |
| T018 | Falsify with four malformed timestamps, restoring green between each | done |
