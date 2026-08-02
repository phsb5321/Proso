# Reading journey status

The 30/07/2026 Mac Firefox installation and local TTS experiment is recorded in
[`docs/research/local-reader-lab-2026-07-30.md`](research/local-reader-lab-2026-07-30.md).
It remains partially verified after the production recovery below because macOS denied UI
automation: the installed extension has not yet been observed through popup click, extraction,
audio playback, and controls in one real-browser run.

Evidence reconciled on 02/08/2026 against the
[`Feature 095 reading contract`](../specs/095-reading-journey-contract/spec.md).
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
DNS mapping, secret, or audio-integration PR was deployed.

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

## Next verified slices

1. Create a retained Docker-only Firefox acceptance fixture that observes a real synthesis request
   and user-visible playback/control state.
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
