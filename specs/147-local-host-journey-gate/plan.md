# Feature 147 — Plan

## Constitution check

| Principle | Effect on this plan |
|---|---|
| I (local destination, v2.1.0) | The gate must not weaken any of the four conditions. It seeds **no** local-host state: the actor types the address, and the grant is a real click on the product's own control. The fixture host is deliberately **not** CORS-enabled, so the journey cannot pass without the permission that makes it work in the product. |
| INV-001 (free tier needs no account) | The gate's negative assertion — zero requests to `/api/v1/tts/synthesize` — is what turns INV-001 from a claim into an observation. |
| Ports/adapters | The three fixes touch wiring (`handlers/`, `entrypoints/`), plus one adapter policy hole. No port contract changes. |
| Fail-closed | Every fix makes a path stricter, never more permissive: the local route reports its own failure instead of borrowing the server's. |

## Approach

Reuse over rebuild. The sibling gate already implements the actor vocabulary
(Unified Extensions button, browser action by visible label, popup control by
accessible name). Extract those primitives into `scripts/lib/firefox-popup.mjs`
so both gates share one copy — the repo has a duplication ratchet, and a second
600-line copy would be the wrong answer to it. The extraction must leave
`public-actor-gate` byte-for-byte equivalent in behavior, proven by re-running
it and its plant sweep.

The fixture server already serves the article and the managed API stub; teach it
the appliance wire contract too, recording local requests into a separate array.
One process, two surfaces, and the array a run fills is the verdict.

Accessible names get one genuine improvement: a control's name is its
`aria-label` when it has one and its own text when it does not. The popup's
"Grant access" button is named only by its text, and a screen reader announces
it — so the harness must be able to address it the same way.

## Sequence

1. Extract the shared primitives; prove the sibling gate and its plants are
   unchanged.
2. Teach the fixture the host wire contract (WAV generated in-process, no new
   binary fixture; duration tracks input length so pause/resume are observable).
3. Write the gate. Run it. Let it fail — its first job is to tell the truth
   about `main`.
4. Diagnose each failure from the gate's own evidence, fix the root cause, and
   re-run. Repeat until the reader's own host serves the article with zero
   managed requests.
5. Prove falsifiability: plant sweep plus a source-level revert of the
   load-bearing fix.
6. Record the outcome in the ledger, including what the gate still does not
   prove.

## Risks

- **The gate could pass for the wrong reason.** Mitigated by the negative
  assertion (zero managed requests) and by the `server-route` plant, which
  reproduces the PROSO-135/136 shape and must go red.
- **A green run with a dead runner.** Mitigated by BLOCKED as a distinct
  verdict, verdict-line scoring, and the CRASH self-check.
- **Refactoring a load-bearing gate.** Mitigated by re-running
  `public-actor-gate` after the extraction.
