# Reading journey status

The 30/07/2026 Mac Firefox installation and local TTS experiment is recorded in
[`docs/research/local-reader-lab-2026-07-30.md`](research/local-reader-lab-2026-07-30.md).
That Mac run remains partially verified because macOS denied UI automation. The gap it named —
an installed extension observed through popup click, extraction, audio playback, and controls in
one real-browser run — was closed on Linux on 05/08/2026 by `scripts/public-actor-gate.mjs`
(PR #97); see [Update — 05/08/2026](#update--05082026-public-control-acceptance-appliance-measurements-and-a-ci-outage).

Evidence reconciled on 02/08/2026 against the
[`Feature 095 reading contract`](../specs/095-reading-journey-contract/spec.md), and again on
05/08/2026 against that contract plus
[`Feature 100`](../specs/100-local-appliance-tts/spec.md).
Symbols: ✓ verified, ◐ partially verified, ◯ unresolved, ✗ disproven as a
delivery claim.

## Current route

The Firefox-first route is:

`popup playback.start` → active-tab content extraction → ordered paragraph texts →
`PlaybackService` cache lookup → `ServerTtsAudioAdapter` → `ProsoApiAdapter` →
`POST /api/v1/tts/synthesize` → background `Audio` → footer, paragraph/word synchronization, and
controls.

The intended anonymous journey needs no account, license key, or provider key,
but current `main` does not provide it: Free has no managed-TTS entitlement and
the server returns 402, while browser `speechSynthesis` was deliberately removed
in commit `9797dc6`. BYOK remains available on Free. A fixture that returns
audio without applying this entitlement cannot prove the anonymous outcome.

Feature 100 proposes a user-operated local appliance as a second audio source that needs no
account, license key, or provider key. Nothing of it is on `main`: the spec is at
`specs/100-local-appliance-tts/`, the adapter is open in PR #95, and no local provider is wired
into the route above. The route sentence stands unchanged until that lands.

## Evidence ledger

| Status | Claim | Evidence |
|---|---|---|
| ✗ | Current `main` allows a no-key managed request | Commit `7e4cda0` returns 402 before cache/provider work; the earlier behavior at `55add09` is superseded |
| ✓ | A deterministic downstream oracle joins extraction, fixture synthesis, audio adaptation, cache, highlight timeline, and controls | `make smoke-reader`; the fixture bypasses the current Free entitlement and is not anonymous-outcome evidence |
| ✓ | Focused server route and extension orchestration suites pass | Commands below |
| ✓ | Static gates process real code and changed evidence | `make quality` resolves 501 modules / 805 dependencies, classifies 73 Knip findings and 136 clone groups, and rejects new debt |
| ✗ | The existing Chromium audio E2E proves reading works | It can pass without initiating or observing a TTS request and clears errors |
| ✗ | CI `security-audit` is a dependency gate | `pnpm audit --audit-level=high` exited 1 on PR #63, but `continue-on-error: true` made the job green; GitHub reports 73 open alerts (2 critical) |
| ✗ | A green CI `visual-tests` job means visual tests passed | PR #63 ran 26 Firefox visual tests: 24 failed and 2 passed, but step-level `continue-on-error: true` made the job green |
| ✓ | The current Chromium E2E command completes | PR #63 reported 27 passed; this still does not exercise or prove the current reading/audio route |
| ◐ | Packaged Chrome reading works | A Docker diagnostic reached the content script but the popup stayed `Loading...`; the Promise response was lost and MV3 worker `Audio` was undefined. The diagnostic was temporary, not a retained gate |
| ◐ | The real Firefox downstream reader route works | On 02/08, a built MV2 extension reached fixture TTS, visible footer/highlight, pause, and resume. The actor directly invoked `ExtensionParent`/`shortcuts.onCommand()`, so this is diagnostic-only and does not prove public controls or the full invariant/anomaly contract |
| ✓ | A public-control actor reads an article in a real Firefox | `node scripts/public-actor-gate.mjs` (PR #97) exited 0 with `public-actor-gate PASS at 1e339b6e4f143401b6de7253860fca13603ee9ab`, re-run 05/08/2026 18:39 BRT. Its 20 assertions open the Unified Extensions panel, click the browser action by its visible label `Proso`, address `Play` and `Previous paragraph` by accessible name, observe a 130-char TTS request and the page-visible highlight, hold position across pause, and advance after resume. Synthesis is still the local fixture, so this proves the public control path, not the account-free outcome |
| ✓ | That public gate is falsifiable rather than green by construction | `node scripts/public-actor-plants.mjs` at `1e339b6` exited 0 with `public-actor-plants PASS — 9 runs, every break caught`, re-run 05/08/2026 18:43 BRT: unplanted baseline PASS, 4 severed-journey plants FAIL (TTS request, visible reading UI, paused position, resume advance), 4 missing-surface plants BLOCKED (hidden Unified Extensions button, absent browser-action widget, popup that never opens, renamed `Play` control). Missing surface never reports as a pass |
| ✗ | `make smoke-reading` is public acceptance | It reaches into the addon's own `shortcuts.onCommand()` from chrome context (`scripts/smoke-reading.mjs:99-103`). PR #97 added the public actor as a separate retained path; both remain, and only the public one addresses user-visible controls |
| ✓ | The Orange Pi appliance is reachable from the desktop over the tailnet | `curl https://orangepi4pro-b.tailf59220.ts.net/health` returned HTTP 200 `{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}` on 05/08/2026 17:52 BRT. This supersedes the 01/08 loopback-only reading in the research doc |
| ◐ | The appliance meets the research doc's latency falsifier | Measured 05/08/2026 over the tailnet: RTF 0.195–0.276 across 68–727 UTF-8 bytes, length-invariant, all under the 0.5 bound — met. Warm paragraph synthesis 7.5–8.3 s against the 2 s clause — not met above roughly 150 UTF-8 bytes. The appliance does not stream, so time-to-first-audio equals full synthesis time. Measurements in `/tmp/097-slice-e-findings.md`, untracked |
| ✗ | The advertised `queueCapacity: 8` is the TTS admission budget | A 12-way burst admitted 4 and returned 429 `queue_full` for the other 8; the appliance's `config.py:107` sets `tts_capacity = 4` and the per-class split is not published by `/v1/capabilities`. One inference worker, no preemption |
| ✗ | Any GitHub Actions result on this repo is currently evidence | Every run since `2026-08-05T20:52Z`, `main` included, is `startup_failure` with `name: ""`, `path: "BuildFailed"` and `total_count: 0` jobs (`gh run list`, `gh api .../actions/runs/31049046583/jobs`). The last runs that executed jobs are `CI` and `Server CI` at `2026-08-02T17:34Z`. No workflow file changed since `b2b74e4` (PR #70, 01/08), so the cause is not a tracked workflow edit |
| ✓ | Server/provider availability at deployed SHA `9c761c3` | Deployment receipt below: public health/database green; uncached and cached zero-credit TTS canaries returned the same valid MP3. This predates the current Free-tier gate |

## Production deployment receipt — 30/07/2026

At 18:30–18:36 BRT, the merged server SHA
`9c761c341fa91fca2f26badfff5a6d86874eb7df` was deployed to `proso-api`. Dokku's
port and `/health` startup checks passed, its deploy lock was restored, and the public endpoint
returned HTTP 200 with database and memory up.

One sanitized free-tier canary (`Proso deploy check.`) returned a 19,584-byte OpenAI MP3 in
4.747 seconds, duration 1.224 seconds, with zero credits used. The identical request from the
MacBook returned in 0.242 seconds with `X-Cache-Hit: true`, zero credits used, and the same
SHA-256 `53dfc7d3232df18fc41a02ca8a4824c1c1ff9b3a420843453abc5873e0840e3f`.

The log gateway was redeployed from a signed, fast-forward deployment commit
`3908f3c55368efdd32c02872012d01eff4e60617`; its public health endpoint returned HTTP 200 with
Loki connected. GitHub Pages deployment run
[`30583836531`](https://github.com/phsb5321/Proso/actions/runs/30583836531) completed successfully
at the merged server SHA.

The Firefox build at the merged SHA remained byte-for-byte identical to the already-running
dedicated Mac profile artifact (`9b4050e347d5c78f7d306f164f101d1c8b48b33e0e507d664fe3515cb84ff673`).
The daily Firefox profile was not modified. This proves current bytes are installed and the Mac can
reach the recovered API; it does not upgrade the real-browser journey above to green.

The Orange Pi TTS/STT appliance remains research-only. No appliance, client adapter, model service,
DNS mapping, secret, or audio-integration PR was deployed. Both halves of that sentence have since
changed: the appliance itself was deployed on 31/07 outside this repository, and Feature 100 now
proposes the client adapter. See [Update — 05/08/2026](#update--05082026-public-control-acceptance-appliance-measurements-and-a-ci-outage).

Release run
[`30585260097`](https://github.com/phsb5321/Proso/actions/runs/30585260097) published the 1.2.0
Firefox, Chrome, and source archives, but AMO signing failed after approval because the action's
default `web-ext-artifacts/` output directory did not exist. Auto-update deployment was therefore
skipped. Version 1.2.1 points the signer at the existing `artifacts/` directory; it is not considered
deployed until AMO signing, the public update manifest, and the signed XPI are independently checked.

Focused evidence captured before the slice:

```bash
pnpm --filter @proso/server exec jest --maxWorkers=100% \
  tests/unit/core/routing/provider-router.spec.ts \
  tests/unit/core/tts/tts.service.spec.ts \
  tests/unit/infrastructure/tts-byok-auth.spec.ts

pnpm --filter @proso/extension test:unit -- --maxWorkers=100% \
  tests/unit/adapters/api/proso-api-testkey.test.ts \
  tests/unit/handlers/playback.handlers.test.ts \
  tests/unit/core/playback-service.test.ts \
  tests/unit/content-extractor-paragraphs.test.js \
  tests/unit/navigation-cleanup.test.js \
  tests/unit/background/shortcuts.test.ts
```

The first command passed 3 suites / 65 tests; the second passed 6 suites / 159 tests.

## TTS credit correctness — Slice 1a

Verified on 30/07/2026 at 18:10 BRT. Hypothesis: failed or malformed provider chains and fallible
post-debit work could consume credits without delivering audio; the fix is per-candidate preflight
plus an atomic conditional commit only for the successful candidate, followed by a non-failing
response path. Falsifier: any terminal failure changes balance/ledger, concurrent debits make the
balance negative, fallback audio is charged/cached as the primary provider, mismatched provider
metadata reaches debit/cache, or cache/metadata failure after debit prevents returning paid audio.

Evidence:

- The planted all-provider failure assertion was red before the change: Jest observed one Groq
  debit. Receipt `/tmp/proso-slice1-credit-red.log`, SHA-256
  `8e410084b5218d16cd2a96e9c53c83f44dde4c156d92a10416d7fd18d12d831b`.
- `pnpm --filter @proso/server exec tsc --noEmit` exited 0.
- The focused managed/BYOK/routing/credit/controller/provider/Prisma gate passed 8 suites and
  210/210 tests in 31.725 seconds. This includes all 23 Prisma contracts against Postgres with the
  canonical NixOS schema engine and the concurrent conditional-debit case. Receipt
  `/tmp/proso-slice1-tts-credit-prisma-focused.log`, SHA-256
  `86ee70915b6cba0b6ea7c0a263780989e8cb03fcd34cb982349e42ef3475bfbd`.
- Regression coverage asserts preflight before provider work, no debit on terminal failure, debit
  only after success, atomic race rejection, actual fallback pricing/cache/provider attribution,
  malformed provider metadata rejection, authoritative remaining balance from the atomic debit,
  and best-effort cache failure returning paid audio with a warning.
- Exact different-family reviewer `llama-3.3-70b-versatile` returned `PASS` for all six
  TTS/credit requirements with zero findings after inspecting the complete final diff.
- The edit hook's whole-file jscpd check remains a known legacy false positive, not a bypass:
  TTS spec 6.52%/8 clones, credit spec 19.49%/14, and Prisma contract 23.26%/10. Slice 2 will replace
  this with a changed-code ratchet.

Gateway workspace integration, seeded property tests, and the broader anomaly matrix are explicitly
deferred to Slice 1b from merged `main`; they are not partially implemented in this rollback unit.

## Highest-leverage gap and falsifier

Hypothesis: the immediate delivery risk was a false-green verification surface, because no
deterministic test joined article extraction to no-key synthesis, playback/highlight state, and
controls while the browser audio suite never triggered that route.

Chosen fix: one reader-journey integration oracle plus one tracked delivery harness.

Falsifier: if a planted break at extraction, synthesis endpoint/auth headers, highlight timeline,
control transition, secret scan, or typed reviewer output still leaves the corresponding gate green,
the harness is invalid and must not ship.

## Planted violation proof

Each violation was applied alone on 30/07/2026, observed red, and removed before the final green run:

| Plant | Gate evidence |
|---|---|
| Drop the first extracted paragraph | `make smoke-reader` exited 2 at the ordered-paragraph assertion |
| Route synthesis to `/api/v1/tts/planted-violation` | `make smoke-reader` exited 2 at the endpoint assertion |
| Suppress the word timeline | `make smoke-reader` exited 2 at the timeline/tab assertion |
| Keep state playing on pause | `make smoke-reader` exited 2 at the paused-state assertion |
| Add a high-entropy fake credential in an untracked file | `security-check.sh` exited 1, redacted it, and identified `generic-api-key` |
| Return a schema-incomplete reviewer object | `adversarial-review.sh` exited 1 with “malformed verdict” |
| Enable TypeScript scanning on the old Madge command | It found the real debug-handler cycle; the cycle was removed and the scan now passes |
| Run the first parallel build/test recipes | Build exposed shared-before-server ordering; server contracts exposed missing NixOS Prisma engine propagation. Both recipes now encode those dependencies |

## Final delivery evidence

Captured on 30/07/2026 at 16:55 BRT with
`GENERATOR_FAMILY=openai ADVERSARIAL_REVIEWER=meta-llama make gate`:

- `make verify-full` exited 0: extension 122 suites passed / 1 skipped and 2,830 tests passed /
  1 skipped; server 20 suites / 403 tests passed; security 4 suites / 39 tests passed.
- Firefox MV2, Chrome MV3, Edge MV3, server, and shared builds completed. Compilation is not
  promoted to browser acceptance.
- Madge processed 177 TypeScript files with no cycle; jscpd reported 0.9% duplicated lines against
  the existing 10% threshold.
- `GENERATOR_FAMILY=openai ADVERSARIAL_REVIEWER=meta-llama make adversarial` returned `PASS` with
  exactly `REQ-1` through `REQ-6`, all `PASS`, and no findings. Exact reviewer model:
  `llama-3.3-70b-versatile`.
- The preferred Anthropic reviewer was unavailable because all configured weekly windows were
  exhausted; Z.ai GLM 5.2 returned a plan-window 429. The accepted fallback is Meta lineage, not
  Groq GPT-OSS/OpenAI lineage, so the OpenAI-generated implementation still had a different-family
  reviewer.
- An earlier reviewer response with five traces for six requirements was rejected even though it
  said `PASS`; the schema now requires the complete unique ID set.

## Update — 05/08/2026: public-control acceptance, appliance measurements, and a CI outage

Three things changed today. Each is recorded with the command that produced it.

### A public-control acceptance path exists

PR #97 merged as `1e339b6` and added `scripts/public-actor-gate.mjs`, the repository's first
acceptance path driven through user-visible surfaces: the Unified Extensions panel, the browser
action addressed by its visible label, and popup controls addressed by accessible name.

```bash
pnpm --filter @proso/extension build:firefox   # exit 0, 1.12 MB firefox-mv2
node scripts/public-actor-gate.mjs             # exit 0
# public-actor-gate PASS at 1e339b6e4f143401b6de7253860fca13603ee9ab
node scripts/public-actor-plants.mjs           # 9 runs: 1 PASS, 4 FAIL, 4 BLOCKED
```

The plant matrix is what makes the gate worth citing. Four severed-journey plants report `FAIL`
(TTS request, footer, paused position, resume advance) and four missing-surface plants report
`BLOCKED` (hidden Unified Extensions button, absent browser-action widget, popup that never opens,
renamed `Play` control). A missing surface can therefore never be read as a pass.

This does **not** retire `make smoke-reading`. That harness invokes the addon's own
`shortcuts.onCommand()` from chrome context and still proves only that the handler works. The two
paths are kept separate on purpose: internal dispatch is a diagnostic, the public actor is
acceptance. Neither yet proves the account-free outcome, because both synthesize against the local
fixture API rather than a real no-key audio source.

### The appliance is reachable and measured

The research doc's 01/08 reading — loopback-bound, unreachable from the extension — is stale.
Tailscale Serve now proxies the appliance on 443, and `GET /health` answered HTTP 200 from the
desktop on 05/08 at 17:52 BRT. Measurements taken over that path:

| Property | Measured | Against |
|---|---|---|
| Real-time factor | 0.195–0.276, length-invariant across 68–727 UTF-8 bytes | 0.5 bound — **met** |
| Warm paragraph synthesis | 7.5–8.3 s | 2 s clause — **not met** above ~150 UTF-8 bytes |
| Response streaming | none; whole WAV or JSON envelope only | time-to-first-audio equals full synthesis time |
| TTS admission | 4 concurrent; a 12-way burst returned 429 `queue_full` for 8 | advertised `queueCapacity: 8` — **misleading**, the split is unpublished |
| Inference workers | one, no preemption | client concurrency above 1 buys no throughput |

The two clauses of the falsifier disagree, and the doc does not pick the flattering one. RTF passes
decisively. The 2 s wall-clock clause fails at paragraph size and passes at sentence size, which is
the granularity the original baseline used. At a fixed RTF, any positive-length input eventually
exceeds a fixed wall-clock bound, so the clause only binds once a granularity is named — a spec
decision for Feature 100, not a measurement gap. The actionable consequence is that a single-shot
paragraph means roughly 8 s of silence before playback starts.

Full measurements, failure-mode table (RFC-9457 `problem+json`, `413 payload_too_large`,
`409 idempotency_key_reused`, `429` with `retry-after`) and the source citations behind them are in
the review tab's untracked `/tmp/097-slice-e-findings.md`; the load-bearing numbers are reproduced
above so this ledger does not depend on a temporary file.

### GitHub Actions produces nothing at all

Since `2026-08-05T20:52Z` every workflow run in this repository has ended `startup_failure` with an
empty `name`, `path: "BuildFailed"`, and zero jobs — on feature branches and on `main` alike.

```bash
gh run list --limit 60 --json createdAt,conclusion,headBranch,workflowName
gh api repos/phsb5321/proso/actions/runs/31049046583/jobs --jq '.total_count'   # 0
git log -1 --format='%h %ad %s' --date=short -- .github/workflows/  # b2b74e4 2026-08-01 (#70)
```

The last runs that executed jobs were `CI` and `Server CI` at `2026-08-02T17:34Z`. No workflow file
has changed since PR #70 on 01/08, so a tracked workflow edit is not the cause. Until this is
resolved, the two `✗` rows above about green jobs hiding red steps are joined by a stronger one:
**no CI result of any colour is currently evidence of anything.** Local commands are the only
verification surface, which is exactly why every claim added today cites one.

## Next verified slices

1. ~~Create a retained Docker-only Firefox acceptance fixture that observes a real synthesis request
   and user-visible playback/control state.~~ Delivered on 05/08 by PR #97, with two deviations
   from this wording: it runs against a local `geckodriver` rather than Docker, and it observes a
   fixture synthesis request rather than a real one. The account-free half stays open below.
2. Reproduce Chrome’s message-response and audio-context failures in committed diagnostics, then
   choose the smallest Chrome-specific architecture change. Do not infer a Firefox regression.
3. Reconcile the dated architecture audit and pre-launch checklist; they still contain historical
   Browser TTS and browser-test claims.
4. Triage the 73 expiring Knip fingerprints and 60 OSV advisories before 30/10/2026; remove a
   fingerprint as soon as its finding disappears.
5. Remediate critical/reachable dependency alerts in service-scoped PRs, then the remaining high
   alerts. Changing `.github/workflows/ci.yml` to remove the audit’s `continue-on-error` is a
   separately gated workflow change; until then, do not cite the green job as security evidence.
6. Establish the missing Firefox/Linux visual baselines and repair the keyboard assertions behind
   the 24 visual failures before removing that job’s `continue-on-error`. That workflow edit is
   separately gated; until then, inspect the test log rather than the green job badge.
7. Diagnose the GitHub Actions `startup_failure` outage above. It predates and outranks items 5
   and 6: those describe misleading green jobs, this one means no job runs at all. Repository-level
   Actions settings and billing are outside this repository's diff, so remediation is
   `[pending] Pedro` once the cause is identified.
8. Point the public actor at an account-free audio source. Feature 100's appliance route is the
   only candidate on the table; until it lands, `public-actor-gate.mjs` proves controls against a
   fixture and the anonymous outcome stays unproven.
9. Decide, in `specs/100-local-appliance-tts/`, the granularity the 2 s latency clause binds to,
   and size synthesis requests to it. At RTF ~0.2 with no streaming, sentence-level chunking plus
   prefetch keeps time-to-first-audio near 1–2 s; a paragraph-sized request does not.
