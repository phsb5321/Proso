# Feature 185 — prove the account-free journey against the REAL appliance

Date: 17/08/2026

## Problem

Two receipts existed for the reader-operated synthesis host, and neither one
proved the thing a user actually does.

| Receipt | What it proves | What it does not |
|---|---|---|
| `tests/integration/local-host-live.test.ts` | The **real appliance** synthesizes real audio | Nothing above the adapter — no browser, no popup, no click |
| `scripts/local-host-journey-gate.mjs` | The **whole browser journey** — settings, grant, Play, highlight | The host is a fixture speaking the appliance's wire contract, not hardware |

The gate said so itself, in its own receipt:

> "The synthesis host is a local fixture speaking the appliance's wire
> contract, not the appliance itself."

So no single run had ever shown a real Firefox, driven through public
controls, reading an article out of the real Orange Pi. The join was assumed
from two halves that each stopped short of it.

## What this adds

`LOCAL_HOST_APPLIANCE_URL` points the reader's own host at real hardware.
Unset, the gate behaves exactly as before (fixture mode, byte-identical
observation — verified by re-running it).

The fixture does not go away in appliance mode. It still serves the article,
and it still stands in for the **managed** endpoint, so a wrong fallback is
recorded locally instead of escaping to the production API. Only the synthesis
host changes.

## The observation has to change with it, honestly

A fixture can be asked what it received. Real hardware is off-process and
cannot, so appliance mode needs a different observation — and the first draft
of this feature picked the wrong one.

**Corrected after review.** The draft asserted the *visible reading state*
(footer + first highlight) and claimed in a code comment that it "only happens
once audio decodes and plays". That is false: `PlaybackService` calls
`showFooter` and `highlightParagraph(0)` at `playback-service.ts:157-181`,
**before** any synthesis request, and both survive the error path. The draft
also polled the identical predicate the pre-existing `playing` wait re-checks
fifteen lines later, so it added no signal at all.

The observation is now the popup announcing **"Pause"** — `status: 'playing'`,
which only `finalizeParagraphPlayback` sets, and which a failed
`audioElement.play()` short-circuits before reaching
(`playback-service.ts:1086-1089`). That is a genuine decoded-and-playing
signal.

Attribution is a separate question from decoding, and the draft conflated
them. "Audio played" does not say *whose* audio: under the `server-route`
plant the managed fixture plays perfectly well. So the run now records the two
facts in the order it earns them:

1. `audio decoded and played (source not yet attributed)`
2. `the managed route was never called — 0 requests`
3. → `the reader's own host synthesized the article — real appliance`

Step 3 is printed only after step 2, so a run that falls back to the managed
route can never print an appliance attribution. It is still a weaker
observation than reading the request body, and the receipt says so in its
`relaxations`.

## Unreachable hardware is BLOCKED, never FAIL

The run pre-flights `GET /health` before launching Firefox. An appliance that
is powered off, unplugged, or off-tailnet is not a product defect, and a run
that cannot reach it must not be readable as one.

## Acceptance

- Appliance mode PASSes against real hardware, and the receipt names the
  appliance and its build revision.
- Fixture mode is unchanged (same assertion, same observation).
- The plants still catch severed journeys **in appliance mode** — a gate that
  only goes green is not evidence.
- Unreachable hardware reports BLOCKED.

## Measured — 17/08/2026, appliance `orangepi4pro-b.tailf59220.ts.net`

```
ok  real appliance pre-flight — ready, build 1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3
ok  actor entered their own host address — https://orangepi4pro-b.tailf59220.ts.net
ok  the reader's host answered its capabilities — Connected — 2 voice(s) found.
ok  the background adopted the host as the audio route — en_US-ljspeech-medium
ok  audio decoded and played (source not yet attributed)
      — popup announced "Pause" — a failed decode never reaches this state
ok  the managed route was never called — 0 requests to /api/v1/tts/synthesize
ok  the reader's own host synthesized the article
      — real appliance — audio played, managed route at zero
ok  visible reading UI reached the page — body padding 80px
local-host-journey-gate PASS (real appliance)                          exit 0
```

The voices are the appliance's own (`en_US-ljspeech-medium`,
`pt_BR-faber-medium`), which is the detail that makes the run hard to fake:
the fixture publishes the same contract, but this run was pointed at the
tailnet address and the capabilities came back from the hardware.

Plants, appliance mode, each applied alone:

| Plant | Verdict | Attribution line printed? |
|---|---|---|
| `server-route` (force the provider back to managed) | FAIL — managed route called 1x | **0 occurrences** |
| `no-enable` (store the address, never enable) | FAIL — managed route called 1x | **0 occurrences** |
| `host-down` | **BLOCKED** — refuses to run in appliance mode | n/a |

The attribution column is the review finding made measurable: before the fix
both plants printed `the reader's own host synthesized the article — real
appliance` while the *fixture* served the audio. Now neither does.

`host-down` is BLOCKED rather than run, because `hostAddress` replaces the
appliance URL with a dead port for that plant — so it never exercises the
appliance and would have been a fixture-mode result wearing an appliance-mode
label. It still runs normally in fixture mode (FAIL, verified).

Fixture mode re-run after the change: PASS, `130 chars, voice
en_US-ljspeech-medium` — the original observation, intact.

Unreachable hardware: `LOCAL_HOST_APPLIANCE_URL=http://localhost:9` → BLOCKED,
**exit 2**. The draft wrote the BLOCKED receipt and then hung forever, because
`blocked()` throws and the already-listening fixture socket held the event loop
open; the pre-flight now runs before the fixture starts.

## Not in scope

- The seam decision (extension-direct vs server-side `AudioApplianceTTSAdapter`)
  recorded in the ledger. This changes a test harness, not the product route.
- The optional-permission doorhanger, still suppressed by the same pref.
