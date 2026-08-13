# Feature 153 — Tasks

Status is evidence-based against the takeover run on 12/08/2026.

| ID | Task | State | Evidence |
|---|---|---|---|
| T001 | Audit every modified/untracked file from the failed seat and read the user-gate/delivery contracts | done | Dirty inventory captured; focused 59 tests, extension typecheck, and pre-change Firefox journey passed, exposing proof gaps rather than implementation red |
| T002 | Add `spec.md`, `plan.md`, and `tasks.md` with constitution trace | done | Files in this directory |
| T003 | Keep a previous key off the public validation request | done | Adapter test: candidate is body-only; configured key is absent from `X-License-Key`; Firefox receipt records all three validation headers as `none` |
| T004 | Serialize licence operations and make storage/adoption rollback atomic | done | Handler suite proves concurrent dispatch serialization, explicit-key readback, storage-before-live adoption, storage rejection, and old live key retention |
| T005 | Require paid entitlement plus authoritative subscription credits before success | done | Unit matrix rejects Free, missing managed entitlement, absent/negative/NaN/overdrawn balances; `subscription-free` and `subscription-no-credits` plants fail |
| T006 | Preserve the incumbent paid-account UI while hardening loading, errors, masking, and double-submit behavior | done | Labelled password field, live status, in-flight guard/ARIA state, masked reload; Impeccable detector returned `[]` and Firefox artifact reviewed |
| T007 | Open, close, and reopen settings through public Firefox controls | done | Receipt action trace repeats Unified Extensions → Proso → Open settings three times; fixed popup tab-create-before-close race found by the first BLOCKED run |
| T008 | Prove invalid and mid-confirmation network failures preserve the working key | done | Baseline rejects unknown key and post-validation confirmation 503, then reopens on Pro/412,500; overwrite plant fails on suffix `5000` |
| T009 | Prove falsifiability | done | `license-settings-plants PASS — 10 runs`; removing final live adoption made its focused source test red, then restoring returned green |
| T010 | Run focused tests, seeded fuzz, delivery gates, Firefox/Chrome builds, and adjacent local-host journey | pending | Commands and exit codes retained in delivery report |
| T011 | Obtain DeepSeek Sentinel review and resolve all blocking findings | pending | Different-family verdict with file/line traces |
| T012 | Commit, rebase onto `origin/main`, push, and open PR without merging | pending | Remote branch and PR URL; PR remains OPEN |
