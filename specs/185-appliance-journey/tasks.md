# Tasks — Feature 185

| ID | Task | Status |
|---|---|---|
| T001 | Confirm the appliance is reachable and ready over the tailnet | done |
| T002 | Run `local-host-live.test.ts` against the real appliance (adapter level) | done — PASS 3.5s |
| T003 | Add `LOCAL_HOST_APPLIANCE_URL` opt-in to the journey gate | done |
| T004 | Pre-flight `/health`; BLOCKED (not FAIL) when hardware is unreachable | done |
| T005 | Swap the appliance-mode observation to the audible outcome; record the relaxation | done |
| T006 | Run the gate against real hardware end to end | done — PASS, build `1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3` |
| T007 | Re-run all three journey plants **in appliance mode** — each must FAIL | done — 3/3 caught |
| T008 | Re-run fixture mode unplanted — observation must be unchanged | done — `130 chars, voice en_US-ljspeech-medium` |
| T009 | Spec/plan/tasks tracked in the same diff | done |
| T010 | `make verify` exit 0; different-family review; merge | done |

## Not closed by this feature

- The doorhanger relaxation (`extensions.webextOptionalPermissionPrompts=false`)
  is unchanged — slice #27.
- The appliance's 2s-latency clause at paragraph granularity — slice #9.
- The seam decision (extension-direct vs server-side adapter) remains Pedro's.
