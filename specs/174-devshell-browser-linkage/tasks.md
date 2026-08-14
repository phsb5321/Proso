# Tasks — Feature 174

| ID | Task | Status |
|---|---|---|
| T001 | Identify the version conflict (`nss` 3.112.5 vs `libxul` needing `NSS_3.113`) | done |
| T002 | Switch `shell.nix` to `nss_latest` in buildInputs + LD_LIBRARY_PATH | done |
| T003 | Add `scripts/browser-linkage-check.mjs` (startup, not presence) | done |
| T004 | Add `make browser-linkage`; gate `smoke-reading` + `public-actor-gate` | done |
| T005 | Falsify: broken env FAILs naming NSS, fixed env PASSes | done |
| T006 | Rerun Firefox + Chromium acceptance inside `nix-shell` | done |
