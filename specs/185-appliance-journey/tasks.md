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
| T011 | Review finding (blocking): the appliance-mode observation was footer+highlight — drawn BEFORE synthesis and surviving the error path, so it carried no audio evidence, and duplicated the later `playing` wait. Now waits on the popup's "Pause" (`status: 'playing'`), which a failed decode never reaches | done |
| T012 | Review finding (blocking): the attribution line printed BEFORE the managed-route assertion, so both plants printed "real appliance" while the fixture served the audio. Split into decode → assert → attribute; measured 0 occurrences under both plants | done |
| T013 | Review finding (blocking): BLOCKED pre-flight hung forever (fixture socket held the event loop; `blocked()` only throws). Pre-flight moved before `startFixtureServer()`; verified exit 2 | done |
| T014 | Review finding: `host-down` + appliance mode silently tested the fixture path. Now BLOCKED as an invalid combination; still FAILs normally in fixture mode | done |
| T015 | Review findings (non-blocking): failure diagnostic no longer reports a misleading "0 local /v1/tts" in appliance mode; missing `/health` `version` prints `unreported` rather than `undefined` | done |

## Not closed by this feature

- The doorhanger relaxation (`extensions.webextOptionalPermissionPrompts=false`)
  is unchanged — slice #27.
- The appliance's 2s-latency clause at paragraph granularity — slice #9.
- The seam decision (extension-direct vs server-side adapter) remains Pedro's.
