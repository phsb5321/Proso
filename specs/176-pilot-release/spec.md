# Feature 176 — pilot release readiness

Date: 15/08/2026

The pilot was driven end to end today: the release worktree, three parallel
investigation seats, the load-bearing deploy rehearsal, and the one host change
that was legitimately available. This records what is now true, what is still
blocked, and — importantly — two claims in the original framing that turned out
to be wrong.

## What moved

An operator action was performed **outside this repository** and is recorded here
as context, not as an acceptance claim this tree can prove: the environment
variable `LICENSE_KEY_SECRET` was supplied to the Dokku app `proso-api` from the
vault entry `api/proso-license-key-secret` (64 bytes; the production boot
contract requires ≥32). It was applied with `dokku config:set --no-restart` so
that supplying the variable could not redeploy the *stale* container currently
running.

Nothing in this repository verifies that, and no gate in this PR depends on it.
The authoritative check is the deploy gate itself, on the host, at deploy time:
`make dokku-check` reads the host's env **key names** and re-derives the required
set from the target tree. Treat its output as the source of truth; treat this
paragraph as a note about why the gate's HELD list should now be shorter.

The deploy path itself is proven at `9bd5b88`:

```
subscription-deploy-rehearsal PASS at 9bd5b88196f1771029321c093ae9cc94176c5357
```

Sixteen phases against a disposable PostgreSQL with dummy secrets: the checked-in
predeploy (bridge → `prisma db push` → bridge), the schema invariants (5 indexes
+ the claim-pair check), production boot fail-closed on a short licence secret,
the real `AppModule` booting under `NODE_ENV=production`, account-free claim
`202`, signed webhook committed atomically, claim issuance + paid-key validation,
fresh-process replay staying exactly-once, hash-only persistence with redacted
logs, injected pre-commit fault rolling back every commerce row, and the retry
committing once.

## What still blocks the deploy, and why it should

`make dokku-check` returns **HELD (exit 2)** on five names:
`PADDLE_WEBHOOK_SECRET` and the four `PADDLE_PRICE_*` ids. They do not exist
anywhere — the vault holds only an archived Paddle *signup* login, so Paddle
onboarding has not happened.

This hold is deliberate and tested. `scripts/dokku-deploy-preflight.self-test.mjs`
carries a `held-missing-paddle` scenario asserting exit 2, and the gate derives
the required group by parsing which `PADDLE_*` variables the target tree's
`app.config.ts` actually reads. It is an all-or-nothing group so the webhook can
never be half-configured.

The gate checks environment variable **names**, not values, so setting five empty
strings would flip it to green. That was considered and rejected: it manufactures
a green verdict without changing anything real, which is precisely the
"success without observable effect" failure this repository has spent multiple
features eliminating. The hold stays until Paddle onboarding produces real values.

Worth stating plainly, because it bounds the risk: Paddle is **not** in the boot
contract. `REQUIRED_IN_PRODUCTION` is `DATABASE_URL`, `JWT_SECRET`,
`LICENSE_KEY_SECRET` only; the Paddle values are read per-request with `?? ''`
fallbacks, and `paddle.adapter.ts:23` throws `Paddle endpoint secret is not
configured` on an empty secret, which the guard turns into a `403`. A server
deployed without them boots fine and cannot grant an entitlement.

## Correction 1 — the AWS premise was wrong

The pilot was requested "on AWS". Proso does not run on AWS and never has:
`api.proso.com.br` is live on Dokku right now, and the AWS account contains five
buckets, all backups, with no compute. The repo's whole deploy path is
Dokku-shaped (`Procfile`, `app.json` healthchecks, `scripts/predeploy.sh`, and
the `dokku-deploy-preflight.mjs` gate merged eight days ago). Standing up
ECS/RDS instead would discard the preflight gate and the rehearsal above — the
two artifacts that make deploying this safe — and rebuild them against untested
infrastructure for a pilot with no users.

AWS *is* the right answer to one real problem, but it is the site, not the API:
see `specs/176-pilot-release/plan.md`.

## Correction 2 — the root-key blast radius was overstated

The AWS investigation was briefed with the claim that "every automation on this
box that touches AWS is currently running as unrestricted root". That is **not
accurate**, and the seat corrected it: restic (desktop and server), dokku, and
proxmox backups all authenticate as scoped IAM users with deny-destructive
policies. `/etc/restic/aws-env` on both hosts carries `restic-objectlock-v1`
keys, entirely independent of the root key.

What *does* use the root key is the interactive `PERSONAL_ROOT` CLI profile on
desktop and Mac.Pro, plus the Mac.Pro disk-hygiene launchd agent.

The finding still stands and still matters: the account root identity has a
long-lived access key (created 13/05/2026; id recorded in the operator receipt,
not here), it was used for `iam` calls **today**, and account MFA does not
protect access keys — a
leaked root key is full account takeover, able to bypass Object Lock governance
and purge every backup. But the blast radius is "the operator CLI", not "all
automation", and saying so accurately is the difference between a fixable finding
and an alarm.

## The live site is not merely stale — it is untrue

`proso.com.br` still serves the pre-#155 state from the last successful Pages
deploy (01/08/2026 21:01Z). Every site-affecting commit since — #151, #155, #165,
#167 — merged *during* the Actions outage and never published. Verified live
today, the homepage advertises:

- **"Unlimited browser TTS"** ×3 — browser `speechSynthesis` was deliberately
  removed in `9797dc6`.
- **"Free tier works immediately"** — managed Free returns `402`.

Those are false claims to visitors, which ranks them above cosmetic staleness.

One constraint governs every migration option: `updates.json` and `releases/` are
served from `proso.com.br` and are the extension auto-update lifeline
(`wxt.config.ts:101` hardcodes the URL). They are currently **live and correct**
at v1.2.1. A migration that forgets to copy them silently stops updates for every
installed user, with no visible error — the worst failure mode available here.

## Acceptance

This feature ships documentation plus two harness fixes. Its acceptance is
repo-local and provable from this tree:

- `make verify-full` exits 0 on the branch, with a certified gate receipt.
- `make semantic` reports 0 findings against the real deploy base `e6b412f`
  (it reported 2 before the tokenization).
- `./scripts/security-check.sh` reports no leaks against that same base.
- `make server-status-popover-plants` reports `4 caught, 0 missed`, with
  `plant card-covers: FAIL` — the tokenized hostile CSS still turns the topmost
  assertion red, so the plant retains its discriminating power. This runs the
  harness in its own Firefox, the browser the gate actually drives.

Retained evidence for all of the above, including the live-site measurements and
the plant receipt, is recorded in `docs/reading-journey-status.md`
("Update — 15/08/2026"), which is this repository's ledger of record.

Deliberately **not** claimed here, because this tree cannot prove it: any
statement about the deployed server's state. The pilot deploy has not happened,
`dokku-check` remains HELD on the Paddle group, and the live API still answers
without a `revision` field — i.e. it is still the pre-existing container. Those
facts are verified on the host by the deploy gate, not by this repository.
