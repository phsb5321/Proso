# Plan — Feature 177

## Constitution check

Site copy plus documentation. No product code, no schema, no permissions, no
credentials, no AWS resource, no DNS change. One repository setting
(`pages.build_type`) was changed during investigation and restored to its
original value; the live site and the auto-update manifest are byte-identical
to their pre-work state.

## Approach

1. Measure the claim rather than assume it: `POST /api/v1/tts/synthesize`
   against the live API returns 402 with a message naming the two free paths.
2. Rewrite the one false sentence to match that message. Leave the pricing table
   alone — it was already correct.
3. Verify the whole built tree, not just the edited file, for the three known
   false-claim strings.
4. Re-run `checkout-surface-gate` so the copy edit cannot have disturbed the
   fail-closed money invariant.

## Publishing: what was tried and what it proved

The branch-based Pages path was attempted in full because it looked like a $0,
no-Actions publish. The negative result is worth more than the attempt:

| Step | Result |
|---|---|
| Push built tree to `gh-pages` (`34760c5`) | pushed; `updates.json` + `releases/` unchanged in the diff |
| `PUT /pages` `build_type=legacy` | accepted, config reflected it |
| `POST /pages/builds` | `{"status":"queued"}` |
| Wait ~7 min, three pushes, one explicit trigger | **zero builds created**; newest build still 08/02/2026 |
| Restore `build_type=workflow` | done — original state |

A `queued` response with no resulting build is the same signature as the Actions
outage: the request is accepted and never scheduled. This is account-level
metering, not a misconfiguration, so it is not fixable from inside the
repository.

## What this leaves

`gh-pages` holds the correct site with the auto-update files preserved
byte-identically. Publishing needs one of: Actions restored (spending limit, next
billing cycle, or making the repo public), or the tree served from a host that
is not metered — the existing Dokku host already terminates TLS for
`api.proso.com.br` through a Cloudflare tunnel and is the cheapest such option.

## Falsification

- The 402 was measured live, not read from a doc.
- The auto-update lifeline was verified by hash before and after: live
  `updates.json` is `46c5ea74…` in both states, and both manifest `update_hash`
  values match their `.xpi` bytes.
- The publish failure was demonstrated three times, including an explicit API
  trigger, before being called account-level rather than transient.
