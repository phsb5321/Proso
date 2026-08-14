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
