# Plan — Feature 185

## Constitution check

Test harness only. No product code, no schema, no permissions change, no
credential, no deploy. The extension source is untouched; the shipped artifact
is byte-identical.

## Approach

1. Add `LOCAL_HOST_APPLIANCE_URL` as an opt-in. Default (unset) must be
   byte-identical to today's behavior — verified by re-running fixture mode,
   not assumed.
2. Keep the fixture serving the article and standing in for the managed
   endpoint. Only the synthesis host moves to hardware, so the
   zero-managed-requests assertion keeps working and a wrong fallback is
   still caught locally.
3. Pre-flight `GET /health` before Firefox launches; `blocked()` on
   unreachable hardware so an off appliance is never read as a product defect.
4. Swap the observation in appliance mode to the audible outcome, and record
   in the receipt's `relaxations` that this is weaker than inspecting a
   request body.

## Why the observation had to change

The fixture-mode assertion reads the synthesis request body out of the
fixture's own log. Real hardware has no such log exposed to the gate, so the
same assertion would have been unimplementable — and faking it (e.g. polling
the appliance for recent requests) would add a trust dependency on the thing
under test.

The audible outcome is what remains, and it is sound here for a specific
reason worth stating: the only other audio source the product ever had was
browser `speechSynthesis`, removed in `9797dc6`. With the managed route
observed at zero requests, nothing else can have produced playback.

## Falsification

The mode is only worth citing if it can go red. All three journey plants were
re-run **in appliance mode** (not just fixture mode) and each failed with the
assertion that guards it. Fixture mode was re-run unplanted and still reports
its original `130 chars, voice en_US-ljspeech-medium` receipt.

## Reversal

`git revert <squash-merge-sha>` — one PR, one file plus specs. The env var is
opt-in, so a revert cannot break any existing caller.
