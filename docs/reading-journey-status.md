# Reading journey status

## Update — 21/09/2026: hover affordance requires prior origin engagement

Pedro's YouTube watch-title screenshot exposed ambient paint on a site where
reading had never started. Feature 229 now gates idle, routed-content and
click-time marking on a locally stored, bounded list of successfully read
origins. Both playback-start paths record engagement only after success;
content observes storage changes, including engagement during active reading,
without replacing active article indexes. See the
[Feature 229 amendment](../specs/229-paragraph-hover-play/spec.md#amendment--21092026-prior-origin-engagement).

The first-visit regression failed before the fix (3 marked paragraphs instead
of 0). Extension lint exits 0 with 68 warnings; `tsc --noEmit` exits 0. Unit and
contract projects pass 160 suites / 3,252 tests, with one skipped suite/test
(`--maxWorkers="$(nproc)"`, exit 0, 121.49 seconds). The final content suite
passes all 17 tests, including queued-revocation/routed-content checks. Seeded fuzz
passes with `FC_SEED=20260730 FC_NUM_RUNS=100` (`make fuzz` to replay).
Logs are `/tmp/proso-hover-{red,lint,tsc,unit-contract-cpu,content-final,user-gate}.log`.

The Firefox build succeeds. `make user-gate` initially failed in its diagnostic
with “Pausing cleared the reading position instead of holding it”; two direct
`node scripts/smoke-reading.mjs` replays passed. The original and both replay
receipts are retained under `/tmp/proso-hover-smoke-*-receipt.json`. This is an
intermittent diagnostic anomaly, not evidence that public hover acceptance
passed. A subsequent full Jest run also hit the existing popup axe test's
5-second timeout; its log is retained as `/tmp/proso-hover-unit-contract-final.log`.
The CPU-capped final run above passes without changing that test or its timeout.

Full delivery remains blocked at `make doctor` by the missing generated Prisma
client; no cross-family review was reached. Feature 095 public acceptance is
still separate from the internal-dispatch Firefox diagnostic. The older
`hover-affordance-gate.mjs` assumes fresh profiles mark on load; its future
public journey must start reading successfully before asserting ambient hover.
This change is local only: no push, PR, merge, or deployment requested.
||||||| parent of be55b5b (fix(audio): confine synthesis and bound chunk admission)

## Update — 21/09/2026: synthesis confinement and admission (257b)

P1.3 confines local-host text POSTs and both Proso API fetch boundaries with
`redirect: 'error'` and `credentials: 'omit'`. `ServerTtsAudioAdapter` delegates
transport to `ProsoApiAdapter`; its source therefore needs no change. Native
Fetch tests inject only the HTTP transport and record every request destination:
307/308 redirects to another host and another port return typed network errors,
with zero requests to the redirected destination. Unprotected control requests
prove the same transport observes a forwarded POST body. Server retries may
repeat a request to the original configured origin; none follow a redirect.

The extension fetch sweep also confines the generic Proso JSON API (license,
checkout and BYOK test payloads), direct settings API-key validation, remote
logging and usage telemetry. Cookie authentication is not used by these paths.
The remaining fetches are exempt from this content-body policy: local-host
health/capabilities, options health/capabilities, first-run capabilities and its
popup forwarding closure are bodyless probes; both export handlers retrieve
already-generated audio URLs with bodyless GETs. No additional text-bearing
fetch boundary was found in `packages/extension/src`.

P1.4 makes the local iterator pull-driven and rechecks the fallback gate before
each subsequent pull, including the pull that primes the next paragraph.
Revocation reports a typed gate error without sending the paragraph to the
secondary. `PlaybackService` changes are confined to `drainChunkQueue`: it waits
before pulling while paused or while two sentences are queued, checks the
captured cancellation signal and generation, and closes the iterator on exit.
The 25 ms admission wait preserves sentences for resume; an already admitted
request may settle, but the queue never exceeds two. The next-paragraph prime
has an abort controller linked to the originating playback signal; cancellation
clears pending primed work and completion removes the listener. Because playback
cancels its signal at paragraph transitions too, an unfinished prime is cancelled
there; completed audio can still be adopted without another request.

Validation on this local, unpushed slice:

- `pnpm --filter @proso/extension lint`: exit 0, 200 files, 68 warnings.
- `npx tsc --noEmit` in `packages/extension`: exit 0, no diagnostics.
- `NODE_OPTIONS=--experimental-vm-modules npx jest --selectProjects unit
  --selectProjects contract --maxWorkers=1`: exit 0; 162 suites and 3,259 tests
  passed, one suite/test skipped; 307.893 seconds. One worker uses the single
  CPU reported by `nproc` in this environment.
- `make fuzz`: exit 0; eight extension and three server property tests,
  `FC_SEED=20260730 FC_NUM_RUNS=100`. Replay with those variables and `make fuzz`.
- `make user-gate`: exit 2 after the built Firefox diagnostic failed with
  “Pausing cleared the reading position instead of holding it.” The first
  diagnostic replay passed; the second failed with “Reading kept moving while
  paused: Sentence timing starts with these spoken -> undefined.” All three
  receipts remain retained. This fixture uses the server/paragraph route, not
  the local chunked route. No claim is made
  that the original anomaly is fixed or that public acceptance passed.
- `GENERATOR_FAMILY=openai make gate`: exit 2 at `make doctor` because generated
  Prisma client files are missing; no cross-family review ran.

Raw output is retained under `/tmp/proso-257b-{lint,types-final,jest,fuzz,user-gate,gate}.log`.
The first browser failure is `/tmp/proso-257b-smoke-first-receipt.json`; replay
logs and receipts use `/tmp/proso-257b-smoke-replay-{1,2}*`. The browser build was
made from this working diff on parent `7e13b13`, before the local commit. Full
Feature 095 public acceptance remains unverified.

## Update — 15/09/2026: catalog lifetime regression

The footer no longer keeps its first nonempty voice catalog for its entire
lifetime. Each menu opening queries the current adapter, removes former choices
while loading, and accepts only the latest opening's response. Hiding the footer
invalidates pending requests. Changed catalogs and out-of-order success/failure
are covered at the footer boundary; a full public-settings host switch is still
unverified, as are push updates while the menu stays open.

The public footer campaign exposed a separate observer error: concurrent sentence
requests can arrive in either order. Retry now matches the failed voice **and
text**, then still requires its response and exact first-word restart in the
highlighted paragraph. First-failure evidence is retained; no playback assertion
was dropped. Evidence: `~/.local/state/proso/reader-controls-2026-09-15/`.

PR #243 remains draft and unmerged. Current routing permits full GLM-5.3 review
of personal-repository code without sensitive logs; Claude capacity is DOWN.
Dependency audit, full Feature 095 acceptance, server clock fixtures and
protected-base eligibility remain separate blockers, not waived by a review.

## Update — 13/09/2026: the footer itself now has a browser actor

`make reader-controls-gate` uses Firefox's platform accessibility tree to reach
the built extension's closed-root controls by public role/name. Native Enter
selects Atlas; Escape closes the list. The local-host fixture records each
selected voice, and acceptance waits for its audio response **and** a visible
restart of the same sentence—not merely a request or an optimistic label.
A predetermined synthesis failure exposes an actionable error; the footer's
Play retries that text and resumes. Close clears the UI and stops new requests.

This found defects missed by the earlier unit-only proof: initial clicks had
two listeners; status changes rebuilt the footer and lost keyboard/focus state;
and the old voice could finish and advance the paragraph while replacement
audio was still loading. The shared lifecycle and voice-change seams are now
repaired with red/green regressions. Screenshot inspection also found the
voice label clipped by the inherited circular-button width; an accessibility
geometry assertion reproduced it, and explicit label-button sizing fixes it.
`make reader-controls-plants` catches omitted
voice-selection and retry actions by their specific failure, rejecting crashes
and stale receipts. Accessibility clients retain a strong service reference in
the disposable browser so Gecko GC cannot drop pending focus requests.

PR #243 remains a **draft, not merged or deployed**. These are fixture-backed
local-host control proofs, not narrator-quality acceptance or the original docs
site's exact freeze. Managed voice catalogs remain empty in ServerTtsAudioAdapter.
Full Feature 095 restart/soak/accounting acceptance, dependency/server-fixture
repairs, independent review and protected-base eligibility remain outstanding.
Durable continuation evidence: `~/.local/state/proso/reader-controls-2026-09-13/`.

## Recovery — 12/09/2026: reader controls (Feature 243)

The interrupted reader repair was still staged: its commit had failed the
three-clone test ratchet, and no remote feature branch existed. Recovery
consolidated test setup without deleting assertions, then reproduced and fixed
four additional footer regressions (external voice labels, Escape, native
keyboard selection, focus retention) and a queued hover pass racing playback.
The shared Firefox launcher also needed geckodriver 0.37's process-level
`--allow-system-access`; all three privilege opt-in cases now pass.

Public popup playback and the local-host fixture journey passed in disposable
Firefox profiles. These do **not** prove live footer voice switching or the
original docs-site freeze is solved. The hover gate observes routed paragraphs,
idle DOM-write counts and responsiveness. The full user acceptance gate remains
blocked by Feature 095; `make verify-full` additionally stops at 14 high-severity
dependency advisory paths discovered against the unchanged lockfile. The
extension suite passes 3,316 tests (one pre-existing skip). The workspace run
also exposes two unchanged Paddle integration failures: their fixed credit
period ended on 12/09/2026 at 17:00 BRT, so validation correctly returns zero
credits. That date-dependent fixture needs its own test repair, not a production
credit-expiry change.

Delivery is **not complete or deployed**. GitHub reports `main` unprotected and
protection HTTP 403; no merge may bypass that gate. The legacy review script
pins retired models, and no exact-head cross-family verdict has been earned.
Continuation: [plan](../specs/243-reader-controls-recovery/plan.md) and
[tasks](../specs/243-reader-controls-recovery/tasks.md). Durable recovery logs and
receipts: `~/.local/state/proso/reader-controls-2026-09-12/` (including first red
results). Do not treat older green receipts below as current release approval.

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

The intended anonymous journey needs no account, license key, or provider key.
**As of 11/08/2026 it has a delivery path for the first time since `9797dc6`**: PR #129
(`505ef0c`) added a user-operated synthesis host — the reader enters an exact destination,
grants the narrowest runtime host permission the browser can express, and page text is synthesized
only at that destination. Browser MatchPattern grammar cannot scope the grant to one port, so the
permission covers the entered scheme and host across ports; Feature 169 adds the missing disclosure
and keeps capability and synthesis traffic pinned to the exact entered origin. Proven live against
a real host: `synthesizes a real article paragraph with no account, no key, no license` (PASS).
Managed Free still returns 402 (`7e4cda0`) and browser `speechSynthesis` remains removed —
neither changed. BYOK remains available on Free, and now covers OpenAI, Groq and Cartesia as
well as ElevenLabs (PR #131, `07c11c5`); before that the adapters existed server-side while
the settings UI shipped one provider card, so three of four were backend-reachable and
user-unreachable. A fixture that returns audio without applying the entitlement still cannot
prove the anonymous outcome — the receipt above is against a real host, not a fixture.

**As of 12/08/2026 that path is also observed end-to-end in a real browser.** PR #147 added
`scripts/local-host-journey-gate.mjs`: a public-control actor configures a host in settings,
grants the origin with a real click, presses Play, and the article is synthesized by the reader's
own host with **zero** requests to `/api/v1/tts/synthesize`. Getting there required fixing three
defects that were still live after PROSO-135/136/137 — see
[Update — 12/08/2026](#update--12082026-the-account-free-journey-observed-end-to-end-and-three-defects-it-found).

Feature 100 proposes a user-operated local appliance as a second audio source that needs no
account, license key, or provider key. Nothing of it is on `main`: the spec is at
`specs/100-local-appliance-tts/`, the adapter is open in PR #95, and no local provider is wired
into the route above. The route sentence stands unchanged until that lands.

## Evidence ledger

| Status | Claim | Evidence |
|---|---|---|
| ✗ | Current `main` allows a no-key managed request | Commit `7e4cda0` returns 402 before cache/provider work; the earlier behavior at `55add09` is superseded. Unchanged by PR #129 — the account-free path is a host the reader operates, not a relaxation of the managed entitlement |
| ✓ | A reader with no account, no license key and no provider key can hear an article | PR #129 (`505ef0c`, 11/08/2026). `LocalHostAudioAdapter` synthesizes against an address the reader enters; `tests/integration/local-host-live.test.ts` passed against a live host (env-gated by `LOCAL_HOST_E2E_URL`), re-run independently by the orch. The route is **off by default** (`defaults.ts:47 localHostEnabled: false`); the **address comes only from the reader** — `grep -ri "orangepi\|tailf59220\|4pro" packages/extension/src` returns 0, with no mDNS/subnet/loopback probe; and install-time `host_permissions` remain unchanged. Correction from Feature 169 exact-head QA: the earlier `${origin}/*` claim was not an effective exact-origin grant for non-default ports. MatchPattern cannot encode a port, so the repaired runtime request uses the entered scheme and host, discloses its across-port breadth, and keeps actual network use pinned to the exact persisted origin. Latency is handled rather than hidden: the host does not stream, so synthesis is chunked at sentence granularity — measured live, first audio arrives in 0.52s instead of the 4.29s a paragraph-sized request takes |
| ✓ | A deterministic downstream oracle joins extraction, fixture synthesis, audio adaptation, cache, highlight timeline, and controls | `make smoke-reader`; the fixture bypasses the current Free entitlement and is not anonymous-outcome evidence |
| ✓ | Focused server route and extension orchestration suites pass | Commands below |
| ✓ | Static gates process real code and changed evidence | `make quality` resolves 501 modules / 805 dependencies, classifies 73 Knip findings and 136 clone groups, and rejects new debt |
| ✗ | The existing Chromium audio E2E proves reading works | It can pass without initiating or observing a TTS request and clears errors |
| ✗ | CI `security-audit` is a dependency gate | The job still has `continue-on-error: true` (its removal is a separately gated workflow change, not yet landed), so a green job remains non-evidence. What changed on 06/08/2026 (PR #109, `e904cd1`): the local `make security` gate now fails closed — `scripts/dependency-audit.sh` mirrors the CI command (`pnpm audit --audit-level=high`) without `continue-on-error` and is falsified by plant: pinning `vite@8.0.1` in the log-gateway scope (with the root overrides removed) made it exit 1 with high vite advisories (3 in the eng's plant — GHSA-v2wj-q39q-566r / GHSA-p9ff-h696-f583 patched ≥8.0.5, GHSA-fx2h-pf6j-xcff patched ≥8.0.16 — 4 in the qa replicate), reverting restored exit 0. Remediation: `vite` pinned `>=8.0.16 <9.0.0` in `services/proso-log-gateway` — the only high path in the workspace; the pre-existing range-key overrides do not match vitest's `^8.0.0` peer spec, which is why `vite@8.0.1` survived them. Pre-fix `pnpm audit --audit-level=high` on main: exit 1, 9 findings (3 high + 6 moderate); post-merge: exit 0 (4 moderate). GitHub's alert board on 06/08: 0 critical / 4 high (all vite) / 7 medium — the earlier "2 critical" figure was a stale 05/08 snapshot, auto-closed since; Dependabot rescans on push and is expected to close the 4 vite highs (unverifiable while the Actions outage persists). Remaining moderate, no upstream fix: `request` SSRF via `web-ext>sign-addon`, `uuid` via `jest>node-notifier` / `web-ext>sign-addon` / `testcontainers>dockerode` (dev-only paths). QA gate: 6/6 PASS re-run from the branch (plant replicated and reverted); different-family review (codex): PASS, zero findings. All verification is local (Actions outage, `[pending] Pedro`). |
| ✗ | A green CI `visual-tests` job means visual tests passed | The job still has `continue-on-error: true` (its removal is a separately gated workflow change, not yet landed), so the green badge remains non-evidence. What changed on 06/08/2026 (PR #111, merged `0b8c1da`): the Firefox visual suite is green on Linux with committed baselines and falsifiable assertions — `pnpm --filter @proso/extension test:visual` exits 0 (36/36 — 34 with real assertions + 2 pre-existing vacuous settings tests, next-slices #10) on the merged tree, reproducing the historical figure (26 ran / 24 failed / 2 passed from PR #63) as a red state that is now fixed. The 30 Linux baselines (`*-firefox-visual-linux.png`) were reviewed programmatically (light/dark means, teal accent pixels present); 8 dead pre-rename `*-firefox-linux.png` baselines deleted. The keyboard suite's historical failures were blind tab counts (Tab×3 lands on paragraph 2, not the first play button) plus a weakened proxy (tests injected their own keydown listener to fake Enter/Space); the suite now creates the shipped native `<button>` icons (incl. the `proso-play-icon--inline` branch), asserts `document.activeElement` per tab step, and asserts native button activation. The gate is falsified by plant: removing the `.proso-selectable` padding/margin token from `src/styles/content.css` turned 14 tests red (13842 px diff > 2 % threshold, exit 1); removing the play-icon `aria-label` turned the keyboard ARIA test red (exit 1); both reverted → 36/36 green. Threshold limitation recorded: a 28 px icon color change is ~0.15 % of pixels and does NOT trip the 2 % `maxDiffPixelRatio` — small-area breaks need bigger plants or a tighter threshold (next-slices #11). Two further limitations recorded with the merge: (a) the fixture page loads `src/styles/content.css`, which is dead in the shipped path — the content script injects its own inline copy (`entrypoints/content.ts`, nothing imports `content.css`) — so the CSS plant and the snapshots exercise the fixture's stylesheet, not the shipped one, and a shipped-side style regression would not trip this gate (next-slices #11); (b) the 2 pre-existing vacuous settings tests assert `count() > 0` on a `settings-api-keys-section` testid that does not exist in the built settings page (next-slices #10). Runner note: on this NixOS host the suite needs Playwright's Firefox with a nix-shell `LD_LIBRARY_PATH` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. |
| ✓ | The current Chromium E2E command completes | PR #63 reported 27 passed; this still does not exercise or prove the current reading/audio route |
| ✓ | Packaged Chrome reading works | PR #115 (`ef89924`, merged 07/08/2026 16:0x BRT) implements the spec-106 verdict: a worker-safe `Audio` shim (`OffscreenAudioElement`, `packages/extension/src/adapters/audio/offscreen-audio-element.adapter.ts`, 263 lines) installed on `globalThis.Audio` only when `typeof Audio === 'undefined'` (`:259-263`, wired at `entrypoints/background.ts:55` before any `new Audio()`), proxying to the shipped offscreen-document protocol, plus the `"offscreen"` manifest permission scoped to Chrome via a WXT per-browser transform (`env.browser === 'chrome'`). `make chrome-mv3-diagnostics` goes GREEN on both legs (18 checks, 0 failed, exit 0) — C1 `typeof Audio === 'function'` in the MV3 worker, C2 popup start journey completes with a TTS request observed and the footer visible. Falsified both directions: reverting the shim reproduces the original C1/C2 RED failures identically (exit 1); the Firefox MV2 leg (9/9) and `PlaybackService`'s own 54-test unit suite are unchanged and green; zero `PlaybackService` edits. Verified independently before merge: the built manifests carry `offscreen` 1× in `.output/chrome-mv3` and 0× in `.output/firefox-mv2`, and every `PlaybackService` touchpoint (`src`, `play`, `pause`, `currentTime`, `duration`, `paused`, `playbackRate`, `timeupdate`/`ended`/`error`) has a shim implementation with native semantics (`duration` returns `NaN` before metadata, which the caller's truthiness guard at `playback-service.ts:351` handles correctly). QA gate: 6/6 PASS re-run from the branch. **No different-family adversarial review is recorded** — the codex harness was banned fleet-wide on 07/08 and the DeepInfra lane has no balance, so this landed on the qa gate plus the orch's own code verification. One known gap, unrelated to this change: the Chrome leg's C3 `playback.getState` roundtrip answers "Unknown message type" on the first call (a pre-existing handler-registration race in untouched code at `background.ts:368`; the Firefox equivalent is correct) — see next-slices #13. Environment findings retained from the gate: `chrome.offscreen` is `undefined` without the permission (Chrome for Testing 151); branded Google Chrome 137+ rejects `--load-extension`, so the gate drives Chrome for Testing with a NixOS `LD_LIBRARY_PATH`, and the repo's own `test:e2e:ext` fixture uses the same dead pattern on this host (adjacent debt) |
| ◐ | The real Firefox downstream reader route works | On 02/08, a built MV2 extension reached fixture TTS, visible footer/highlight, pause, and resume. The actor directly invoked `ExtensionParent`/`shortcuts.onCommand()`, so this is diagnostic-only and does not prove public controls or the full invariant/anomaly contract |
| ✓ | A public-control actor reads an article **from the reader's own host, with no account** | `node scripts/local-host-journey-gate.mjs` (PR #147) exited 0 with `local-host-journey-gate PASS at bda64a0`, 12/08/2026 16:2x BRT. The actor types a host address into settings, clicks "Test connection", clicks "Enable the local synthesis host" (a REAL WebDriver click — `permissions.request()` refuses to run without a genuine user gesture, so the grant cannot be simulated), then reads the article through the Unified Extensions button, the browser action and the popup's "Play". The receipt: `the reader's own host synthesized the article — 130 chars, voice en_US-ljspeech-medium` and `the managed route was never called — 0 requests to /api/v1/tts/synthesize`. Nothing about the local host is seeded; the gate fails closed if the engine only *claims* to have adopted the host. **Superseded on 17/08/2026 by Feature 185 (PR #185):** that caveat — "synthesis is a fixture speaking the appliance's wire contract, so this proves the account-free ROUTE, not the appliance itself" — no longer describes the strongest available run. `LOCAL_HOST_APPLIANCE_URL=https://orangepi4pro-b.tailf59220.ts.net node scripts/local-host-journey-gate.mjs` exited 0 at `3cf70e1`: real Firefox, public controls, and every audio byte from the real Orange Pi (pre-flight `ready, build 1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3`; capabilities answered `2 voice(s)`; route adopted `en_US-ljspeech-medium` — the appliance's own voice). The fixture still serves the article and still stands in for the MANAGED endpoint, so `0 requests to /api/v1/tts/synthesize` still holds. One honest weakening comes with it, recorded in the receipt's `relaxations`: real hardware has no request log the gate can read, so appliance mode proves the audio by the popup announcing "Pause" (`status: 'playing'`, which a failed `audioElement.play()` short-circuits before reaching, `playback-service.ts:1086-1089`) rather than by inspecting a request body. **The first draft asserted the visible reading state instead and was wrong**: `showFooter` and `highlightParagraph(0)` run at `playback-service.ts:157-181`, BEFORE any synthesis request, and survive the error path — the different-family review caught it, and the claim was verified false against the code before the fix landed. Attribution is now earned in order (audio decoded → managed route at zero → appliance named), because "audio played" alone does not say whose: under the `server-route` plant the managed fixture plays perfectly well, and the draft printed `real appliance` in exactly that case. Falsifiable in appliance mode: `server-route` and `no-enable` FAIL with **0** occurrences of the attribution line (measured); `host-down` is BLOCKED there because it replaces the host address and would be a fixture-mode result wearing an appliance label. Unreachable hardware reports BLOCKED with exit 2 — the draft hung forever instead, the fixture socket holding the event loop open |
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
| ✗ | Any GitHub Actions result on this repo is currently evidence | Every run since `2026-08-05T20:52Z`, `main` included, is `startup_failure` with `name: ""`, `path: "BuildFailed"` and `total_count: 0` jobs (`gh run list`, `gh api .../actions/runs/31049046583/jobs`). The last runs that executed jobs are `CI` and `Server CI` at `2026-08-02T17:34Z`. No workflow file changed since `b2b74e4` (PR #70, 01/08), so the cause is not a tracked workflow edit. Cause established 14/08/2026: private-repository Actions metering on a free personal plan — public repositories on the same account still run Actions, private ones stopped, and `rulesets` 403s with `Upgrade to GitHub Pro`. Still true nine days on, so this row stands; see [the resolution](#github-actions-produces-nothing-at-all). The same 403 means the repository has no branch protection either, so no required check has ever gated a merge here. **Superseded for CI purposes on 24/08/2026:** the merge gate no longer runs on GitHub at all — `ci.yml` and `server-ci.yml` moved to `.forgejo/workflows/` and execute on the self-hosted Forgejo Actions runner (NixOS PR #1986). GitHub dispatch is no longer required for a CI verdict, and no GitHub Actions minute is consumed by push or PR. What this row still asserts, unchanged: no *GitHub* check gates a merge, and branch protection remains unavailable on this plan, so a green Forgejo run is evidence a human/agent must read rather than an enforced gate |
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

**Resolved to a cause on 14/08/2026 — private-repo Actions metering on a free personal plan.**
The outage is now nine days old and still live: every run since `2026-08-05T20:52Z` is
`startup_failure`, and the three PRs merged on 14/08 (#170, #171, #172) landed with no CI of any
kind. The 05/08 diagnosis left two candidates open — account-level billing/quota versus a GitHub
server-side change — and could not separate them because the billing API needs a `user` scope `gh`
does not have. **Repository visibility separates them without that scope**, because public
repositories get unlimited free Actions minutes while private ones draw on the account's monthly
allowance:

```bash
gh run list -R phsb5321/Tauri-PDF-Reader --limit 5   # public: queued 2026-08-14T17:01Z
gh api repos/phsb5321/NixOS/actions/runs?per_page=100 \
  --jq '[.workflow_runs[].conclusion] | group_by(.) | map({c:.[0], n:length})'
  # private: 70 startup_failure / 20 success / 10 failure; nothing since 2026-08-01
gh api repos/phsb5321/proso/rulesets   # 403 "Upgrade to GitHub Pro or make this repository public"
```

A GitHub server-side defect would not respect repository visibility; metered minutes do. The
sibling private repository `NixOS` stopped at `2026-08-01T03:34Z` and `centavos` at
`2026-07-02T03:22Z`, while the public `Tauri-PDF-Reader` queues and runs work today — so the
failure is account-wide across private repositories and absent on public ones. The `rulesets` and
`branches/main/protection` endpoints both return 403 `Upgrade to GitHub Pro or make this
repository public`, which independently confirms the free personal plan whose private-repository
Actions allowance is capped. Reading the billing page itself still needs `user` scope or a
browser, so the final confirmation stays `[pending] Pedro`; the cause is no longer ambiguous.

A consequence worth stating separately, because it is not the same claim as "the audit job is
`continue-on-error`": **this repository has no branch protection and no rulesets at all.** They are
not misconfigured — on a free plan they are unavailable for a private repository, which is what the
403 above says. No required check has ever gated a merge here. The nine-day CI blackout was
therefore both invisible and ungated, and `make verify` / `make gate` on a developer machine are
not merely the best available verification surface, they are the only one.

Which is why the first thing checked after the diagnosis was whether that surface tells the truth,
and it did not. `make verify` on `main` at `528f178` exited 2 with ~30 server `tsc` errors of the
form `Property 'paddleTransactionId' does not exist on type 'SubscriptionUpdateInput'`. **`main`
was not broken** — `packages/server/prisma/schema.prisma` carries every one of those fields
(added 13/08 by `de57d29`, PR #156), but the generated client in `packages/server/src/generated/`
was dated 11/02 and 04/03, five months stale. `scripts/delivery-doctor.sh` is the gate that exists
to catch exactly this, and it passed, because line 25 tested only that `client.ts` *existed*.
Regenerating (`scripts/generate-prisma.sh`, which already carries a working NixOS engine fallback)
returned `make verify` to exit 0, confirming `main` itself is green and that nine days of
unverified merges did not break the deterministic floor.

The doctor now fails closed on drift instead: `scripts/generate-prisma.sh` records the schema's
sha256 beside the client it generated, and the doctor refuses a client whose stamp does not match
the current schema. Proven both directions by plant — appending a line to `schema.prisma` turns
`make doctor` red naming both digests (`generated from schema 0c97b234c74d, current schema is
a61a57ef3f57`), deleting the stamp turns it red as `predates schema-drift tracking`, and restoring
either returns exit 0. That second message is the one existing checkouts will see, since a client
generated before this change has no stamp at all. The stamp is written on both generation paths,
including the NixOS engine fallback, which is the path that actually runs on this host.

The different-family adversarial review of that fix then found four more gates failing open, none
of them introduced by it, and all four were verified against the code before being accepted. A
quality baseline with no `expires` **never expired**: `Date.parse("undefinedT00:00:00Z")` is `NaN`
and `NaN < Date.now()` is `false`, so `knip-ratchet.mjs` and `osv-ratchet.mjs` stopped ratcheting
instead of failing, and `check-active-docs.mjs` carried the same bypass for a malformed value.
Ownership metadata was checked as `typeof x !== 'string'`, which accepts `''`, so a finding could
be baselined with a blank owner and reason and still satisfy the contract that tracked debt is
owned debt. The gate receipt validated its `verifiedAt` as any string. And a receipt bound to the
wrong base validated: the base was compared only when `DIFF_BASE_REF` was set, which is precisely
how `adversarial-review.sh` calls it, so a receipt written against `HEAD^` passed and the reviewer
was then handed that same truncated bundle. Fixing that one took two rounds — defaulting the
expected base still let an *inherited* `DIFF_BASE_REF` choose it at both ends, so the delivery
review is now pinned to `origin/main` for validation and bundle construction alike.

One correction is worth recording because the gate caught its own author: the first draft of the
date validator asserted in a comment that out-of-range dates do not parse. Planting `2026-02-30`
disproved it — the value parses finite and rolls forward to `2026-03-02` — so the validator now
round-trips the parsed date back to `YYYY-MM-DD`, and the comment records the measurement rather
than the assumption.

A limitation found while running all this, and not fixed here: **`make verify-full` is not
reliably deterministic under machine load.** Three tests assert wall-clock budgets and failed on a
loaded host, then passed unchanged on a quiet one — `franc-min` initialization (budget 50 ms;
observed 6 ms isolated, 27 ms, 43 ms, and 79 ms across identical trees) and two server TTS
adapter tests that time out at Jest's 5 s default despite a mocked `fetch`. Every failure was
transient and none reflected a code change, but a deterministic gate that reddens on unrelated
CPU contention trains readers to re-run rather than read, which is the habit this repository has
spent several features removing. Recorded as next-slice #24.

Remediation is Pedro's, and the options are not equivalent: raising the Actions spending limit
above `$0` restores private CI immediately but costs per-minute; waiting for the next billing
cycle restores the included allowance for free but leaves the gap open until then; a self-hosted
runner on the existing NixOS server is not metered at all and would also survive future
exhaustion; making the repository public restores unlimited minutes *and* branch protection, but
that is a product decision, not an infrastructure one.

## Update — 12/08/2026: the account-free journey observed end-to-end, and three defects it found

**The three-PR chain did not fix the 402.** PROSO-135 (#144), PROSO-136 (#145) and PROSO-137
(#146) were each real, each verified, and after all three a reader with a configured, granted,
reachable host still pressed Play and got a billing error. `scripts/local-host-journey-gate.mjs`
(PR #147) is the observation whose absence allowed that: it reports **which endpoint received the
synthesis request**. Its first run on `bda64a0` said
`route taken: 4 managed /api/v1/tts/synthesize, 0 local /v1/tts`.

The adapter-level receipt passed throughout all three bugs and could not have caught any of them
— `tests/integration/local-host-live.test.ts` synthesizes real audio against the real appliance
(re-run live 12/08, PASS in 2.8 s) and never touches the wiring between the popup click and the
adapter, which is where every one of these defects lived.

Three defects were live on `main` after the chain, each found by this gate and each fixed here:

1. **The settings page discarded the address the reader typed.** `saveLocalHostSettings` stored
   `localHostUrl: enabled ? url : null`. The debounced save on `input` fires 600 ms after typing,
   while the enable box is still unchecked — the order every reader uses — so it wrote `null` over
   the address; `storage.onChanged` then pushed that `null` back into the field through
   `syncProviderUI` and the input cleared itself. Enable then failed with "Enable requires a valid
   https:// address", the provider stayed managed, and playback 402'd. Measured directly: after
   typing, storage held `localHostUrl: null` and the field read `""`. Fix: persist the address
   independently of `enabled` — remembering an address is not enabling a route, and nothing is sent
   anywhere until `localHostEnabled` is true AND an effective browser-valid host grant covers the
   exact destination, both still enforced in `composition/factories.ts`; network use remains pinned
   to the exact persisted origin.
2. **The local route still fell through to the managed one.** PROSO-137 closed the gate path, the
   throw path and the single-shot `Err` path, but not the chunked path's first-chunk
   fall-throughs. `LocalHostAudioAdapter` sets `supportsChunkedSynthesis = true`, so the local
   route ALWAYS takes the chunked path — the one still unguarded. That is why the reader's own
   host failing still read as "buy a plan". Fix: honour `failClosedOnGate` in all three remaining
   chunked fall-throughs. Managed requests went 4 → 0.
3. **`PlaybackService.setLanguage()` was called from nowhere**, so `detectedLanguage` was `null`
   for every request. Managed providers hid it by choosing a voice server-side; the reader's own
   host cannot, and declines an undetermined language rather than reading English text in a
   Portuguese voice (spec 100 D-2) — so the local route answered "Language not supported: und" for
   every article. Same dead-wiring shape PROSO-136 found with `subscribeToSettings()`. Fix:
   `playback.start` derives the language once and gives it to both the footer and synthesis, so
   the language the reader is told is the language they hear.

Falsifiability. `node scripts/local-host-journey-plants.mjs` reports
`local-host-journey-plants PASS — 6 runs, every break caught`: the unsevered run PASSes,
`server-route` (the PROSO-135/136 shape — provider forced back to a managed one) FAILs,
`no-enable` FAILs (storing an address alone never routes audio to it), `host-down` FAILs, a
renamed enable control is BLOCKED, and a gate pointed at a missing script reports CRASH rather
than scoring as a caught plant. Scoring is on the gate's own verdict line, not its exit code — the
lesson PR #98 paid for. Source-level falsifier of the load-bearing fix: reverting the
`setLanguage` call turns the gate red (`Language not supported: und`, 0 local requests, and
notably 0 managed — so the fail-closed fix holds independently); restoring it returns PASS.

The extraction that made this possible: the sibling gate's actor vocabulary moved to
`scripts/lib/firefox-popup.mjs` and both gates now share one copy. `public-actor-gate` was re-run
after the extraction and still reports `PASS at bda64a0`. One genuine improvement rode along — a
control's accessible name is its `aria-label` when it has one and its own visible text when it
does not, because the popup's "Grant access" button is named only by its text and a screen reader
announces it.

What this does NOT prove, recorded in the gate's own receipt rather than left implicit: the
optional-permission doorhanger is not exercised (`extensions.webextOptionalPermissionPrompts=false`
— the request, its user gesture and the resulting grant are real, the prompt is not); the process
model is still relaxed (`extensions.webextensions.remote=false`, inherited and unchanged); and the
synthesis host is a fixture speaking the appliance's wire contract, not the appliance.

Extension unit suite 2446 passed (was 2443; the 4 new tests include two that pin the chunked
fail-closed paths). The `playback.handlers` mock had no `setLanguage`, which is how the dead
wiring stayed invisible — the same shape PR #144 found with `setProvider`, and the mock is fixed
rather than worked around.

## Update — 15/08/2026: pilot release readiness, and two gates repaired

The pilot was driven end to end today. Three things are worth recording here
rather than only in `specs/176-pilot-release/`, because this is the document a
later reader trusts.

**The deploy path is proven at `9bd5b88`, and it is still HELD.**
`make subscription-deploy-rehearsal` PASSes all 16 phases against a disposable
PostgreSQL with dummy secrets — the checked-in predeploy (bridge → `db push` →
bridge), schema invariants, production boot fail-closed on a short licence
secret, the real `AppModule` under `NODE_ENV=production`, account-free claim
`202`, signed webhook committed atomically, claim issuance, fresh-process replay
exactly-once, and an injected pre-commit fault rolling back every commerce row.
`make dokku-check` nevertheless returns **HELD (exit 2)** on the five `PADDLE_*`
names, which exist nowhere — the vault holds only an archived Paddle *signup*
login. The gate checks env **names**, not values, so five empty strings would
flip it green; that was considered and rejected, because it manufactures a green
verdict without changing anything real. The hold is itself a tested invariant
(`held-missing-paddle` in `dokku-deploy-preflight.self-test.mjs` asserts exit 2).

**The live site is not merely stale — it is untrue.** Measured today against the
running site, not inferred from the repo:

```bash
curl -s https://proso.com.br | grep -ioE "unlimited browser tts|free tier works immediately|coming soon"
# 3× "Coming Soon", 1× "free tier works immediately",
# 1× "unlimited browser TTS", 2× "Unlimited browser TTS"
curl -s https://proso.com.br/updates.json   # v1.2.1, current
curl -s https://api.proso.com.br/health     # no `revision` field → pre-#162 container
```

Browser `speechSynthesis` was removed in `9797dc6`, and managed Free answers
402, so both advertised claims are false. The cause is not the site code — the
built tree is correct and contains zero "Coming Soon" — it is that every
site-affecting commit (#151, #155, #165, #167) merged *during* the Actions
outage and never published. The last successful Pages deploy was 01/08/2026
21:01Z. One constraint governs every fix: `updates.json` + `releases/` are the
extension auto-update lifeline (`wxt.config.ts:101` hardcodes the URL), they are
currently live and correct, and a migration that forgets to copy them stops
updates for every installed user with no visible error.

**Two gates were repaired, both found by re-running against the real deploy
base.** Running `verify-full` with `DIFF_BASE_REF=e6b412f` — the SHA Dokku
actually serves — rather than `origin/main`, where a fresh branch has an empty
diff and every diff-scoped ratchet is vacuous, surfaced: two `proso.raw-numeric-z-index`
hits in the server-status-popover harness, now `var(--z-hostile-plant, 9999)`;
and one gitleaks hit on a historical test-fixture blob (`2899773`), now
baselined by fingerprint per the five existing `.gitleaksignore` entries. The
tokenization was proven not to neuter the plant by running the harness's own
suite in its own Firefox:

```
make server-status-popover-plants
  ok  plant card-covers: FAIL (guards the topmost overlap probe — a card stacked
      over the popover must turn the topmost assertion red)
server-status-popover-plants PASS: 4 caught, 0 missed
```

That is the discriminating check: had the token silently resolved to `auto`, the
plant would have gone green and the suite would have reported a miss.

## Update — 15/08/2026 (late): the site copy is fixed, and Pages builds are metered too

The false free-tier claim is repaired at source, and the branch-based publish
workaround was tried end to end and **does not work on this account**. Both
results are measured, not inferred.

**The claim was checked against the running API, not the repo:**

```bash
curl -s -X POST https://api.proso.com.br/api/v1/tts/synthesize \
  -H 'Content-Type: application/json' -d '{"text":"probe","provider":"openai"}'
# HTTP 402 — "Managed TTS is not included in this tier. Attach your own provider
#   API key in settings (free on every tier), or use a local synthesis host you
#   run yourself."
```

So "the free tier works immediately" was false, and `packages/site/index.html`
now says what the 402 says: add your own provider key, or point Proso at a host
you run. The pricing table needed no change — Free already lists BYOK as included
and Managed voices as excluded, which is exactly right.

**Branch-based Pages is not a way around the Actions outage.** The full built
tree was pushed to `gh-pages` (`34760c5`) with `updates.json` + `releases/`
preserved byte-identically, `build_type` was switched `workflow` → `legacy` with
`source.branch: gh-pages`, and `POST /pages/builds` answered
`{"status":"queued"}`. **No build was ever created** — `/pages/builds` still
reports its newest build as `2026-02-08T20:24:40Z`, across three pushes and one
explicit trigger. A `queued` response that never schedules is the same signature
as the Actions outage: Pages builds draw on the same metered account. This is
not a misconfiguration and cannot be fixed from inside the repository.

`build_type` was restored to `workflow`, its original value. The live site was
never harmed — it still answers 200, and `updates.json` still hashes to
`46c5ea74e0de71b0ab495958f81e034be94ad14cd0acf86eb2c0e37d2e1cffb5`, byte-identical
to what it served before, with both manifest `update_hash` values still matching
their `.xpi` bytes.

What this leaves is a staged win rather than a shipped one: `gh-pages` now holds
the correct, truthful site with the auto-update lifeline intact, and it publishes
the moment publishing is unblocked — either Actions restored, or that tree served
from a host that is not metered.

## Update — 22/08/2026: daily Firefox Nightly updated and pointed at the real appliance

Pedro's daily Firefox Nightly profile (`main-session`, Nightly 154.0a1) carried
Proso **1.2.6** while the repository and the dedicated `proso-dev` profile were
at **1.2.9**. The public self-update feed was not a usable upgrade path:
`https://proso.com.br/updates.json` still advertised only 1.1.3 and 1.2.1.
This was therefore a local Nightly deployment, **not** a public signed release.
Nightly has `xpinstall.signatures.required=false`; the signed-unlisted release
remains a separate open distribution task.

A clean 1.2.9 Firefox artifact was built from merged `main` at
`1b55615b65ecb7fda41224cd19fca3e80554eb74`, then the daily profile's XPI was
replaced atomically after a graceful browser shutdown. Firefox was relaunched
through the same `app-scope firefox-nightly --name firefox-nightly` desktop
entry and rescanned the add-on as:

```text
version=1.2.9 active=true visible=true appDisabled=false userDisabled=false
XPI sha256=c8e7f1f107c30b0c6b77eae8866e7d99e96e1b8101886e66f90ade56f6b97b49
```

The one-file rollback backup is
`~/.local/state/proso-deploy/20260822-184902/proso-1.2.6.xpi` (the same folder
also retains pre-deploy `extensions.json`, `storage.js`, and hashes).

The upgrade preserved the actual appliance configuration rather than merely
installing code:

```json
{
  "localHostUrl": "https://orangepi4pro-b.tailf59220.ts.net",
  "localHostEnabled": true,
  "localHostVoice": "pt_BR-faber-medium",
  "provider": "local",
  "speed": 1,
  "highlightEnabled": true,
  "autoScroll": true
}
```

Most importantly, the same final **unpacked build output** was exercised with
the installed `firefox-nightly` binary, not inferred from the earlier
stable-Firefox run:

```bash
FIREFOX_BIN=/etc/profiles/per-user/notroot/bin/firefox-nightly \
LOCAL_HOST_APPLIANCE_URL=https://orangepi4pro-b.tailf59220.ts.net \
  node scripts/local-host-journey-gate.mjs
# local-host-journey-gate PASS at 1b55615... (real appliance ...)
```

The public-control actor entered the host, received two voices, granted the
runtime host permission with a real click, pressed `Play`, observed the popup
announce `Pause` (the decoded-and-playing signal), and recorded **zero**
managed `/api/v1/tts/synthesize` requests before attributing the audio to the
appliance. Exit 0; retained receipt:
`~/proso187-nightly-appliance-Sk63.log`.

This journey ran in a **separate, isolated geckodriver profile** with
`.output/firefox-mv2` loaded as a temporary add-on. It did not drive Pedro's
daily `main-session` profile, and it did not install the packaged XPI. The two
proofs are separate: the daily profile's `extensions.json` + `storage.js` prove
the installed version and preserved configuration after restart; the isolated
profile proves the same final build output can read through the real appliance
under Nightly 154. The deployed XPI is the WXT zip byte-for-byte (matching
SHA-256 above), but the gate exercises its unpacked source directory, not the
archive itself.

Two non-green facts stay explicit. First, `make user-gate` still exits 2 because
Feature 095's broader anomaly/restart/soak and unified-receipt contract remains
BLOCKED; this focused real-appliance journey does not rewrite that verdict.
Second, `scripts/oracles/account-free-reading-path` does not recognize the
shipped user-operated-host route: it checks managed TTS and browser
`speechSynthesis` only, matching spec 095's literal falsifier wording. Whether
the appliance route satisfies that invariant is an unresolved scope conflict,
not an established oracle defect. Do not use that oracle's PASS/FAIL as the
verdict for this route until the spec and oracle are reconciled.

## Update — 22/08/2026 (late): daily Nightly now reads from desktop Supertonic

No extension production change was needed. Proso 1.2.9 already has the correct seam:
`LocalHostAudioAdapter`, a reader-entered address, a runtime host grant, sentence chunking,
local caching, and public playback controls. The desktop model was instead wrapped with the
contract that seam already consumes. `supertonic-1.3.1+proso-bridge.2` binds only
`127.0.0.1:5301` and adds `GET /health`, `GET /v1/capabilities`, and idempotent
`POST /v1/tts` returning WAV while retaining native, OpenAI-shaped, and chunked-stream routes.
It publishes the same ten Supertonic styles for English and Brazilian Portuguese (20
language-qualified voice ids), so automatic article-language selection remains honest.

The first real-host browser run went red after connection and the runtime grant:

> The settings UI reported the host was configured, but the background never adopted it as the
> audio route

The product had adopted it. The oracle compared `audio.getVoices` only to the fixture's hard-coded
Orange Pi ids, so any conforming host with another voice list failed before playback. Feature 193
repairs the oracle at its root: real-host preflight reads `/v1/capabilities`, fails BLOCKED on an
empty list, and attributes background adoption to the ids that host actually published. Fixture
mode retains its own fixture ids. The plant sweep now includes both sides of that branch: a real-host
stub with unrelated voice ids must PASS, while a ready host with an empty catalog must BLOCK before
Firefox launches; all eight plant/control/self-check runs were caught. Against Supertonic, the real
Firefox Nightly journey then reached 20 voices, decoded and played audio, advanced the visible
reading UI and highlight, and recorded zero managed `/api/v1/tts/synthesize` requests.

Pedro's daily `main-session` profile was configured separately through Firefox's public AT-SPI
roles and actions — the existing Proso Settings tab, `Host address`, `Enable the local synthesis
host`, `Test connection`, the `Proso` browser action, `Play`, and `Stop playback`. Live settings
now hold:

```json
{
  "localHostUrl": "http://127.0.0.1:5301",
  "localHostEnabled": true,
  "localHostVoice": null,
  "provider": "local"
}
```

`Test connection` announced `Connected — 20 voice(s) found.` Public Play on the existing Readeck
article produced 27 successful local `/v1/tts` responses; public Stop ended the run, and the service
journal remained empty for the following 30 seconds. The installed XPI is unchanged at 1.2.9,
SHA-256 `c8e7f1f107c30b0c6b77eae8866e7d99e96e1b8101886e66f90ade56f6b97b49`.
The retained operational receipt is
`~/.local/state/proso-deploy/20260822-212828-supertonic-nightly/receipt.json`. The isolated
real-host journey was re-run after commit and passed at exact HEAD
`b28da54ef582df38fc3683a907cab08f0efe109f`; its log SHA-256 is
`a9a589d20b4c8b17e511d3f41f7bb8ec675b8e43fb272aa07f072149899efa8d`.

The full gate also exposed an inherited PR #183 split-brain: `deepmerge-ts` was reviewed and added
to the exact-path dependency-audit allowlist, but its same OSV fingerprint was absent from
`quality-baselines/osv.json`, so `make gate` remained red on every branch. Feature 193 adds that
already-reviewed fingerprint without changing either scanner or its expiry.

Two limits remain explicit. The verified HTTP service is the CPU bridge and is transient across
reboot. A standalone WebGPU/Vulkan run on the RX 5700 XT reached RTF 0.056 (17.86× real-time), but
its HTTP service launch did not reach readiness and is not the route Firefox uses. Human naturalness
and voice preference also remain a listening decision. The broader `make user-gate` Feature 095
verdict remains BLOCKED; this focused, falsifiable real-host journey does not rewrite it.

## Update — 23/08/2026: daily route keeps its contract and moves to Qwen 1.7B

Pedro superseded the two-times-real-time selection floor: model size now wins even when synthesis is
slower than playback. The extension and its daily-profile settings did not change — they still use
the reader-entered `http://127.0.0.1:5301` route, automatic language selection, the runtime origin
grant, and `provider: local`. The host behind that stable contract is now Qwen3-TTS 12Hz 1.7B
CustomVoice Q8_0 on the RX 5700 XT, not Supertonic.

The replacement remains account-free and loopback-only. It publishes the same 20 language-qualified
Proso voice identities over Qwen's nine built-in speakers and preserves health, capabilities,
idempotent WAV, native, OpenAI-shaped, and streaming routes. Unsupported speed and diffusion-step
controls fail 422 instead of being silently ignored. The former Supertonic runtime was removed, so
exactly one desktop TTS model remains deployed.

The representative PT request measured 34.698 s for 14.880 s audio (RTF 2.332), while native
streaming produced first audio in 0.323 s. This is intentionally below real time under the new
selection rule. GPU busy reached 99%; peak total VRAM was 7,231,434,752 of 8,573,157,376 bytes.
Whisper recovered all lexical content with two numeral substitutions over 28 words, but human
naturalness remains Pedro's listening decision. The complete receipt is
`~/tts-bench-20260822-desktop/qwen3-tts-1.7b/evidence/`; the machine-readable selection is
`~/tts-bench-20260822-desktop/comparison-evidence/selection.json`.

The focused real-host actor passed against Qwen at `636b828`: preflight found the Qwen build and 20
voices, the background adopted the English aliases, public Play reached decoded audio and visible
highlighting, and the managed route remained at zero requests. The retained gate log is
`~/tts-bench-20260822-desktop/qwen3-tts-1.7b/evidence/proso-real-host-gate.log`.

The service remains transient across reboot. Child death and abandoned-stream contention have live
recovery receipts, but persistence is still a separate NixOS slice rather than an implied property
of this model switch.

## Update — 22/08/2026 (later): sentence-bounded word sync and tab-focus playback

A daily-Nightly screenshot exposed a real local-host defect rather than a Supertonic quality
judgment. The host synthesizes one sentence per clip, but `PlaybackService` estimated the **whole
paragraph** against each clip. At the first transition, `chunkPlayedMs` was also still zero, so the
second clip restarted the paragraph audio clock at zero. Two pre-fix regressions independently went
red: the first published timeline contained both sentences instead of sentence one, and a repeated
word in sentence two wrapped the matching occurrence in sentence one.

Feature 196 fixes the shared chunk path once. Each yielded clip is associated with the same
`splitSentences()` source unit the local-host adapter synthesized; fallback or native timings are
translated from sentence-local offsets to absolute paragraph character/time offsets, and chunk
zero now contributes its measured duration before chunk one starts. The content highlighter
prefers those absolute offsets, so repeated words no longer bind to an earlier sentence. This is
**not provider-measured word alignment**: hosts publishing `markKinds: []` still use a proportional
estimate inside each sentence. The improvement is that the estimate cannot point outside the audio
unit currently playing or reset the paragraph clock at a sentence boundary.

The same feature adds the public, checked-by-default setting **Stop playback when switching tabs**.
With it enabled, `browser.tabs.onActivated` delegates to the one existing
`PlaybackService.stop()` path: the in-flight generation is aborted, audio/prefetch state is cleared,
and the old tab's footer/highlight disappear. The newly active tab does not auto-play; its popup
exposes Play and a public click starts a fresh session. Turning the checkbox off is applied through
`storage.onChanged` without a background restart and preserves the previous background-listening
behavior.

The loaded-Firefox fixture now has a measured two-sentence WAV boundary and two real article tabs.
It observed the active word enter sentence two, then proved both tab modes through the public
settings checkbox and popup controls. The enabled run stopped/cleared/readied and started the
second tab; the disabled run kept Pause and the old page's reading UI. The plant sweep passed 10/10:
control stop, control continue, disabled-while-stop-expected, managed-route, no-enable, host-down,
renamed control, alternate real-host voices, empty real-host catalog, and crashed-run self-check.
The exact regressions additionally preserve native per-chunk timings while offsetting them onto the
paragraph clock.

The final real-host run remained loopback-only and passed the same stop/readiness/fresh-Play path
with zero managed requests against an isolated Supertonic bridge on `127.0.0.1:5303`
(`supertonic-1.3.1+proso-bridge.2`); that temporary verifier was stopped after the receipt. During
this feature, a separate active model-evaluation seat replaced the daily-profile destination on
`127.0.0.1:5301` with `qwentts.cpp-a8a7716+proso-bridge.1`. This diff neither selected nor replaced
that runtime and makes the browser behavior provider-agnostic. The separate Firefox/Mesa
buffer-starvation issue #194 is also not attributed to Proso by this feature: no freeze coincided
with proven Proso playback, and its backdrop-filter performance finding remains a separate issue.

## Update — 23/08/2026 (late): footer controller and dropdowns share one state

Feature 200 (merged as part of this batch) closes the footer↔dropdown sync bugs
found while the reading journey ran live:

- **The footer's language choice now drives the audio.** `language.setOverride`
  wrote only a module-global override that `playback.start` never read, so the
  dropdown's language never reached synthesis — not even on the next start.
  The override now writes the per-tab store `playback.start` reads and
  live-applies through an injected `setPlaybackLanguage` dep, so continuing
  chunked local-host synthesis follows the reader's choice.
- **Footer speed changes are persisted** through the settings store (previously
  in-memory only — lost on restart).
- **Dropdown option highlights track state** instead of going stale until a
  full re-render; speed/language picks no longer rebuild the whole footer
  (also a compositor-damage reduction); Escape and outside-click close both
  dropdowns.

Unit-pinned (9 new tests), full extension suite 2642 passing, `make verify` and
`make verify-full` green, real-host journey PASS at `f7aa9ce`. Different-family
review blocked by lane availability (anthropic oracle capped, DeepSeek refuses
private payloads, groq meta-llama retired) — recorded in the spec research.

## Update — 24/08/2026: CI moved off GitHub to the self-hosted Forgejo runner

The Actions outage is 19 days old and its root cause is an outstanding
US$130.97 invoice (fleet ledger row `interview-copilot-actions`) — Pedro-gated.
Rather than wait on it, the delivery gate moved off GitHub entirely.

The trap worth recording, because it is the obvious wrong answer: a self-hosted
**GitHub** runner does not fix this. The block is at the **dispatch** layer —
runs die as `startup_failure` with **0 jobs**, so GitHub never creates work for
a runner to collect. This was measured on the NixOS repo, whose self-hosted
runner was online throughout. Forgejo Actions replaces the dispatch layer, which
is why NixOS CI kept running while Proso's did not.

What landed:

- **NixOS PR #1986** — the single-purpose `nixos-forgejo-mirror` module became a
  generic `forgejo-mirror` with named instances (`nixos`, `proso`); the runner
  gained `ubuntu-latest`/`ubuntu-22.04` container labels so Proso's pnpm/node
  workflows run verbatim; a new `selfhosted-ci-wired-server` check was falsified
  both ways by plant. (NixOS PR #1988 fixed formatting so `nix flake check`, and
  therefore `deploy-rs`, pass.)
- **This PR** — `ci.yml` and `server-ci.yml` moved to `.forgejo/workflows/`.
  That path is the cost control: Forgejo reads it, GitHub ignores it, so this CI
  cannot consume a paid Actions minute even after the invoice clears. The
  remaining GitHub workflows lost their automatic triggers (`sonar.yml` →
  manual; `deploy-site.yml` → dispatch-only), leaving `release.yml`'s `v*` tag
  trigger as the single deliberate exception, documented in its header.

Honest limits: a green Forgejo run is **evidence, not an enforced gate** —
branch protection is still unavailable on this plan, and Forgejo results do not
post back to GitHub PRs. SonarQube and the site publish are not ported; the site
remains a host decision, not a CI problem.

## Update — 24/08/2026 (late): the self-hosted gate is green, and it immediately earned its keep

The migration recorded above landed and now runs the whole suite. **All five
jobs pass on the server runner at `ec1a993`**: `extension-test`, `server-test`,
`security-audit`, `visual-tests`, `e2e-tests`. Forgejo reports the verdict in
`.status` (its `conclusion` stays null), which is worth knowing before reading
its API.

**Cost goal met and measured, not asserted.** The newest GitHub run record for
this repository reports `jobs created: 0`. No job, no billable minute. Because
CI lives in `.forgejo/workflows/`, that stays true after the outstanding invoice
clears; only `release.yml`'s `v*` tag trigger can still dispatch on GitHub, and
that is deliberate and documented in its header.

**The first real CI run in 19 days found four genuine defects** that the dead
GitHub Actions had been hiding — none of them artifacts of the new runner:

1. A load-sensitive stopwatch (`200 paragraphs … <50ms` measured 54ms). The same
   class PR #183 removed elsewhere; replaced with the observable outcome plus a
   load-independent proxy — 200 distinct texts must occupy 200 single-element
   fingerprint buckets, because bucket collapse is what would genuinely make
   matching slow.
2. Every Prisma contract spec failed. They call testcontainers, which needs a
   docker socket the test process can reach — impossible inside a job that is
   itself a container, and the same reason next-slice #16 recorded them as
   environment-blocked. `TEST_DATABASE_URL` now short-circuits the container so a
   CI-provided database runs the same specs unchanged; local runs keep their
   throwaway container (verified 23/23). **The 23 Prisma contracts gate in CI for
   the first time**, which closes next-slice #16.
3. A shared-database parallelism race — measured 4 of 98 failing because suites
   truncate each other's tables mid-assertion. `jest.config` enforces
   `maxWorkers: 1` whenever `TEST_DATABASE_URL` is set, so the constraint cannot
   be forgotten at a call site.
4. `e2e-tests` never reported a test at all: it built only Chrome while
   Playwright's `webServer` serves fixtures from `.output/firefox-mv2`, and
   `serve-built.mjs` exits 1 when that directory has no `settings.html`.

**One defect was self-inflicted and is worth recording as a scar.** PR #202
committed five `node_modules` **symlinks**, because `.gitignore` carried only
`node_modules/` and a trailing slash matches a directory but never a symlink of
the same name — so `git add -A` swept them in. Every job then died at install
(`ENOTDIR: not a directory, mkdir …`), a fresh clone was equally broken, and
pulling the removal back deleted `node_modules` from the canonical checkout.
`.gitignore` was repaired in #203, but an ignore rule only prevents the accident;
it cannot detect a path already in the index. PR #206 adds the detection to
`scripts/workspace-policy.mjs` (inside the `doctor` gate that runs first in
`make verify`), asking git what the repository actually carries, and it is
falsified by replaying the original mistake.

Also note a correct non-event: PR #206 triggered no CI run, because `ci.yml`'s
path filters cover `packages/**`, `pnpm-lock.yaml` and the workflow itself, and
#206 touched only `scripts/`. A skipped run is the filter working.

### Feature 200 is now actually installed

The reader fixes had been merged but not deployed — the daily profile was still
running the 18:38 build of 23/08, proven by an XPI hash matching the PR #199
receipt byte-for-byte. Deployed 24/08 23:16 BRT: extension source at `HEAD` is
byte-identical to the #200 merge (#201–#206 touched only CI, tests and scripts),
and the built bundle carries the Feature 200 markers `setPlaybackLanguage`,
`_handleOutsidePointerDown` and `speed-option`. Graceful shutdown, atomic XPI
swap, relaunch through `app-scope` into its own `app.slice` scope. Settings are
**byte-identical** across the swap (`storage.js` sha256 `e30b0a6a…` before and
after — `localHostUrl`, `localHostEnabled`, `provider: local` all preserved),
session restored to two windows, deadlock-watch re-armed. Receipt and one-file
rollback: `~/.local/state/proso-deploy/20260824-231203-feature-200/`.

### Still blocked, and genuinely not ours

Publishing the corrected site remains the highest-value user-facing item and is
**not a CI problem**. Measured again today: `proso.com.br` answers with
`server: GitHub.com`, still serving `Coming Soon` ×3, "free tier works
immediately" and "unlimited browser TTS" — all false. `updates.json` also points
at `phsb5321.github.io`, so it is the auto-update lifeline as well as the
marketing page. Moving it needs either a DNS change away from GitHub Pages or a
repository-visibility/plan change; both are Pedro's, and neither is unblocked by
self-hosted CI.

## Update — 31/08/2026: the public Firefox distribution is submitted and the site cut over

Feature 240 closes every repository and hosting prerequisite for public Firefox
distribution, but does not call Mozilla review complete before the public oracle
passes.

The corrected listed 1.2.10 artifact uses the existing GUID, omits only the
self-distributed `update_url`, declares the required `websiteContent`
transmission honestly, and removes remote usage telemetry from the public build:
no tracker initializer, telemetry host permission, build-time gateway seam, or
settings toggle remains. `make release-channels` passes with zero Mozilla lint
errors/warnings. The product is now **Proso** at slug `proso`; the listing has
complete description/categories/support/privacy, custom AGPL-3.0-or-later text,
an icon, four captioned screenshots, release/reviewer notes, and complete
corresponding source. Corrected AMO version `6452761` is **Awaiting Review**;
the unpublished 1.2.9 candidate was disabled. Public slug and GUID probes remain
404/401, so the install outcome is not yet green.

The source-package check caught a real release defect before submission: WXT’s
default source ZIP contained only the extension workspace and omitted the root
lock/workspace plus `packages/shared`, so reviewers could not reproduce the
monorepo build. `make amo-package` now archives only the pushed extension build
closure with `SOURCE_COMMIT`, `SOURCE_REF`, and `AMO_BUILD.md`. A fresh extraction
installed from the frozen lock and rebuilt all 19 packaged files byte-for-byte.

The public site no longer depends on the dead GitHub Pages deployment. The
corrected tree, update manifest, signed XPIs, and build-tested source archives
for 1.1.3, 1.2.1, and 1.2.10 are live behind the private S3/OAC origin and CloudFront. A replacement ACM
certificate reached `ISSUED`; CloudFront attached `proso.com.br` with
`TLSv1.2_2021`; Cloudflare moved the DNS-only apex CNAME from
`phsb5321.github.io` to `d23aubpqrsmco3.cloudfront.net`. Live checks show zero
stale install/free-tier claims, an honest pending-status AMO link, correct
canonical URL, both XPI hashes intact, current source archive SHA-256
`e9bf6504efd5b443b33ce4c2c1346431ecee833dadf354dc4f5d6321630d2116`, and no
public workspace `package.json`. Final Terraform plan: **No changes**. The stale
`www` hostname now redirects HTTP → HTTPS → the canonical apex while preserving
path and query. The four
published contact addresses (`support`, `privacy`, `security`, `commercial`) now
route through Cloudflare Email Routing to the verified Proton destination; a
Gmail-to-support probe was received with the expected delivered-to address.

The broader Feature 095 `make user-gate` remains honestly BLOCKED on its existing
public-control anomaly/restart/soak and unified-receipt requirements; the loaded
Firefox diagnostic still passes install → synthesis → highlight → pause/resume.
Store publication does not rewrite that separate verdict.

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
3. ~~Reconcile the dated architecture audit and pre-launch checklist; they still contain historical
   Browser TTS and browser-test claims.~~ Delivered on 07/08 by PR #113 (`ddd0583`):
   `docs/architecture/current.md` and `proposed.md` now describe the server-centralized route
   (`ServerTtsAudioAdapter` → `ProsoApiAdapter` → `POST /api/v1/tts/synthesize`, spec 069) instead
   of an extension-direct ElevenLabs flow, and the `BrowserTTSAdapter (future)` plan is replaced by
   the real implementer plus the removal citation (`9797dc6`). `grep -rn -i
   'speechSynthesis\|browser tts\|speech.synthesis' docs/architecture/ docs/PRE_LAUNCH_CHECKLIST.md`
   returns zero. Every load-bearing claim was verified against code before merge:
   `server-tts-audio.adapter.ts:30` (implements `IAudioGenerator`), `composition/factories.ts:69`
   (wiring), `proso-api.adapter.ts:137` (endpoint), `shared/src/constants/tiers.ts:19-24`
   (`FEATURE_MATRIX.managedTts`), `server-tts-audio.adapter.ts:96` (`wordTimings: null`, so the
   client estimates them) and server `tts.service.ts:137` (the 402 gate). `findings.md` and
   `PRE_LAUNCH_CHECKLIST.md` needed no edit (their hits are current ElevenLabs-license and
   cross-browser-compatibility content); `docs/firefox-extension-testing-strategy.md` carries the
   same claim class in a 15-line mocked-`speechSynthesis` example and is flagged, not edited — see
   next-slices #12. The qa gate caught one defect the reconciliation introduced: the edited
   sequence diagram stopped parsing (`mmdc` parse error on the arrow label), fixed in `4c02c2b`
   and re-verified 6/6 mermaid blocks render. No different-family adversarial review is recorded:
   codex is capped until 08/08 12:48 BRT and the DeepInfra lane has no balance, so this docs-only
   diff landed on the qa gate plus the orch's own code verification above.
4. ~~Triage the 73 expiring Knip fingerprints and 60 OSV advisories before 30/10/2026; remove a
   fingerprint as soon as its finding disappears.~~ Delivered on 07/08 by PR #117 (`0440b78`).
   The 73/60 figures were already stale: the board-truth baselines were **55 knip findings**
   (25 dependencies / 22 files / 8 devDependencies) and **9 OSV advisories** (vite 5 · uuid 3 ·
   request 1). PR #117 drove them to **knip 0** and **OSV 6**. Knip: 20 genuinely-dead files
   deleted (zero-import verified independently), 5 unused deps removed (`pg` — reached only
   transitively via `@prisma/adapter-pg`, which stays — plus `rxjs`, `ts-loader`, `vite`,
   `@types/webextension-polyfill`, `testcontainers`), and the remaining findings modeled in
   `knip.json` as documented false positives, each citing a live import site (NestJS DI
   decorators, WXT config-module strings, pino transport-string targets, `@proso/shared`/`zod`/
   `franc-min`/`lamejs`/`dexie` imports, the site's `main.js` referenced from four HTML pages).
   The load-bearing intentional ignores (`@webext-core/messaging`, `webextension-polyfill`,
   `@nestjs/platform-express`, `reflect-metadata`) are untouched. OSV: the 5 vite advisories
   closed by PR #109's `>=8.0.16` pin; 2 js-yaml + 1 nanoid closed by new override floors; 2
   image-size advisories ADDED with a documented no-upstream-fix reason (GHSA-w3rx-r6r6-pgpr /
   GHSA-5p2g-fcmc-qvqq, `last_affected 2.0.2`, transitive via `web-ext > addons-linter` dev
   tooling). Remaining 6: uuid ×3 (fix >=11.1.1 unreachable through the pinned transitive
   ranges), request ×1 and image-size ×2 (no upstream fix). **The js-yaml scanner discrepancy
   recorded on 06/08 is resolved**: the code-slop gate was correct — OSV's DB carried
   GHSA-5p4m-2wfm-xmqj (fixed 4.3.1/3.15.1) while pnpm's DB lagged. Consequence to know:
   `pnpm audit --audit-level=high` now exits 1 on the two image-size highs, so the fail-closed
   `make security` gate from PR #109 is **correctly red until upstream fixes image-size** — DB
   drift, not a code regression (the same advisories are present on the pre-merge tree). The
   knip ratchet's regression catch is falsifier-proven: planting an unused file turns it RED
   (exit 1), reverting restores GREEN. QA gate: 6/6 PASS. No different-family adversarial
   review is recorded (the codex harness was banned fleet-wide on 07/08; the DeepInfra lane has
   no balance).
5. Remediate critical/reachable dependency alerts in service-scoped PRs, then the remaining high
   alerts. Changing `.github/workflows/ci.yml` to remove the audit’s `continue-on-error` is a
   separately gated workflow change; until then, do not cite the green job as security evidence.
6. Establish the missing Firefox/Linux visual baselines and repair the keyboard assertions behind
   the 24 visual failures before removing that job’s `continue-on-error`. That workflow edit is
   separately gated; until then, inspect the test log rather than the green job badge.
7. ~~Diagnose the GitHub Actions `startup_failure` outage above.~~ Diagnosed on 14/08/2026 — see
   [the resolution above](#github-actions-produces-nothing-at-all). The cause is private-repository
   Actions metering on a free personal plan, isolated by a discriminator that needs no `user`
   scope: public `Tauri-PDF-Reader` runs Actions today while private `NixOS` and `centavos` stopped
   in early August, and `rulesets` 403s with `Upgrade to GitHub Pro`. Two things stay open and only
   Pedro can close them — confirming it on the billing page, and choosing between a spending limit,
   the next cycle's allowance, a self-hosted runner, and making the repository public. The same 403
   established that this repository has **no branch protection at all**, so no required check has
   ever gated a merge here.
8. ~~Point the public actor at an account-free audio source~~ Delivered on 17/08 by PR #185.
   `local-host-journey-gate.mjs` now accepts `LOCAL_HOST_APPLIANCE_URL` and was run against the
   real Orange Pi at `3cf70e1`: a public-control actor typed the tailnet address into settings,
   granted the origin with a real click, pressed Play, and the article was read with every audio
   byte from that hardware and zero requests to the managed route. What stays open is narrower
   than the original wording: `public-actor-gate.mjs` (the sibling gate) still synthesizes
   against a fixture — only the local-host gate reaches hardware — and appliance mode asserts the
   audible outcome rather than an inspected request body, because real hardware exposes no
   request log to the gate.
9. Decide, in `specs/100-local-appliance-tts/`, the granularity the 2 s latency clause binds to,
   and size synthesis requests to it. At RTF ~0.2 with no streaming, sentence-level chunking plus
   prefetch keeps time-to-first-audio near 1–2 s; a paragraph-sized request does not.
10. ~~Repair the 2 vacuous settings-page visual tests~~ Delivered on 10/08 by PR #125
   (`2f3e60c`). The fork resolved toward *tagging*, not deleting: the API-keys UI is real —
   `src/entrypoints/settings.html:499` renders an "API Keys (BYOK)" subsection with provider
   cards and key inputs — it simply carried no `data-testid`, and it sits inside the collapsed
   `#developer` accordion, which is why the built page appeared to have no api-keys section.
   (An orch grep of `src/entrypoints/options/` rather than `entrypoints/settings.html`
   initially concluded the opposite; the eng's independent check corrected it, which is the
   check working as designed.) The tag is added, and the `count() > 0` guard that made the
   tests vacuous is **removed entirely** rather than satisfied: the tests now assert
   `toBeVisible()` on the section, on the ElevenLabs provider card, and on its key input, so a
   future refactor dropping the testid FAILS instead of silently no-opping. Both light and dark
   baselines now exist. Suite stays at 36 passed — the same count, but 34 real + 2 genuinely
   asserting rather than 34 + 2 empty branches; verified independently by the orch on a clean
   `build:firefox` (`36 passed (38.2s)`).
   Two harness facts were established on the way and matter for every future visual test. The
   suite opens the built page as `file://`, where the module script (`settings.html:11` →
   `options/main.ts`, which imports the theme manager and `initOptionsPage()`) cannot
   initialize — so `setupAccordions()` never binds and no accordion can be clicked open. The
   tests therefore set the accordion's DOM state directly instead of depending on script that
   cannot run; this is a harness limitation, not a product defect (the `#developer` markup and
   the class-based binding are both well-formed, and every other settings test passes only
   because its section ships open). For the same reason the page renders **unstyled** under
   `file://`: the new api-keys baselines carry no product CSS — and neither do the
   pre-existing ones from PR #111 (`appearance-section-light` is equally unstyled), so this is
   the file's standing condition rather than a regression introduced here. Closing that gap is
   next-slice #20.
11. Resolve the visual-fixture style divergence: the fixture page loads
   `src/styles/content.css`, which is dead in the shipped path (the content script injects
   its own inline copy at `entrypoints/content.ts`, nothing imports `content.css`) — the CSS
   plant and snapshots must exercise the styles users actually see. Wire the fixture to the
   shipped style surface or consolidate the two CSS copies; then tighten the 2 % snapshot
   threshold that misses small-area changes (the 28 px icon gap).
12. ~~Remove the historical mocked `window.speechSynthesis` example from
   `docs/firefox-extension-testing-strategy.md`~~ Delivered on 17/08 by PR #179
   (`df02940`). The 15-line example and its surrounding PDF-viewer narrative were
   deleted outright (the reconciliation PR #113 deliberately left them out of
   scope); the strategy doc now models the server-route testing pattern.
   `grep -n 'speechSynthesis' docs/firefox-extension-testing-strategy.md` returns
   zero, and no test in the repo mocks browser `speechSynthesis` (removed in
   `9797dc6`).
13. ~~Fix the Chrome MV3 C3 `playback.getState` roundtrip~~ Delivered on 10/08 by PR #123
   (`a983e22`). Two things in that original wording were wrong, and both matter. First, the
   sentence "the diagnostic already asserts it, so the fix is falsifiable the moment it lands"
   was **false**: C3 recorded `ok = result.arrived`, so it passed on ANY response — including
   `{"success":false,"error":"Unknown message type"}` — and C2's `left Loading...`
   sub-assertion carried the same mis-answer text without failing. Verified by running the
   Chrome leg on `f615e8b` (pre-fix): exit 0, `PASS — 10 check(s), 0 failed`, while the log
   showed the mis-answer in both places. The check could not fail on the bug it was cited for.
   Second, the defect was not only a registration race. Strengthening the assertions (C3 now
   requires a real `status` in the playback enum; C2 requires leaving `Loading...` via a real
   status label) exposed a **second, load-bearing defect**: the offscreen document's
   `onMessage` listener answered `{success:false, error:'Unknown message type'}` from its
   `default:` branch for every message it did not own. `runtime.sendMessage` broadcasts to all
   extension contexts, so once a reading session created the offscreen document, that listener
   answered the popup's `playback.*` calls first and stole the response — which is why the
   symptom looked intermittent rather than deterministic. The fix is therefore two parts:
   `entrypoints/offscreen/main.ts` now returns `false` from the default branch (leave the
   channel open for the background listener), and `background/message-gate.ts` closes the
   original registration race — the `onMessage` listener awaits a single-shot gate holding the
   `.catch()`-ed `initHexagonalArchitecture()` promise, so a message arriving before handler
   registration is queued rather than mis-answered; after warm-up the await is a microtask.
   Evidence: `node scripts/chrome-mv3-diagnostics.mjs` now reports `PASS — 18 check(s), 0
   failed` with C3 answering real state and C2 leaving Loading via `'Playing'`, re-run
   independently by the orch on a clean rebuild of both targets; Firefox MV2 stays 9/9;
   extension unit suite 2329 tests. Falsifier receipts: reverting the offscreen fix turns the
   strengthened assertions RED and restoring returns them to GREEN. Reverting the gate alone
   produces no observable diagnostic change — its window is not exercisable end-to-end by this
   harness — so the gate is pinned by unit tests instead (a message dispatched before
   registration is served, not mis-answered), and closing that gap end-to-end is next-slice
   #19. The QA gate's first verdict on this slice was FAIL, measured 25 minutes before the
   offscreen fix landed; it was re-gated on the complete tree and returned PASS, and its
   insistence on assertions that can actually fail is what surfaced the second defect.
14. ~~Close the knip ratchet's unused-export blind spot~~ Delivered on 08/08 by PR #121
   (`5aac585`). Cause: `scripts/quality/knip-ratchet.mjs` requested `exports` only in the
   `--production` pass, which walks from production entry points, so an unused export inside a
   still-imported module was invisible; the non-production pass never asked for `exports` at
   all. The fix adds `exports` to that pass. Proven both directions by plant, re-run
   independently by the orch on the merged branch: appending
   `export const plantedUnusedThingOrch = 1;` to `core/playback/playback-service.ts` — a
   non-entry module that *is* imported, so only the export is dead — exits 1 naming the symbol,
   and the pre-existing unused-FILE catch still exits 1; both revert to 0 with a clean tree.
   Enabling the check surfaced **337 raw export findings, triaged to a baseline of 47** across
   54 files (747+/599-): dead exports deleted or privatized, a djb2 hash and the
   language-preference readers deduped, and the unwired legacy `adapters/audio/offscreen.adapter.ts`
   deleted (the live Chrome MV3 shim `offscreen-audio-element.adapter.ts` from PR #115 is a
   different file and is untouched). The baseline rising from a blind 0 to an honest 47 is the
   point: those 47 are tracked debt, not noise. Two traps were found on the way. First, the
   entry globs matched only `tests/**/*.{test,spec}.ts` while the repo ships 27 `.test.js`
   files, so exports imported solely by those tests looked dead — deleting them would have
   broken live tests; the globs now match both extensions. Second, the different-family (groq)
   review found that `sha256Hex` had been given a silent djb2 fallback: `redaction.ts` already
   had that fallback, but `audio-chunk.schema.ts`'s cache-key path previously threw, so the
   change would have let a 32-bit hash serve as a cache key (a collision returns the wrong
   audio). It is now `sha256HexOrDjb2`, so no caller can assume 256 bits without reading the
   name. The same review surfaced a latent double-baselining hazard — `collect()` embeds the
   scope in each fingerprint, so one dead export found in both passes would be baselined twice
   — removed at the source by dropping `exports` from the production pass now that the full
   pass covers it. Five further review findings were checked against the code and did not hold.
   QA gate: 8/8 PASS.
15. ~~Revisit the two `image-size` advisories when upstream publishes a fix~~ — the *gate* half
   is delivered by PR #119 (`4b5ace6`, 07/08); the advisories themselves remain open upstream.
   `scripts/dependency-audit.sh` is now reachability-aware: `quality-baselines/audit-allowlist.json`
   is the only way a high/critical advisory passes, and an entry is an exact (GHSA id, dependency
   path) pair carrying a written unreachability reason and a review date. The two `image-size`
   advisories (GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq, `Patched versions: <0.0.0` — no upstream
   fix exists) are allowlisted on `packages__extension>web-ext>addons-linter>image-size`, a
   build-time-only chain (`web-ext` is an extension devDependency, absent from the shipped
   artifact), review date 2026-10-30. `./scripts/dependency-audit.sh` exits 0 on `main` and
   `make verify` reaches its end again. Fail-closed in five ways, each plant-proven: an advisory
   not allowlisted fails; an allowlisted advisory on a *different* path fails (no bare GHSA
   wildcards); an entry past its review date fails, naming it; a scanner error (any `pnpm audit`
   exit besides 0/1) fails rather than reading as clean; and an advisory reported with **no
   dependency path** fails as unassessable. That last hole was found by the different-family
   (groq) adversarial review and reproduced before the fix — a pathless high advisory previously
   exited 0 — and it is now guarded by a permanent self-test that runs before every audit: if the
   verdict logic regresses, the gate refuses to run at all. The orch verified the expiry,
   path-drift, and pathless plants independently; QA re-gated 7/7 PASS. No blanket
   dev-dependency exemption was added and `--audit-level` was not lowered: a dev dependency with
   a reachable exploit path still fails. Still open upstream: `uuid` ×3 (fix >=11.1.1 unreachable
   through the pinned transitive ranges) and `request` ×1 — both moderate, below the gate's
   threshold — plus the two allowlisted `image-size` highs, which must be re-verified or removed
   by 2026-10-30.
16. Record that the two contract specs referencing `testcontainers` are environment-blocked on
   this NixOS host (pre-existing, unrelated to PR #117) — they neither run nor gate here.
17. Decide whether `audio-chunk.schema.ts` should reject the `sha256HexOrDjb2` fallback outright
   rather than accepting a 32-bit djb2 cache key in crypto-less environments (PR #121 made the
   tradeoff explicit and deliberate; it did not remove it).
18. Work the 47 baselined knip findings down. They are real tracked debt from the PR #121 export
   sweep, not false positives, and they expire 2026-10-30.
19. ~~Pin the PROSO-90 message gate at the integration level~~ Delivered on 10/08 by PR #127
   (`39a32ba`). The harness constraint was real — both launch phases `waitFor` a service-worker
   handle, and by the time Playwright yields one the background script has run and
   registration has settled — so the fix does not race the boot; it **stops the worker via CDP
   and messages it cold**, which reproduces the genuine wake-up race. New check **C4
   cold-worker race**: three cold messages must all answer with real playback state. Verified
   independently by the orch, both directions: neutering `waitForMessageGate()` to resolve
   immediately (the faithful pre-#123 behavior — the module itself is new in #123, so a literal
   `git checkout` of an earlier revision is not possible) makes the Chrome leg **exit 1** with
   `C4 cold-worker race — answer {"success":false,...}`, and restoring it returns **exit 0**
   with `all 3 cold wake-up answers real; first woke cold in 45ms (warm 2ms)`. The gate is no
   longer unit-pinned only.
   Two details make the check itself hard to fake, and they are the point of the slice. A
   failed worker stop would leave a warm worker answering instantly and produce a vacuous
   green, so C4 carries an **anti-vacuity latency floor**: the first cold answer must take
   several times the same-run warm roundtrip (measured 45ms vs 2ms), and a CDP stop-proof
   accompanies it — a stop that did not happen is a loud failure, not a pass. PR #127 also
   added **C5**, an offscreen-context parity check, extending the pin to the response-theft
   defect #123 fixed alongside the gate. `docs` note for future harness work: a stopped MV3
   service-worker target cannot be probed for detachment, because CDP evaluation against it
   revives the worker — which is why the stop is proven by latency and target state rather than
   by asking the worker whether it is running.
20. Make the settings visual suite render the product's own styles. Every
   `settings-page.test.js` baseline — the two added by PR #125 and the pre-existing ones from
   PR #111 — is captured over `file://`, where neither the module script nor the stylesheet
   loads, so the snapshots encode unstyled DOM. They still catch structural regressions, but
   they cannot catch a styling regression, which is what a *visual* baseline is for. Serving
   the built page over a local HTTP server (so `/chunks/*` and the CSS resolve) is the
   direction the QA seat proposed and the one most likely to fix both at once.
21. ~~Repair the quick-settings visual tests~~ Delivered on 17/08 by PR #182 (`f288239`). The two
   quick-settings tests carried the same vacuous `count() > 0` guard the api-keys tests had
   before PR #125 — renaming their testids left them PASSING (measured RED-before receipts in
   the PR body). The guards are removed entirely; the tests now assert `toBeVisible()` on the
   section and its controls (provider select, voice select, speed slider, reset button), so a
   future refactor dropping a testid FAILS. Both plants (renamed section testid, renamed
   provider-select testid) turn the fixed tests RED; the two pre-existing full-page
   viewport-height mismatches (`settings page default` light/dark, `sidebar navigation`,
   `reduced motion`, `narrow viewport`) are baseline drift also present on main, not
   introduced here.
22. ~~Stop `syncProviderUI` rewriting an input the reader is currently typing into~~ Delivered on
   17/08 by PR #181. The listener exists for cross-tab sync, but it also fires for
   the page's own writes, so it reassigned `localHostUrl.value` mid-typing and the caret jumped
   to the end. Before PR #147 this destroyed the typed address outright; now the value written
   back is the same string, so the damage was cosmetic — but a listener that clobbers focused
   input is still wrong. First fix keyed the guard on focus
   (`document.activeElement === localHostUrl`); the follow-up commit in the same PR corrected
   that to an edit-dirty bit instead — a merely focused-but-unedited field must still receive a
   cross-tab sync, or a save fired by a *different* control (voice/enable `change`) would persist
   the stale field back over the cross-tab change. Unit-pinned three directions: dirty → in-flight
   value preserved (Direction A), not dirty/no guard → stored URL still lands (Direction B),
   focused-but-unedited → the cross-tab value still lands rather than being blocked (Direction C,
   the case the focus-keyed draft got wrong) — plus the shield (provider/enable/voice still sync
   while the URL field is guarded).
23. ~~Make `make doctor` reject a *shipped* artifact that no longer matches its source, the way it
    now rejects a stale Prisma client~~ Delivered on 17/08 by PR #180 (`234c457`). The 14/08 fix
    covered `packages/server/src/generated/prisma` only; the doctor still could not tell a stale
    `packages/shared/dist` from a fresh one, and `@proso/shared` is consumed from `dist/` by the
    server. PR #180 stamps the shared build with a source-tree sha256
    (`scripts/shared-source-digest.mjs` → `dist/.source.sha256`) and the doctor now fails closed
    on not-built, no-stamp, or digest mismatch, naming both digests. Plant-proven both
    directions: touching a shared source turns the doctor RED naming both digests (exit 1);
    removing the stamp turns it RED as `predates source-drift tracking` (exit 1); restoring
    returns exit 0.
24. ~~Make the deterministic floor deterministic under load~~ Delivered on 17/08 by PR #183
    (`8620c06`). `franc-min-accuracy.test.js` dropped its 50 ms wall-clock budget (measured
    6/27/43/79 ms on identical trees) for the observable outcome (correct detection) plus a
    load-independent proxy for the property it guarded (the trimmed `franc-min` data module,
    bounded in size); the retry-path adapter/contract tests (`cartesia-tts.adapter.spec.ts`,
    `tts-provider.adapter.spec.ts`) now run under Jest fake timers and assert the bounded
    retry count (fetch exactly 4 times) instead of burning 3.5–4 s of real backoff sleep per
    test while `fetch` is mocked. Both plants (wrong-language regression; unbounded retry cap)
    go red deterministically; the suites pass under a 44-process CPU hog; `make verify` exits 0.
    One inherited-main blocker had to be cleared for that exit 0: the then-new GHSA-ggr8-5vv4-36mx
    (deepmerge-ts via prisma > @prisma/config, dev/CLI-time only) was allowlisted on its exact
    path in `quality-baselines/audit-allowlist.json` with reason + review date — not a 181 change.
25. Publish the corrected site. It is the highest-value user-facing item open:
    **and the branch-based Pages route is now ruled out** — Pages builds are
    metered like Actions (15/08: `queued` with zero builds created; see the
    update above). The tree is already staged on `gh-pages` with the
    auto-update files byte-identical, so what remains is a host decision, not
    build work.
    the live site advertises two features that do not exist. Three options were
    assessed in `specs/176-pilot-release/plan.md` — S3+CloudFront, branch-based
    Pages from `gh-pages`, or the existing Dokku host through its existing
    Cloudflare tunnel (recommended, $0, and it permanently decouples publishing
    from the dead Actions). Any option must copy `updates.json` + `releases/`
    into the site root or installed extensions silently stop updating.
26. Retire the AWS root access key. It is long-lived, was used for `iam` calls on
    15/08/2026, and account MFA does not protect access keys. Restic, dokku and
    proxmox backups already authenticate as scoped IAM users, so the blast
    radius is the operator CLI rather than all automation — but a leaked root
    key still bypasses Object Lock governance and can purge every backup. A
    least-privilege `pedro-ops` plan with a restic-safe, reversible rotation
    order (disable → ≥7d grace → delete) is in the operator receipt. Credential
    surgery, so `[pending] Pedro`.
27. Exercise the optional-permission doorhanger. PR #147's gate sets
   `extensions.webextOptionalPermissionPrompts=false`, so the grant request, its user gesture and
   the resulting permission are all real but the prompt the reader accepts is not. Closing this
   needs chrome-context WebDriver Actions dispatched against the panel, which is also what would
   let the popup's own "Grant access" button be driven with a genuine gesture.
28. **Reader runtime coherence — Feature 199 in delivery (23/08/2026).** The daily dbt tab exposed
   22 obsolete `Proso playback controls` roots after extension reloads, popup/page counters
   disagreed (`1/56` versus `0/56`), the popup left Play actionable while a start was pending,
   generic paragraph prefetch competed with local sentence prefetch, and stop teardown could emit
   media events that restarted playback or recreated the footer. The current Supertonic route also
   advertised no word marks and threw an unhandled 500 on box-drawing glyphs. The Feature 199
   candidate now reconciles only Proso-owned DOM/padding, runs one chunk-prefetch path, makes
   Player/Tools/Queue real roving tabs, accepts the queue handler's actual unwrapped response,
   publishes provider-versus-estimated timing basis, uses Unicode/punctuation-aware fallback timing, strips
   non-spoken structural glyphs at the local synthesis boundary, and makes stop terminal against
   late `ended`/`error` callbacks. Loaded Firefox fixture runs pass in both tab modes with 22 stale
   roots per article tab, public Tools and Queue add/remove, one page player, structural-glyph
   filtering, and sentence-two highlight transition; the real Supertonic 3 bridge.3 run also
   passes. Kokoro-FastAPI `26eec068` is explicitly rejected for exact PT-BR sync: RTF 0.23825 but
   `timestamps:null` on realistic date/currency/glyph input. Exact completion remains gated on the
   full deterministic/plant/review/merge/deploy chain.29. **Local synthesis aligned to Lectrice's Magpie bridge — contract pinned (17/09/2026).** Pedro
   directed that Proso's local synthesis use the same local model as Lectrice. Lectrice's local
   model is the pinned Magpie TTS Multilingual 357M GGUF Q6_K (model SHA256 `8291ffde2e13…`,
   Vulkan/RADV on the RX 5700 XT) served by its loopback bridge `tools/magpie/lectrice_magpie_bridge.py`
   at `http://127.0.0.1:5301`. Proso's `LocalHostAudioAdapter` was already wire-compatible with that
   surface by design (same `/health`, `/v1/capabilities`, `/v1/tts` family as the Orange Pi wrapper):
   strict `{input, voice, speed}` body, 16–128-char `Idempotency-Key`, `accept: audio/wav`,
   problem+json error mapping (`payload_too_large`, `engine_failed`, retryable). The new
   `tests/integration/local-host-magpie-bridge.test.ts` now replays the bridge's exact capabilities
   document (ten preset voices `Aria/Jason/John/Leo/Sofia` × `en`/`pt-BR`, preferred 300-byte chunk
   bound, `runtime` model-identity block) and proves readiness, voice discovery/filtering, exact
   request shape, sentence-granular chunking within bounds, and typed engine-failure mapping — 6
   cases, green, included in the 169-suite full run. The settings page host-address placeholder now
   shows `http://127.0.0.1:5301` (still a user-configured value; nothing is auto-enabled). Known
   operational gap, owned by the Lectrice lane: the bridge is not currently running on desktop
   (port 5301 refused 17/09) and is started manually via `start-transient.sh`, not declaratively.
   Proso hard-bounds chunks at 8192 bytes; the bridge's advertised 300 is its preferred chunk size
   and the bridge accepts larger inputs, so no client change was needed.
