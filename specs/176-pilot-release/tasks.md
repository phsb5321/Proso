# Tasks — Feature 176

| ID | Task | Status |
|---|---|---|
| T001 | Establish real deploy state: Dokku live at `e6b412f`, 66 files of drift, schema drift | done |
| T002 | Supply `LICENSE_KEY_SECRET` to `proso-api` from vault, `--no-restart` (host action; verified by `dokku-check`, not by this tree) | done |
| T003 | Prove the exact deploy path: `subscription-deploy-rehearsal` PASS at `9bd5b88` (16 phases) | done |
| T004 | Create release worktree + herdr workspace `w18` via supported `worktree open` | done |
| T005 | Release QA seat: verify-full, rehearsal, preflight plants, honest flake report | done |
| T006 | AWS seat: root-key evidence, blast radius, least-privilege rotation plan | done |
| T007 | Site seat: build parity, live diff, three publishing options, auto-update constraint | done |
| T008 | Verify the two live-site false claims independently against the running site | done |
| T009 | Record the AWS-premise and blast-radius corrections rather than quietly proceeding | done |
| T010 | Paddle onboarding → 5 real values | **[pending] Pedro** |
| T011 | `make dokku-deploy` once T010 lands; prove via `/health.revision` | blocked by T010 |
| T012 | Publish the corrected site (recommend option c) | **[pending] Pedro** — needs a decision |
| T013 | Root-key rotation, disable → 7d grace → delete | **[pending] Pedro** — credential surgery |
| T014 | Re-enable versioning + Object Lock on `nixos-desktop-backups` (root-only, before T013 deletion) | **[pending] Pedro** |
| T015 | `.gitleaksignore` fingerprint for the historical test-fixture blob (QA caveat A) | open |
| T016 | Tokenize or baseline raw `z-index:9999` in `server-status-popover-gate.mjs` (QA caveat B) | open |
