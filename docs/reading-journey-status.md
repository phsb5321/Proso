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
| ✗ | CI `security-audit` is a dependency gate | The job still has `continue-on-error: true` (its removal is a separately gated workflow change, not yet landed), so a green job remains non-evidence. What changed on 06/08/2026 (PR #109, `e904cd1`): the local `make security` gate now fails closed — `scripts/dependency-audit.sh` mirrors the CI command (`pnpm audit --audit-level=high`) without `continue-on-error` and is falsified by plant: pinning `vite@8.0.1` in the log-gateway scope (with the root overrides removed) made it exit 1 with high vite advisories (3 in the eng's plant — GHSA-v2wj-q39q-566r / GHSA-p9ff-h696-f583 patched ≥8.0.5, GHSA-fx2h-pf6j-xcff patched ≥8.0.16 — 4 in the qa replicate), reverting restored exit 0. Remediation: `vite` pinned `>=8.0.16 <9.0.0` in `services/proso-log-gateway` — the only high path in the workspace; the pre-existing range-key overrides do not match vitest's `^8.0.0` peer spec, which is why `vite@8.0.1` survived them. Pre-fix `pnpm audit --audit-level=high` on main: exit 1, 9 findings (3 high + 6 moderate); post-merge: exit 0 (4 moderate). GitHub's alert board on 06/08: 0 critical / 4 high (all vite) / 7 medium — the earlier "2 critical" figure was a stale 05/08 snapshot, auto-closed since; Dependabot rescans on push and is expected to close the 4 vite highs (unverifiable while the Actions outage persists). Remaining moderate, no upstream fix: `request` SSRF via `web-ext>sign-addon`, `uuid` via `jest>node-notifier` / `web-ext>sign-addon` / `testcontainers>dockerode` (dev-only paths). QA gate: 6/6 PASS re-run from the branch (plant replicated and reverted); different-family review (codex): PASS, zero findings. All verification is local (Actions outage, `[pending] Pedro`). |
| ✗ | A green CI `visual-tests` job means visual tests passed | PR #63 ran 26 Firefox visual tests: 24 failed and 2 passed, but step-level `continue-on-error: true` made the job green |
| ✓ | The current Chromium E2E command completes | PR #63 reported 27 passed; this still does not exercise or prove the current reading/audio route |
| ◐ | Packaged Chrome reading works | The two known Chrome MV3 failures are now reproduced by a retained gate: PR #107 (`6628aaf`, merged 06/08 14:34 BRT) added `make chrome-mv3-diagnostics` (spec `106-chrome-mv3-diagnostics`). It goes RED on the Chrome MV3 build — C1 worker `Audio` undefined, C2 popup start journey fails — and GREEN on the Firefox MV2 build (non-regression by assertion). QA re-ran every receipt from the merged commit (6/6 gate claims PASS); the different-family review returned conditional-pass with 8/9 findings fabricated (each verified against the diff; the one real limitation matches the public-actor gate precedent). The row stays ◐ because the fix is not landed: the spec-106 verdict — a worker-safe `Audio` shim proxying the already-shipped offscreen document protocol, `"offscreen"` manifest permission Chrome-only, zero `PlaybackService` changes — is a follow-up slice. Environment findings from the gate: `chrome.offscreen` is `undefined` without the `"offscreen"` permission (Chrome for Testing 151); branded Google Chrome 137+ rejects `--load-extension`, so the gate drives Chrome for Testing with a NixOS `LD_LIBRARY_PATH`, and the repo's own `test:e2e:ext` fixture uses the same dead branded-Chrome pattern on this host (adjacent debt, follow-up) |
| ◐ | The real Firefox downstream reader route works | On 02/08, a built MV2 extension reached fixture TTS, visible footer/highlight, pause, and resume. The actor directly invoked `ExtensionParent`/`shortcuts.onCommand()`, so this is diagnostic-only and does not prove public controls or the full invariant/anomaly contract |
| ◐ | A public-control actor reads an article in a real Firefox | `node scripts/public-actor-gate.mjs` (PR #97) exited 0 with `public-actor-gate PASS at 1e339b6e4f143401b6de7253860fca13603ee9ab`, re-run 05/08/2026 18:39 BRT. Its 20 assertions open the Unified Extensions panel, click the browser action by its visible label `Proso`, address `Play` and `Previous paragraph` by accessible name, observe a 130-char TTS request and the page-visible highlight, hold position across pause, and advance after resume. Synthesis is still the local fixture, so this proves the public control path, not the account-free outcome. Partial for a second reason: the run relaxes the process model — see the row below |
| ◐ | The public gate runs the process model users run | It sets `extensions.webextensions.remote=false` (`scripts/public-actor-gate.mjs:384`, documented at `docs/agent-delivery-harness.md:85`). Both modes were measured: WebDriver exposes no window handle for an extension popup panel, and a remote popup's `contentDocument` is opaque to the parent process, so out-of-process the popup's own DOM — and its accessible names — cannot be read at all. The click, the listener and the rendered popup are real; only the process boundary is relaxed. The gate therefore proves the public control path under a non-default process model, not under the one users actually run |
| ✓ | That public gate is falsifiable rather than green by construction | `node scripts/public-actor-plants.mjs` at `adc99f6` (PR #98, merged `24f0e09`) exited 0 with `public-actor-plants PASS — 10 runs, every break caught`, re-run 05/08/2026 19:03 BRT: unplanted baseline PASS, 4 severed-journey plants FAIL (TTS request, visible reading UI, paused position, resume advance), 4 missing-surface plants BLOCKED (hidden Unified Extensions button, absent browser-action widget, popup that never opens, renamed `Play` control), and a self-check that points the runner at a missing script and requires CRASH. Missing surface never reports as a pass, and neither does a run that never launched a browser |
| ✗ | The 9-run plant figure reported earlier on 05/08 measured what it claimed | That sweep scored runs by exit code, so a crashed run that never reached Firefox scored as a caught plant — skipped-green inside the anti-skipped-green tool. PR #98 rescored on the gate's own verdict line and added the CRASH self-check; the 10-run sweep above is the first figure that distinguishes a caught break from a dead runner |
| ✗ | `make smoke-reading` is public acceptance | It reaches into the addon's own `shortcuts.onCommand()` from chrome context (`scripts/smoke-reading.mjs:99-103`). PR #97 added the public actor as a separate retained path; both remain, and only the public one addresses user-visible controls |
| ✓ | The Orange Pi appliance is reachable from the desktop over the tailnet | `curl https://orangepi4pro-b.tailf59220.ts.net/health` returned HTTP 200 `{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}` on 05/08/2026 17:52 BRT. This supersedes the 01/08 loopback-only reading in the research doc |
| ◐ | The appliance meets the research doc's latency falsifier | Measured 05/08/2026 over the tailnet: RTF 0.195–0.276 across 68–727 UTF-8 bytes, length-invariant, all under the 0.5 bound — met. Warm paragraph synthesis 7.5–8.3 s against the 2 s clause — not met above roughly 150 UTF-8 bytes. The appliance does not stream, so time-to-first-audio equals full synthesis time. Measurements in [`docs/research/appliance-measurements-2026-08-05.md`](research/appliance-measurements-2026-08-05.md) (PR #100) |
| ✗ | The advertised `queueCapacity: 8` is the TTS admission budget | A 12-way burst admitted 4 and returned 429 `queue_full` for the other 8; the appliance's `config.py:107` sets `tts_capacity = 4` and the per-class split is not published by `/v1/capabilities`. One inference worker, no preemption |
| ✗ | Feature 100's extension-direct seam is a settled design | A prior recorded decision mandates the opposite seam. `2. Areas/🧙 Merlin Unlock/projects/orangepi-audio-appliance/RESEARCH.md` in Pedro's vault, L53-76, routes the appliance as `Proso extension → existing Proso API → server-side AudioApplianceTTSAdapter → Tailscale Serve → loopback wrapper` and states at L74-75 "Do not add direct Pi networking to Proso content scripts or the Lectrice WebView"; L420-443 fixes the seam at `ServerTtsAudioAdapter → /api/v1/tts/synthesize → TTSProviderPort → AudioApplianceTTSAdapter → Pi /v1/tts` and requires "no Pi hostname permission or bearer token in the extension" (L442). Feature 100 was specified extension-direct because that record was not read before design started. Which seam ships is an open decision for Pedro, not a settled premise of this feature |
| ◯ | The vault's step-3 precondition for client work is satisfied | The same record sequences delivery and states at L495 "No client PR should start before steps 1–3 establish the stable contract". Steps 1 and 2 shipped on 31/07/2026 outside this repository (NixOS PRs #1481, #1487, #1496). Step 3 (L486-487) is burst, cancellation, idempotency, sustained thermal, and human speech acceptance. Burst and idempotency are measured in [`appliance-measurements-2026-08-05.md`](research/appliance-measurements-2026-08-05.md); cancellation and sustained thermal are being measured on 05/08; human speech acceptance is a listening test only Pedro can run and stays with him. PR #95 is held meanwhile |
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
node scripts/public-actor-plants.mjs           # 10 runs: 1 PASS, 4 FAIL, 4 BLOCKED, 1 CRASH
# public-actor-plants PASS — 10 runs, every break caught
```

The plant matrix is what makes the gate worth citing. Four severed-journey plants report `FAIL`
(TTS request, footer, paused position, resume advance) and four missing-surface plants report
`BLOCKED` (hidden Unified Extensions button, absent browser-action widget, popup that never opens,
renamed `Play` control). A missing surface can therefore never be read as a pass.

The tenth run is the runner checking itself, and it exists because the first version of this sweep
was wrong in the exact way it was built to prevent. It scored each run by exit code, so a run that
crashed before launching a browser exited non-zero and scored as a caught plant — skipped-green
inside the anti-skipped-green tool. PR #98 (`adc99f6`, merged `24f0e09`) rescores on the gate's own
verdict line and adds a self-check that points the runner at a missing script and demands `CRASH`.
The 9-run figure quoted earlier on 05/08 came from the pre-fix scorer and is superseded by the
10-run sweep above; the four `FAIL` and four `BLOCKED` classifications survived rescoring unchanged.

One limit of the gate belongs in this ledger and not only in the harness doc, because this is the
document a later reader trusts. The gate sets `extensions.webextensions.remote=false`
(`scripts/public-actor-gate.mjs:384`, stated at `docs/agent-delivery-harness.md:85`). That is not a
convenience: WebDriver exposes no window handle for an extension popup panel, and out-of-process a
popup's `contentDocument` is opaque to the parent, so the popup's accessible names — the whole
basis of addressing controls the way a person does — are unreadable. Both modes were measured
before the pref was set.

What that costs is bounded and worth naming precisely. The actor's click is a real click, the
command listener is the real listener, and the popup is really rendered; only the process boundary
is relaxed. What it does not cover is anything that differs *because* the popup runs
out-of-process in a default profile — message-passing across the process boundary, and failures
that only appear there. So both public-actor rows above are ◐, not ✓: the control path is proven
under a non-default process model, and no run yet proves it under the one users have.

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
`409 idempotency_key_reused`, `429` with `retry-after`) and the source citations behind them landed
as [`docs/research/appliance-measurements-2026-08-05.md`](research/appliance-measurements-2026-08-05.md)
in PR #100. The earlier citation here pointed at `/tmp/097-slice-e-findings.md`; a temp file is not
evidence, and the load-bearing numbers stay reproduced above regardless.

### The seam Feature 100 assumes is not the seam of record

Feature 100 puts the appliance behind an extension-side adapter. A prior decision, recorded in
Pedro's vault at
`2. Areas/🧙 Merlin Unlock/projects/orangepi-audio-appliance/RESEARCH.md`, mandates the opposite:
the extension talks to the Proso API, and a **server-side** `AudioApplianceTTSAdapter` talks to the
Pi (L53-76, seam at L58-60). It is explicit about the client, twice — "Do not add direct Pi
networking to Proso content scripts or the Lectrice WebView" (L74-75) and "no Pi hostname
permission or bearer token in the extension" (L442).

Feature 100 was designed against that decision, not in disagreement with it. Nobody read the vault
record before the spec was written, and this repository has no copy of it, so the conflict surfaced
only after the spec, the adapter in PR #95, and the measurement pass already existed. The record
also gates the work: "No client PR should start before steps 1–3 establish the stable contract"
(L495). Steps 1 and 2 shipped on 31/07/2026 outside this repository (NixOS PRs #1481, #1487,
#1496). Step 3 (L486-487) is burst, cancellation, idempotency, sustained thermal, and human speech
acceptance: burst and idempotency are in the measurement record above, cancellation and sustained
thermal are being measured on 05/08, and human speech acceptance is a listening test that stays
with Pedro.

The tradeoff is real in both directions, which is why this is a decision and not a defect to patch.
The server-side seam keeps entitlement on the server and adds no host permission to the extension,
but the server currently returns 402 for Free, so it does not deliver an account-free read without
a further server change. The extension-direct seam delivers the account-free read and keeps page
text going only to a host the user configured, but it reopens the client boundary this record
closed, and the Dokku container's own path to the Pi (L420-443) stays unbuilt. **Which seam ships
is Pedro's call.** Until he makes it, no row in this ledger should be read as endorsing either, and
PR #95 is held.

**05/08 20:1x BRT — merged, then reverted, hold restored.** PR #95 (Feature 100 slice B, the local
appliance adapter) was squash-merged at `8994f28`, then reverted at `6b4b33e` in the same session.
The merge violated this hold and the step-3 gate below; the revert restores the pre-merge tree
exactly — `git diff 163abc3 6b4b33e` is empty, so verification is inherited from #86's
`make verify-full` receipt at `4860fea`. The hold stands: slice B re-lands only after the seam
decision and the step-3 gate clear. What survives is the wire-contract proof in the PR body and in
`specs/100-local-appliance-tts/`; the adapter code is out of the tree until then.

The divergence itself is the lesson worth recording: two records described the same system and only
one of them was consulted. `RESEARCH.md` now points at `specs/100-local-appliance-tts/` and at the
measurement record, so the next reader of either finds the other.

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

Diagnosis so far, recorded 05/08 ~20:1x BRT. Every failing run — 89 at last count — is attributed
to a single synthetic workflow record, `workflow_id 328147086` (`name: ""`, `path:
"BuildFailed"`, `state: deleted`), created exactly at the outage start, `2026-08-05T20:52:01Z`.
The first failing run is the push of `2fa0f2e` to `097-doctor-ignored-locks` at that timestamp — a
commit touching only `scripts/workspace-policy.mjs`. Non-causes eliminated: not a tracked workflow
edit (workflows unchanged since `b2b74e4`); not YAML syntax (all five parse); not a GitHub incident
(`status.github.com` All Systems Operational, checked 23:0x BRT); not repo Actions disabled
(`actions/permissions` = `enabled: true`, `allowed_actions: all`); not a malformed workflow on any
current branch (full ref scan — only `078-security-hardening` carries an extra `test.yml`, valid,
from a merged 03/2026 PR). Remaining candidates are account-level: Actions billing/quota (the
billing API needs `user` scope, which `gh` lacks here) or a GitHub server-side change. Diagnosis
stops where the repo's diff stops; remediation stays `[pending] Pedro`.

## Next verified slices

1. ~~Create a retained Docker-only Firefox acceptance fixture that observes a real synthesis request
   and user-visible playback/control state.~~ Delivered on 05/08 by PR #97, with two deviations
   from this wording: it runs against a local `geckodriver` rather than Docker, and it observes a
   fixture synthesis request rather than a real one. The account-free half stays open below.
2. ~~Reproduce Chrome’s message-response and audio-context failures in committed diagnostics, then
   choose the smallest Chrome-specific architecture change. Do not infer a Firefox regression.~~
   Delivered on 06/08 by PR #107 (`6628aaf`): `make chrome-mv3-diagnostics` reproduces both
   failures RED on Chrome MV3 and stays GREEN on Firefox MV2. Follow-up (not started): implement
   the spec-106 verdict — worker-safe `Audio` shim proxying the shipped offscreen document
   protocol, `"offscreen"` manifest permission Chrome-only, zero `PlaybackService` changes.
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
