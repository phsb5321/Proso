# Money path status

What happens today when someone tries to pay Proso. Audited 12/08/2026 against
`main` @ `087607c`, the live site at `https://proso.com.br`, and the deployed API
at `https://api.proso.com.br` (Dokku `proso-api`, `GIT_REV e6b412f`).

Companion to [`docs/reading-journey-status.md`](reading-journey-status.md), which
covers the reading outcome. This doc covers only the payment outcome.

Symbols: ✓ verified, ◐ partially verified, ✗ disproven as a delivery claim.
Every row carries the command or `file:line` that proves it. What is *not*
proven is listed in its own section rather than left implied.

## What a customer experiences today, end to end

A visitor reaches `https://proso.com.br/pricing.html`. Four tiers are shown with
real prices — Free $0, Basic $4.99, Pro $14.99, Multilingual $19.99, with an
annual toggle. The three paid cards do not offer a purchase: each renders a
disabled `Coming Soon` span (`pricing.html:104`, `:125`, `:146`). The only live
buttons are "Install Now" and an Enterprise `mailto:commercial@proso.com.br`.
So the site does not attempt to take money, and no visitor can spend money on it.

The free path the page does offer is also broken. Every install CTA on the live
site points at `https://github.com/phsb5321/Proso/releases`
(`index.html:90`, `index.html:102`, `pricing.html:42`, `pricing.html:83`), and
that URL returns **HTTP 404 to anyone who is not signed in as the owner**,
because the repository is private. A signed, installable XPI does exist and is
publicly reachable at `https://phsb5321.github.io/Proso/releases/…`, but nothing
on the site links to it.

Suppose a customer got past all of that and wanted to pay anyway. Every remaining
step is missing or inert:

- There is no checkout UI. `POST /api/v1/subscription/checkout` exists
  (`subscription.controller.ts:69`) and has no caller in the repository.
- Calling it directly returns `400 Authentication required for checkout`,
  unconditionally, for everyone — see the dead `req.userId` finding below.
- Even if it were reached, the Paddle adapter returns a hardcoded stub URL,
  `https://checkout.paddle.com/stub?…` (`paddle.adapter.ts:26`), which is not a
  Paddle checkout.
- Paddle is not configured on the deployed server: no `PADDLE_API_KEY`, no
  `PADDLE_WEBHOOK_SECRET`.
- The webhook that would grant the subscription cannot authenticate any request,
  because `verifyWebhookSignature` throws unconditionally
  (`paddle.adapter.ts:59`).
- No licence key is ever minted, anywhere in the server.
- The extension has no field to type one into.
- And the server never reads the `X-License-Key` header at all, because the guard
  that would read it is never registered.

The net: **no one can give Proso money through any surface Proso ships, and if
money did arrive by some out-of-band route, nothing in the system would convert
it into a working paid entitlement.** The paid tier is not a broken feature; it
is an unbuilt one with a substantial amount of code standing in for it.

## Evidence ledger

