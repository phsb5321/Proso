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
cannot, so the appliance-mode assertion is the **audible outcome**: the page
reaches a visible reading state, which only happens once audio decodes and
plays. Paired with the unchanged zero-managed-requests assertion — and with
browser `speechSynthesis` removed in `9797dc6` — the appliance is the only
source those bytes can have.

This is a weaker observation than reading the request body, and the receipt
says so in its `relaxations` rather than implying the two modes prove the same
thing.

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
ok  the reader's own host synthesized the article — real appliance, audible reading state reached
ok  the managed route was never called — 0 requests to /api/v1/tts/synthesize
ok  visible reading UI reached the page — body padding 80px
local-host-journey-gate PASS (real appliance)                          exit 0
```

The voices are the appliance's own (`en_US-ljspeech-medium`,
`pt_BR-faber-medium`), which is the detail that makes the run hard to fake:
the fixture publishes the same contract, but this run was pointed at the
tailnet address and the capabilities came back from the hardware.

Plants, appliance mode, each applied alone:

| Plant | Verdict |
|---|---|
| `server-route` (force the provider back to managed) | FAIL — managed route called 1x |
| `no-enable` (store the address, never enable) | FAIL — managed route called 1x |
| `host-down` (dead port) | FAIL — "Test connection" did not reach the reader's host |

Fixture mode re-run after the change: PASS, `130 chars, voice
en_US-ljspeech-medium` — the original observation, intact.

## Not in scope

- The seam decision (extension-direct vs server-side `AudioApplianceTTSAdapter`)
  recorded in the ledger. This changes a test harness, not the product route.
- The optional-permission doorhanger, still suppressed by the same pref.
