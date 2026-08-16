# Feature 177 — the site must not advertise what the product does not do

Date: 15/08/2026

## Problem

Two claims on `proso.com.br` are false, measured against the running product
rather than inferred from the repository:

| Claim | Reality |
|---|---|
| "Unlimited browser TTS" ×3 | Browser `speechSynthesis` was removed in `9797dc6` |
| "The free tier works immediately" | `POST /api/v1/tts/synthesize` returns **HTTP 402** |

```bash
curl -s -X POST https://api.proso.com.br/api/v1/tts/synthesize \
  -H 'Content-Type: application/json' -d '{"text":"probe","provider":"openai"}'
# HTTP 402
# {"error":"Managed TTS is not included in this tier. Attach your own provider
#   API key in settings (free on every tier), or use a local synthesis host you
#   run yourself."}
```

The first claim is only in the *deployed* artifact — the repository's own tree no
longer contains it, so publishing the current tree removes it. The second is
still in the tree at `packages/site/index.html:239` and is fixed here.

The server's 402 message is itself accurate and names the two real free paths, so
the site copy is aligned to it: bring your own provider key, or run your own
synthesis host. Both are genuinely free on every tier, which is what the pricing
table already says (Free lists "BYOK — your own API key, any provider" and marks
"Managed voices" excluded — that table was correct and is unchanged).

## Why the site is stale at all

Not a site-code defect. The live site is the artifact of the last successful
Pages deployment, `2026-08-01T21:01:57Z`. Every site-affecting commit since —
#151, #155, #165, #167 — merged *during* the Actions outage and never published.

## Publishing is blocked, and branch-based Pages does not route around it

The obvious workaround was to switch Pages from `build_type: workflow` (which
needs the dead Actions) to `legacy` (which builds from a branch). It was tried,
end to end, and it does **not** work on this account:

- the full built tree was pushed to `gh-pages` (commit `34760c5`), preserving
  `updates.json` and `releases/` byte-identically;
- `build_type` was switched to `legacy` with `source.branch: gh-pages`;
- `POST /pages/builds` returned `{"status":"queued"}`;
- **no build was ever created.** `/pages/builds` still reports its newest build
  as `2026-02-08T20:24:40Z`, across three pushes and one explicit trigger.

Pages builds are metered by the same account-level condition that stopped
Actions (see `docs/reading-journey-status.md`). `build_type` was therefore
restored to `workflow`, its original value, so the repository is not left in a
half-migrated state.

The site itself was never harmed: `proso.com.br` still answers 200 and
`updates.json` still hashes to `46c5ea74…`, byte-identical to what it served
before this work.

## The constraint any future migration must respect

`updates.json` and `releases/` are the extension auto-update lifeline —
`wxt.config.ts:101` hardcodes `https://proso.com.br/updates.json` — and both
manifest entries' `update_hash` values match their `.xpi` bytes today. A
migration that drops or rewrites them stops updates for every installed user
**with no visible error**, which is the worst failure mode available here.

The `gh-pages` branch now carries the correct, truthful site with those files
preserved. It publishes the moment publishing is unblocked, by either restoring
Actions or serving that tree from a host that is not metered.

## Acceptance

- `packages/site/index.html` no longer claims the free tier works immediately.
- The built tree (`packages/site` + `packages/legal`) contains zero occurrences
  of "Coming Soon", "browser TTS", or "free tier works immediately".
- `make checkout-surface-gate` passes, so the fail-closed money invariant
  (`clientToken: ''`, four empty price ids → buy controls disabled with a stated
  reason) is unchanged by the copy edit.
- Live `updates.json` remains byte-identical (`46c5ea74…`) and the xpi remains
  reachable at its `update_link`.