| Status | Claim | Evidence |
|---|---|---|
| ✓ | The pricing page states real prices and offers no way to buy | `packages/site/pricing.html` — four cards with prices and an annual toggle; the three paid cards end in `<span class="btn btn--secondary btn--disabled">Coming Soon</span>` (`:104`, `:125`, `:146`). Live: `curl -s https://proso.com.br/pricing.html \| grep -c "Coming Soon"` → `3`. The only non-`Coming Soon` CTAs are GitHub releases and `mailto:commercial@proso.com.br` (`:153`, `:221`) |
| ✗ | The site's install CTA reaches an installable build | `curl -s -o /dev/null -w "%{http_code}" https://github.com/phsb5321/Proso/releases` → **404** anonymously; `gh repo view --json visibility` → `PRIVATE`; `GET api.github.com/repos/phsb5321/Proso/releases` → `404 Not Found`. All four install CTAs point there. The reachable artifact — `https://phsb5321.github.io/Proso/releases/voxpage-1.1.3.xpi`, HTTP 200 — is linked from nowhere on the site (`grep -rn "\.xpi" packages/site/*.html` → 0 hits) |
| ✓ | A checkout endpoint exists and is unreachable from any UI | `subscription.controller.ts:69` `@Post('checkout')`. No caller: the extension's `createCheckout` is defined at `proso-api.adapter.ts:124` and called **only from tests** (`grep -rn "\.createCheckout(" packages/extension/src packages/site` → 0 hits; `packages/extension/tests/.../proso-api.adapter.test.ts:244` → 1 hit). The site ships one JS file, `assets/js/main.js`, with zero payment code (`grep -rni "paddle\|checkout\|stripe" packages/site/` → 0 hits) |
| ✗ | The checkout endpoint could succeed if it were called | It returns `400` for every caller. `subscription.controller.ts:75` reads `req.userId`, commented "userId is attached by the license key guard" — the guard never attaches it (`license-key.guard.ts:34` sets `request.licenseKey`, not `userId`). Live: `curl -X POST https://api.proso.com.br/api/v1/subscription/checkout -H 'X-License-Key: …' -d '{"tier":"pro"}'` → `400 {"message":"Authentication required for checkout"}` |
| ✗ | The `X-License-Key` header is read by the deployed server | `LicenseKeyGuard` is bound as `APP_GUARD` inside `AuthModule` (`auth.module.ts:8-11`), and **`AuthModule` is imported by nothing**: `grep -rn "AuthModule" packages/server/src packages/server/tests` returns only its own declaration (`auth.module.ts:13`). It is absent from `app.module.ts:6-13`. Live proof: `GET /api/v1/subscription` with **no** `X-License-Key` returns `200 {"tier":"free",…}` where the guard would have raised `401 Missing X-License-Key header` |
| ✗ | Paddle is configured on the deployed server | `ssh dokku@192.168.1.184 config:show proso-api` lists 11 variables (`DATABASE_URL`, `ELEVENLABS_API_KEY`, `GIT_REV`, `JWT_SECRET`, `LOG_LEVEL`, `LOKI_HOST`, `NODE_ENV`, `OPENAI_API_KEY`, `PORT`, `REDIS_URL`, `SENTRY_DSN`). No `PADDLE_API_KEY`, no `PADDLE_WEBHOOK_SECRET`. Both are read at `app.config.ts:39-40` and default to `''` |
| ✗ | The Paddle adapter integrates with Paddle | Every method is a stub. `createCheckoutUrl` returns the literal string `https://checkout.paddle.com/stub?tier=…&user=…` (`paddle.adapter.ts:22-27`); `getSubscription` returns `null` (`:29-38`); `cancelSubscription` logs and returns (`:40-48`); `verifyWebhookSignature` **throws `'Paddle webhook verification not implemented'` unconditionally**, even with a secret present (`:52-60`, throw at `:59`). No Paddle SDK dependency and no price IDs exist in the workspace (`grep -rn "price_" packages/ --include=*.ts --include=*.json` → 0 hits) |
| ✓ | The webhook is unreachable in production today | `PaddleWebhookGuard` requires a `paddle-signature` header (`paddle-webhook.guard.ts:27-29`) and then calls the throwing verifier, converting any outcome to `403 Invalid webhook signature` (`:42`). Live: `POST https://api.proso.com.br/webhooks/paddle` with a body and no signature → `403 {"message":"Missing Paddle signature header"}`. The route itself is registered (`billing.module.ts:23`) and `rawBody: true` is enabled (`main.ts:10`) |
| ◐ | The webhook creates a subscription and allocates credits | The code path exists — `webhook.controller.ts:93-129` saves a subscription then calls `creditRepository.createAllocation` when `TIER_CREDITS[tier] > 0`. It is proven only against mocks (`tests/unit/infrastructure/webhook.controller.spec.ts`), never against a database or a real Paddle delivery. Against the real schema it would fail: `Subscription.userId` is a foreign key to `User.id` (`prisma/schema.prisma:62`), and **no user row is ever created** — see the next row |
| ✗ | A paying customer gets a user record | `UserRepositoryPort.create` (`user-repository.port.ts:7`) is implemented at `prisma-user.repository.ts:25` and **called from nowhere**: `grep -rn "userRepository\." packages/server/src --exclude-dir=generated` yields exactly one line, `findByLicenseKeyHash` in `license-validation.service.ts:36`. The webhook takes `user_id` from Paddle `custom_data` (`webhook.controller.ts:241-247`) and throws if absent — it never creates the user it references |
| ✗ | A licence key is ever minted | `grep -rn "licenseKey.create\|createLicenseKey\|generateLicense\|issueLicense" packages/server/src --exclude-dir=generated` → 0 hits. Broader: `grep -rn "licenseKey\.\(create\|upsert\|update\)" packages/server/src --exclude-dir=generated` → 0 hits. `--exclude-dir=generated` is required and is not a way of hiding a hit: `packages/server/src/generated/` is the Prisma client, gitignored at `packages/server/.gitignore:5`, and its 4 + 9 matches are all JSDoc usage examples on `prisma.licenseKey.create*` (e.g. `generated/models/LicenseKey.ts:945`), never a call. The `LicenseKey` table exists in the schema (`prisma/schema.prisma:142-156`) and the only code that touches it is a read (`prisma-user.repository.ts:17`) |
| ✗ | A minted key would be retrievable even if minting existed | Two independent breaks. (1) `PrismaUserRepository.create` writes the hash to `User.licenseKey` (`:29`) while `findByLicenseKeyHash` reads `LicenseKey.keyHash` (`:17-22`) — **different tables**, so a user created through this repository is unfindable by key. (2) There is no delivery surface: no endpoint returns a key (`license.controller.ts` exposes only `POST validate`), no email is sent (no mailer dependency in `packages/server`), no account page exists |
| ✓ | `POST /api/v1/license/validate` answers, and answers `free` for any key | Live: `curl -X POST https://api.proso.com.br/api/v1/license/validate -d '{"licenseKey":"PROSO-AUDIT-0000-0000"}'` → `200 {"valid":false,"tier":"free","features":{"managedTts":false,…},"credits":{"total":0,…}}`. This is correct by INV-001 (`license-validation.service.ts:39-47`): an unknown key yields Free defaults rather than an error. It is also, today, the answer for **every** key, because no key is ever minted |
| ✗ | The extension has no licence-key plumbing | The plumbing is complete except for the UI. `licenseKey` is in the config schema (`utils/config/schema.ts:115`), the defaults (`utils/config/defaults.ts:44`, `null`), the storage read (`background/init-hexagonal.ts:79,89`), the container wiring (`composition/container.ts:49`), and the HTTP layer sends it as `X-License-Key` (`adapters/api/proso-api.adapter.ts:176-177`, `:256-257`) |
| ✓ | The extension has no licence-key **field** — no way for a user to enter one | `grep -rn "licenseKey" packages/extension/src/entrypoints/` → **0 hits**. The only "license" text in `settings.html` is prose at `:214` explaining the local host needs none. The key can only be set by editing `browser.storage.local` by hand |
| ✗ | The extension's subscription API surface is wired | Four methods are defined and called only from tests: `validateLicense` (`proso-api.adapter.ts:90`), `getSubscription` (`:98`), `createCheckout` (`:124`), `setLicenseKey` (`:86`). `grep -rn "\.validateLicense(\|\.getSubscription(\|\.createCheckout(\|\.setLicenseKey(" packages/extension/src` → **0 hits**; the same grep over `packages/extension/tests` → 14 hits. This is the repository's recurring dead-wiring shape, instances 7–10 |
| ✓ | Free tier is 0 managed credits by design, so a managed request correctly 402s | `TIER_CREDITS[Free] = 0` and `FEATURE_MATRIX[Free].managedTts = false` (`packages/shared/src/constants/tiers.ts:8`, `:19`); the gate is `tts.service.ts:155`. This is intended behavior, not a defect |
| ✗ | A paid tier would lift that 402 | It would not, because tier is derived from `req.userId` (`tts.controller.ts:76`, `:112-116`) and `req.userId` is permanently `undefined` (guard row above). Every request — key or no key — resolves to `SubscriptionTier.Free`, so `FEATURE_MATRIX[Free].managedTts === false` and `tts.service.ts:155` returns 402. **Paying would change nothing observable even if payment worked** |
| ✗ | The pricing page's Free-tier promise is deliverable | The Free card advertises "Unlimited browser TTS" (`pricing.html:73`), and the FAQ says the extension "automatically falls back to your browser's built-in text-to-speech engine" (`:182`) and repeats "unlimited browser TTS" (`:194`). Browser `speechSynthesis` was deliberately removed from the reading route (`AGENTS.md`, Firefox-First guideline 4). What survives is a `speakText` message case in `content.ts:1384-1430` that **no code sends**: `grep -rn "speakText" packages/extension/src packages/extension/tests` → 1 hit, the handler itself |
| ✗ | The tiers on the pricing page correspond to tiers the system can sell | The domain has three tiers — `free`, `pro`, `enterprise` (`packages/shared/src/domain/subscription.ts:3-7`, mirrored in `prisma/schema.prisma:10-14`). The page sells Basic and Multilingual, which exist nowhere in code (`grep -rni "basic\|multilingual" packages/shared/src packages/server/src` → 0 hits), and does not sell Enterprise as a tier (only a `mailto:`). `createCheckout` accepts only `Pro` and `Enterprise` (`subscription.controller.ts:80`), so two of the three advertised paid tiers are unbuyable by construction |
| ✗ | The advertised credit volumes match what the code would allocate | Page: Basic 100K, Pro 300K, Multilingual 300K chars/month (`pricing.html:97`, `:118`, `:139`). Code: `TIER_CREDITS` allocates Pro **500,000** and Enterprise 2,000,000 (`packages/shared/src/constants/tiers.ts:9-10`). The only tier present in both disagrees by 200K |
| ◐ | Webhook idempotency | Implemented as an in-process `Set` with eviction at 10,000 entries (`idempotency.service.ts:14`, bound at `:9`, evicting at `:30-36`), documented as "sufficient for single-instance deployments". It is tested with a duplicate `eventId` against a mock (`webhook.controller.spec.ts:181-187`), never with an actual duplicate delivery. Two properties are untested and false as written: the state is lost on every restart or redeploy, and eviction is FIFO by insertion order, not by recency, so a re-delivered old event past 10,000 events replays |
| ✗ | The webhook grants the tier the customer paid for | `extractTier` (`webhook.controller.ts:265-283`) looks for `custom_data.tier`, then `items[0].price.custom_data.tier`, and otherwise **returns `SubscriptionTier.Pro`** (`:282`). A subscription whose Paddle metadata is missing or misnamed silently grants Pro and `TIER_CREDITS[Pro] = 500,000`. Nothing validates the returned string against the enum before it reaches `subscriptionRepository.save` and `TIER_CREDITS[tier]`, so an unrecognised tier string yields a Prisma enum error (swallowed to 200) and a recognised-but-wrong one yields the wrong entitlement with no error at all |
| ✗ | The webhook binds the subscription to the right user | `extractUserId` (`webhook.controller.ts:241-259`) falls back to treating a non-JSON `passthrough` string as a raw user ID (`:254`). Any string Paddle sends becomes a `userId`, and it is written straight into a foreign-key column with no existence check. The resulting FK violation is caught and converted to `200` |
| ✗ | A webhook failure is visible to Paddle or to anyone | `webhook.controller.ts:74-85` catches every handler error, logs it, marks the event processed, and returns `200 {received: true}`. Paddle therefore stops retrying, and the event ID is blacklisted so a manual replay is a no-op. The comment at `:78-79` names the missing mitigation — "In production, dead-letter queue or alerting would handle this" — and no dead-letter queue or alert exists. The behavior is codified as intended by `webhook.controller.spec.ts:397` `'still marks event as processed even when handler throws'`. A customer who paid during such a failure has no subscription, no credits, no key, and no trace beyond one log line |
| ✗ | A Paddle transaction ID is a secret, and therefore a sufficient credential for licence retrieval | Paddle's own documentation puts the transaction ID in the URL the customer's browser navigates to. [Pass a transaction to a checkout](https://developer.paddle.com/build/transactions/pass-transaction-checkout/), §"Use checkout payment link", fetched 12/08/2026 (HTTP 200): the transaction's `checkout.url` "is made up of your default payment link, with a **`_ptxn` query parameter and the transaction ID appended**". A query parameter is not a secret: it lands in the address bar, browser and OS history, the `Referer` header sent to every third-party asset on the payment-link page, any analytics or session-replay script on that page, upstream proxy and CDN access logs, and any URL the customer copies or shares. Anyone who obtains a `txn_…` could then claim that purchase's key. This is a claim about the design space, not about shipped code — Proso mints no key today — and it binds the issuance work: see below |
| ✓ | The deployed server is healthy and current for its own package | `curl -s -o /dev/null -w "%{http_code}" https://api.proso.com.br/health` → `200`. `GIT_REV e6b412f`; per [`docs/health/deploy-status.md`](health/deploy-status.md) the commits since are extension-only |
| ✗ | Any GitHub Actions result is currently evidence for this path | Repo-wide `startup_failure` since 05/08/2026 — see the corresponding row in [`docs/reading-journey-status.md`](reading-journey-status.md). Every verification above is local or against the live host |

## Corrections to the brief's table

Six of the eight rows I was handed are right as stated. Two are wrong, and the
table understates the problem in a way that matters for sequencing.

1. **"Pricing page … offers no way to buy" — right, but incomplete in the
   direction that matters.** The paid cards say `Coming Soon`; the page is
   honest about not selling. The unreported break is on the *free* side: all
   four install CTAs point at a **private** repository's releases page, which
   is a 404 for the public. The funnel is dead at step 1, before money is even
   in question.

2. **"Extension has no licence-key field" — the conclusion is right, the reason
   is wrong.** The extension has full licence-key plumbing: config schema,
   defaults, storage read, container wiring, and `X-License-Key` header
   injection. What it lacks is a UI input. Filed as "no field" this looks like a
   day of work in `settings.html`; filed accurately it is a day of work in
   `settings.html` *plus* four adapter methods that no production code path has
   ever called.

3. **"Key delivery: no surface exists" — right, and there is a second break
   behind it.** Even with a delivery surface, `PrismaUserRepository.create`
   writes to `User.licenseKey` while `findByLicenseKeyHash` reads
   `LicenseKey.keyHash`. Minting through the existing repository would produce
   keys that never validate.

4. **"Webhook creates subscription + credits" — true of the code, false of the
   system.** It would fail on the `Subscription.userId` foreign key, because no
   user row is ever created, and the failure would be swallowed into a `200`.

5. **Not in the table at all, and the single most important finding:
   `AuthModule` is never imported.** The global licence-key guard does not run.
   The server never reads `X-License-Key`. Live-confirmed: an unauthenticated
   `GET /api/v1/subscription` returns `200` where the guard would have returned
   `401`. Consequence: `req.userId` is `undefined` in all four controllers that
   read it, so `POST /checkout` rejects every caller and `/tts/synthesize`
   resolves every request to Free. **Even a perfect licence key on a perfectly
   paid account would still get a 402.** Issuance and checkout can both ship
   correctly and the customer will still get nothing until this is fixed.

6. **Not in the table: the pricing page makes three claims the product cannot
   honor** — "Unlimited browser TTS" on the Free card (the only implementation
   is an unaddressed message handler), a "7-day free trial" on paid tiers (no
   trial-creation code exists; `SubscriptionStatus.Trialing` is only ever
   *mapped from* an inbound Paddle status at `webhook.controller.ts:304`), and
   credit volumes that disagree with `TIER_CREDITS`. Taking money against copy
   like this is the part of the money path with actual legal exposure, and it is
   cheaper to fix than any of the code above.

## What is NOT proven

- **That the webhook works against a real database.** Every webhook test uses
  mocks. No integration test creates a subscription in Postgres. The FK failure
  above is read from the schema, not observed.
- **That a Paddle delivery would parse.** `verifyWebhookSignature` throws before
  any parsing, so `WebhookEvent` has never been constructed from real Paddle
  bytes. The `custom_data.user_id` and `custom_data.tier` contract
  (`webhook.controller.ts:241-273`) is an assumption about a Paddle payload
  nobody has sent.
- **That a duplicate delivery is actually idempotent.** Untested with a real
  duplicate; the in-process store is falsified by any restart.
- **That the GitHub Pages XPI is the current build.** `updates.json` advertises
  `1.1.3` and `1.2.1`; `packages/extension/package.json` is at `1.2.9`. I
  verified the `1.1.3` XPI returns HTTP 200; I did not verify what is in it.
- **That Paddle's `_ptxn` parameter is the only place a transaction ID becomes
  public.** The cited page documents the checkout URL; I did not audit Paddle's
  success-redirect or webhook-replay surfaces for further exposure. The
  requirement below holds regardless — one documented public channel is enough
  to disqualify the ID as a credential — but it is a floor, not a survey.
- **The Plane item numbers cited below.** This seat cannot reach the tracker
  (`plane-cli` → "Herdr Plane mapping is required but unresolved"). The numbers
  are the orchestrator's; the underlying facts are independently verified here.
- **Nothing above was exercised by a browser-operating actor.** This audit is
  static reading plus live HTTP probes against the deployed API and site. No
  `$proso-user-gate` run applies, because there is no user-visible money surface
  to operate.

## The order-of-operations question

Not a recommendation — a tradeoff for Pedro, with the evidence attached.

**The reachable audience for a paid tier is currently near zero, and the free
install path is broken.**

| Fact | Evidence |
|---|---|
| Not listed on AMO | `GET https://addons.mozilla.org/api/v5/addons/addon/proso/` → 404; same for the extension's GUID `{41eb66cb-b520-4047-9b6c-63fdce6fca11}` → 404. The manifest is configured for self-hosting: `wxt.config.ts:99-100` comments "Self-hosted auto-update for **unlisted** extension" with `update_url: https://proso.com.br/updates.json`. Board item: Plane #19 |
| No first-run onboarding | `grep -rni "onboard\|firstRun\|welcome" packages/extension/src` → 0 hits. The only `runtime.onInstalled` listener seeds telemetry config and registers a context menu (`background.ts:201-240`). A new user lands on a popup with no guidance. Board items: Plane #16 / #27 |
| The install link 404s for the public | `curl -s -o /dev/null -w "%{http_code}" https://github.com/phsb5321/Proso/releases` → 404 (private repo) |
| The free tier's headline promise is undeliverable | "Unlimited browser TTS" (`pricing.html:73`) against a dead `speakText` handler (`content.ts:1384`) |
| The account-free reading route *does* work | Verified 12/08/2026 by `node scripts/local-host-journey-gate.mjs` — but only for a reader who operates their own synthesis host. See [`docs/reading-journey-status.md`](reading-journey-status.md) |

Read together: a user who finds the site cannot install; if they install
out-of-band they get no onboarding; if they find the popup, the free capability
the page advertises does not exist, and the one that does work requires them to
run their own TTS host. There is currently no population that would reach a
checkout button.

The tradeoff, stated without a preference:

- **Selling first** buys revenue signal from the small number of people already
  running Proso, and forces the billing code above to become real. It also means
  the first paying customer meets a product whose free tier over-promises and
  whose install link is a 404 — and, until the `AuthModule` break is fixed,
  meets a 402 after paying.
- **Distribution first** (AMO listing, working install link, onboarding, honest
  pricing copy) creates the audience that makes a checkout button worth
  building, and delays revenue. The billing code keeps rotting in place, and it
  is already rotten enough that three of its dead wires were only found by this
  audit.

Both sequences require the pricing-copy corrections and the `AuthModule` fix.
Neither depends on the other. Which comes first is Pedro's call.

## Cross-family adversarial pass

Run 12/08/2026 through the groq lane (`openai/gpt-oss-120b`) with the full source
of twelve money-path files inlined, since that lane has no repository access.
The fleet rule is that the reviewer must not share a model family with whoever
wrote the code; this code was written by prior Anthropic-family sessions.

### Binding requirement for `148-license-issuance`

**Licence retrieval must not authenticate on the Paddle transaction ID alone.**
The evidence is the `_ptxn` row above: Paddle publishes the transaction ID into
the checkout URL by design, so `GET /api/v1/license?transaction_id=txn_…` — or
any endpoint whose only credential is that ID — hands the key to whoever learns
it from a history entry, a `Referer` header or a log line.

The smallest correct shape: at `subscription.created` / `transaction.completed`,
mint a second high-entropy value — a claim secret — alongside the key, store
only its hash (the `LicenseKey.keyHash` pattern already in
`prisma/schema.prisma:142-156` is the right precedent), and require it on
retrieval. The transaction ID may still be used to *locate* the record; it must
not be what *authorises* reading it. Deliver the claim secret over a channel the
transaction ID is not already in — the success page's own response body, or
email — and make it single-use or short-TTL so a leaked success URL does not
stay redeemable. Do not derive the claim secret from the transaction ID: a
derivation whose only input is a public value is public.

This is also the shape of the failure this repository keeps producing. A
retrieval endpoint keyed on a public ID returns `200` with a real key to the
wrong person; every party involved observes success.

Result: six findings, **no new ones**. Findings 1–4 are the `AuthModule` break,
the swallowed webhook failure, the stub checkout URL, and the guard that never
resolves a `userId` — all independently found above. Findings 5–6 restate the
in-memory idempotency store and the swallowed failure. Every citation points at
real inlined code; nothing was fabricated, which is the failure mode a previous
no-source run produced.

What the pass did **not** find, and what a reviewer of the sibling PRs should
therefore check by hand rather than trust a lane to catch: the
`Subscription.userId` foreign key against a `User` table nothing ever writes;
the `User.licenseKey` / `LicenseKey.keyHash` table mismatch; the `extractTier`
default-to-Pro grant; and the `extractUserId` raw-passthrough fallback. Two of
those four are silent wrong-value grants rather than silent no-ops, which is the
variant of this repository's recurring bug that static review lanes read past.

## Reproducing this audit

```bash
# Site and install path
curl -s https://proso.com.br/pricing.html | grep -c "Coming Soon"          # 3
curl -s -o /dev/null -w "%{http_code}\n" https://github.com/phsb5321/Proso/releases   # 404
gh repo view --json visibility                                             # PRIVATE

# Live money-path endpoints
API=https://api.proso.com.br
curl -s -o /dev/null -w "%{http_code}\n" $API/health                       # 200
curl -s -X POST $API/api/v1/license/validate -H 'content-type: application/json' \
  -d '{"licenseKey":"PROSO-AUDIT-0000-0000"}'                              # 200 tier=free
curl -s -o /dev/null -w "%{http_code}\n" $API/api/v1/subscription          # 200 (guard absent)
curl -s -X POST $API/api/v1/subscription/checkout -H 'X-License-Key: X' \
  -H 'content-type: application/json' -d '{"tier":"pro"}'                  # 400
curl -s -X POST $API/webhooks/paddle -H 'content-type: application/json' -d '{}'  # 403

# Deployed configuration (no PADDLE_* present)
ssh dokku@192.168.1.184 config:show proso-api

# Dead wiring
# `--exclude-dir=generated` skips the gitignored Prisma client, whose only matches
# are JSDoc examples; without it the two greps below return 4 and 9 comment lines.
grep -rn "AuthModule" packages/server/src packages/server/tests            # 1 hit: its own decl
grep -rn "userRepository\." packages/server/src --exclude-dir=generated     # only findByLicenseKeyHash
grep -rn "licenseKey.create\|createLicenseKey\|generateLicense\|issueLicense" \
  packages/server/src --exclude-dir=generated                              # 0
grep -rn "\.createCheckout(\|\.validateLicense(\|\.setLicenseKey(" packages/extension/src           # 0
grep -rn "licenseKey" packages/extension/src/entrypoints/                  # 0
grep -rn "speakText" packages/extension/src packages/extension/tests       # 1 hit: the handler
grep -rn "price_" packages/ --include=*.ts --include=*.json                # 0
```
