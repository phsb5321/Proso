# Plan — Feature 176

## Constitution check

No product code. No schema change. No AWS resource created or destroyed, no
credential rotated, no DNS touched, no Paddle configuration invented. The one
mutation performed is a single Dokku config variable whose value came from the
vault, applied `--no-restart` so it could not trigger a deploy of the stale
image.

## Sequencing — why the API is not the AWS problem

The pilot API deploys to the Dokku host it already runs on, because that is where
the tested path leads. The ordered blockers are:

1. `LICENSE_KEY_SECRET` — **done** (vault → `dokku config:set --no-restart`).
2. Paddle onboarding — **Pedro**. Five values, all-or-nothing by design.
3. `make dokku-deploy` — runs the checked-in predeploy, pushes, and proves the
   deploy with `/health.revision`. It is the gate's job, not a manual `git push`.

Step 3 must not be attempted before step 2 unless the Paddle group is genuinely
absent from `app.config.ts`, which it is not.

## Where AWS legitimately fits

Not the API — the **site**, and only as one of three options, because the actual
root cause is that site publishing depends on GitHub Actions, which has been dead
repo-wide since 05/08/2026 (private-repo Actions metering on a free personal
plan; `rulesets` 403s `Upgrade to GitHub Pro`).

| Option | Cost | Removes the CI dependency? | Main risk |
|---|---|---|---|
| (a) S3 + CloudFront + ACM | ~$1–3/mo | yes | cutover before cert validation = TLS failure; forgetting `updates.json`/`releases/` = silent auto-update break |
| (b3) Branch-based Pages from `gh-pages` | $0 | yes (no Actions) | manual push per change; legacy toggle must be permitted on this repo |
| (c) Existing Dokku host + existing Cloudflare tunnel | $0 | yes | needs an nginx static root + the copy step at deploy time |

The domain's nameservers are already Cloudflare (`kolton/roxy.ns.cloudflare.com`,
registrar Registro.br), so no registrar change is needed for any option — DNS
edits are Cloudflare-side.

**Recommended: (c).** It costs nothing, permanently decouples site publishing
from the dependency that broke, and mirrors how `api.proso.com.br` is already
served from the same host through the same tunnel. (b3) is the zero-infra
stopgap if the site should be live within minutes. (a) is defensible if the site
should live on AWS for its own reasons, but it buys infrastructure to solve a
billing problem.

Every option must copy `updates.json` + `releases/` into the site root, exactly
as `deploy-site.yml` does today. This is not optional and its failure is silent.

## Root-key rotation

Planned in full by the AWS seat (`/tmp/proso-176-aws-hardening.md`): a
least-privilege `pedro-ops` IAM user, a proposed policy scoped to the five
buckets plus the read verbs the recurring activities need, and a nine-step
rotation order that is restic-safe because restic authenticates independently.

The order is deliberately reversible before it is final: **disable** the root key
(step 6), hold a ≥7-day grace window re-running every AWS check (step 7), and
only then **delete** (step 8) — root access keys cannot be recreated from a
backup, so deletion is the one irreversible move.

Two things must happen *before* deletion, because only root can do them:
re-enable versioning + Object Lock on `nixos-desktop-backups` (currently
Suspended, unlike its server counterpart), and consider a CloudTrail trail so
step 7's "no lingering root use" is provable rather than inferred.

This is credential surgery on the account that holds every backup. It stays
`[pending] Pedro`.

## Falsification

- The Paddle hold is real, not a misconfiguration: `held-missing-paddle` is a
  tested scenario in `dokku-deploy-preflight.self-test.mjs` asserting exit 2.
- The empty-value shortcut was tested against the gate's own logic
  (`hostConfigKeyNames()` collects names only) and rejected on grounds of
  honesty, not capability.
- The live-site claims were confirmed against the running site, not inferred
  from the repo: `curl https://proso.com.br` returns "Unlimited browser TTS" ×3
  and "free tier works immediately".
- `updates.json` was confirmed live and current (v1.2.1) before recommending any
  migration that touches it.
