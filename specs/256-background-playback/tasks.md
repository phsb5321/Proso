# Tasks — Feature 256 (background playback)

Ordered; each task names its falsifiable check. `[x]` marks work actually done
in this branch.

- [x] T001 — Polarity helper `utils/config/background-playback.ts` with unit
  tests proving stored `true` (stop) maps to "background playback off" and that
  a missing key falls back to the documented default.
- [x] T002 — `background/view-unload-policy.ts`: detach when background playback
  is enabled, stop when disabled, no-op when the reloading tab is not the
  playing tab or nothing is playing. Unit tests cover all four combinations.
- [x] T003 — `PlaybackService.detachVisualAttachment()` + detached flag;
  `checkHighlight` must not stop on a lost view while detached (or while the
  preference is on). Unit tests for both branches.
- [x] T004 — `entrypoints/content.ts` sends `playback.viewUnloaded`; `playback.stop`
  remains the explicit user stop from the popup.
- [x] T005 — `playback.viewUnloaded` handler registered, idempotent, `__tabId` bound
  from the sender.
- [x] T006 — Settings UI relabelled positively with an honest hint; same stored key.
- [x] T007 — Popup distinguishes playing-here / playing-elsewhere / view-closed and
  offers "Open the source tab" when the playing tab still exists, focusing its
  window. Original title and live-audio evidence now reach getState/broadcast;
  detached delivery does not depend on the content script. Fresh starts require
  explicit Stop before replacing an existing session; Resume is authoritative.
  Popup, handler, adapter and service unit tests cover these paths.
- [x] T008 — Loaded-Firefox journey: start reading, switch tab, wait through a
  quiet gap, assert audio time advances; navigate the source tab, assert audio
  continues; reload the source tab, assert audio continues; disable the option
  and assert playback stops on leaving. Record the event-page lifetime finding.
  **Executed 23/09/2026 at HEAD `e09b24c`; verdict FAIL — 2 of 5 behaviors
  proven, 3 recorded as gaps. `[x]` here means the journey ran and its result
  is recorded below (same convention as 257's replay task), NOT that runtime
  acceptance passed.** See "T008 verification — 23/09/2026".
  **Fix campaign same day: both defects fixed, journey re-run at `8734b0f`
  → PASS, 21/21 checks, every T008 item PROVEN (see "Fix campaign outcome"
  below).**
- [x] T009 — Native popup toggle "Keep listening when I leave this page" uses
  the polarity helper and legacy storage key. Visible On/Off, aria-pressed,
  keyboard focus, external storage changes and write failure are unit-covered;
  disclosure names browser lifetime, continued synthesis/credits and titles.
- [x] T010 — Global toolbar badge + original document title while audio is live;
  cleared on pause, waiting, stop/error (including a vanished tab). Adapter writes
  are serialized and deduplicated; no paragraph notifications or badge progress.
  Unit tests cover publication, transitions and lack of repeat progress writes.
- [ ] T011 — Deferred to later slices, tracked here so they are not silently
  assumed: Media Session progressive enhancement, sleep timer, sidebar/PiP
  player, durable resume (Feature 252).

## 256b verification — 20/09/2026

`[x]` above means implemented and unit-tested, not released or full Feature 095
acceptance. Work stays in `256b-popup-affordances`; no push requested.

- `pnpm --filter @proso/extension lint`: exit 0, 200 files, 68 warnings.
- `pnpm --filter @proso/extension exec tsc --noEmit`: exit 0 after `wxt prepare`.
- From `packages/extension`: `NODE_OPTIONS=--experimental-vm-modules npx jest
  --selectProjects unit --selectProjects contract`: exit 0; 161 suites passed,
  3,241 tests passed, one existing skipped suite/test; no Jest snapshots.
- `make fuzz`: exit 0; 11 tests across extension/server, seed `20260730`,
  `FC_NUM_RUNS=100`. Replay: `FC_SEED=20260730 FC_NUM_RUNS=100 make fuzz`.
- `make user-gate`: exit 2 by the Feature 095 fail-closed boundary. Its Firefox
  build and internal-dispatch smoke passed (three TTS requests, visible reading,
  pause holds position, resume advances). This is diagnostic-only.
- `make public-actor-gate`: first run exit 2, missing visible Pause immediately
  after observing its name. First replay of `node scripts/public-actor-gate.mjs`
  and a second replay passed Play → Pause → Resume. The first anomaly is
  retained; this is not stable acceptance of the new attention behaviors or T008.
- `GENERATOR_FAMILY=openai make gate`: exit 2 at doctor, missing generated
  server Prisma client. Direct Prisma generation fails on the unavailable
  NixOS engine checksum (404). No cross-family reviewer verdict was obtained.

Logs: `/tmp/256-{lint,tsc,jest}-final.log`, `/tmp/256-fuzz.log`,
`/tmp/256-user-gate.log`, `/tmp/256-gate.log`,
`/tmp/256-public-actor{,-replay,-replay2}.log`; first-failure receipt:
`/tmp/256-public-actor-first-receipt.json`. Browser receipts and screenshots are
under `.artifacts/{smoke-reading,public-actor-gate}/`. Their HEAD is the branch
base `c4d89a2`; they exercised the uncommitted build, not an exact-head release.
The new controls' browser acceptance, T008's switch/navigation/reload campaign,
visual snapshot refresh and a cross-family review remain outstanding.

## T008 verification — 23/09/2026

`make background-playback-journey` on clean HEAD **`e09b24c`** (worktree
`proso-256-journey`, branch `256-t008-journey`): the target rebuilt HEAD via
`pnpm --filter @proso/extension build:firefox`, then ran both preference legs on
Firefox 157.0a1 + geckodriver 0.37.1, fresh headless profiles, seed **20260920**,
35-second non-silent PCM tones per paragraph from the local fixture (no
provider). **Verdict: FAIL (exit 1).** Assertions are complete and fail-closed
(checks are boolean, any false flips the verdict; nothing is skipped-green), so
no journey-script extension was required — the gaps are product behavior at
HEAD, not missing assertions. `scripts/background-playback-journey.self-test.mjs`
(257's false-positive plants + bounded teardown) passed before the run.

Receipts: [`verification-2026-09-23.json`](./verification-2026-09-23.json)
(committed; verbatim journey receipt + process logs + console log) and
`.artifacts/background-playback-256-t008/{receipt.json,enabled-process.log,disabled-process.log}`
plus `/tmp/256-t008-journey.log` in the run worktree.

Item-to-receipt map (scenario `false` = "Keep listening" enabled; `true` =
disabled). The journey asserts every T008 clause:

| T008 clause | Journey check | Receipt (enabled leg) | Result |
|---|---|---|---|
| start reading | `live audio before tab switch` + `start-probe` pairs | `start-probe` 0.11→0.35 s then `before-hide` 0.40 s, playing | **Proven** (both legs) |
| switch tab, quiet gap, audio time advances | `source hidden throughout >=90s`, `tab switch policy` (`advancing` ≥85 s), `paragraph boundary continued while hidden` | `hidden-window-start` 0.96 s → `after-90s-hidden` **35 s `ended:true` `paused:true`, src intact** — clip 1 ended ~35 s in, no clip 2, ~56 s silence | **Gap A** (advanced 35 s then stalled; needed ≥85 s + boundary crossing) |
| navigate source tab, audio continues | `navigate policy` (`advancing` ≥8 s) | `before-navigate` 0.195 s playing → `after-navigate-3s` src cleared, `paused`, media error 4 | **Gap B** (session stopped ≤160 ms after navigate) |
| reload source tab, audio continues | `reload policy` (`advancing` ≥8 s) | `before-reload` 0.21 s → `after-reload-10s` **10.32 s still playing** | **Proven** |
| disabled option → stops on leaving | disabled `tab/{navigate,reload} policy` = `stopped()` | switch: src cleared +0.6 s; navigate: +≈0.05 s; reload: **0.21→10.33 s still playing** | **Proven** for switch + navigate; **Gap C** for reload |
| record event-page lifetime finding | per-sample `persistentBackground`, `backgroundState`, `timeOrigin` | all 20 samples | **Recorded** — see below |

**Event-page lifetime finding (re-confirming 20/09):** every sample reports
`persistentBackground: true` with `backgroundState: 'running'` and one stable
background `timeOrigin` across the 90 s hidden window and all triggers. This
MV2 `background.scripts` build is therefore a **persistent background, not an
event page** — Firefox never suspends it, so event-page suspension remains
untestable on this artifact and the spec's suspension premise stays unverified
by construction. What IS proven at HEAD: the persistent background and its
Audio session survive ≥90 s hidden with the observer intact.

**Measured structure of the gaps** (from the sample/action timeline): leaving
the page is preference-dependent ONLY for tab switches — switch stops iff the
option is disabled (the pre-existing tab-activation policy works). Navigate
stops in **both** preference modes (preference ignored); reload stops in
**neither** (preference ignored). No policy-driven stop or detach is observable
on navigate or reload in either mode.

**Mechanism leads** (graded honestly):

- **Gap A — verified regression window.** At natural clip end Firefox dispatches
  `pause` before `ended` (probe event order, receipt `audioEvents` at
  1790177606597). HEAD's `pause` listener (added by PR #257 `d86f477`, merged
  21/09 09:55) flips `state.status` to `paused`, and the pre-existing `ended`
  guard (`status !== 'playing'` early-return in
  `core/playback/playback-service.ts`) then suppresses auto-advance → stall at
  every clip boundary. `git show df8b9ad:…playback-service.ts` has **no**
  `event === 'pause'` handler, and 257's 21/09 run at `df8b9ad` (09:46) crossed
  two paragraph boundaries hidden — the regression landed in the 9 minutes
  between that verified build and PR #257's merge. The 20/09 run used one
  240-second clip and so could never hit a boundary.
- **Gaps B/C — verified structural defect, unverified trigger.** PR #257 also
  gave `applyViewUnloadPolicy` a two-identity owner guard (absent at `df8b9ad`)
  while `playback.start` stamps the session owner with the **sender's** document
  id — the popup's, for the canonical Unified-Extensions Play used by this
  journey — and `playback.viewUnloaded` reports the **page's** document id. Both
  non-null and different, so `unloadMatchesOwner` no-ops every popup-started
  session's unload: neither detach (Gap B's precondition) nor stop (Gap C) can
  come from the policy. The same PR made `viewUnloaded` pagehide-only
  (`beforeunload` previously sent it too, delivering before teardown). Gap B's
  proximate stop (fires ≤160 ms after navigate, both modes, no re-injectable
  content script) is **not pinned** to a call site; `checkHighlight`'s
  settings-port read answering "background playback off" regardless of the
  stored value is the leading suspect. Treat B/C's mechanisms as hypotheses
  pending a fix-and-replay, not as proven root cause.
- **257's 21/09 receipts** (its `specs/257-journey-hardening/tasks.md`
  § Verification — 21/09/2026: PASS 21/21 at `df8b9ad`, enabled/disabled ×
  hidden/navigate/reload) are cited as proof that the journey's assertions can
  pass and that all T008 clauses held on the pre-#257 tree. `df8b9ad` is **not**
  an ancestor of HEAD and PR #257 reworked exactly the seams T008 exercises, so
  the clauses needed re-proving at HEAD — which is where 3 of them fail. Its
  worktree-local artifacts are gone; the tasks.md block above is its receipt of
  record.

**Replay (no fake timers, real wall clock):** from a clean `proso-256-journey`
worktree at `e09b24c` (or the fix commit),
`FC_SEED=20260920 BACKGROUND_ARTIFACT_DIR=.artifacts/background-playback-replay make background-playback-journey`
(fresh artifact dir per attempt to retain anomalies; `BACKGROUND_MODE=enabled`
/ `disabled` for one leg). Exit 0 = all selected assertions passed, 1 = a
behavioral assertion failed (this run), 2 = observer/journey blocked. Seed for
the retained failure: **20260920**. Failures reproduce Gap A deterministically
at the first clip boundary (~35 s), Gaps B/C at the navigate/reload triggers.

### Fix campaign — hypotheses and falsifiers (recorded before coding, 23/09/2026)

Exactly one causal hypothesis and one falsifier per gap, stated before any fix
code is written. The journey harness is not modified by this campaign: every
assertion stays exactly as strict as the failing run.

**Gap A (quiet-gap stall) — hypothesis:** at a natural clip end Firefox
dispatches `pause` (with `HTMLMediaElement.ended === true`, receipt sample
1790177606597) *before* `ended`; PR #257's `pause` listener in
`setupAudioEventListeners` then runs `playbackStateTransitions.pause` on a
`playing` session, and the `ended` handler's pre-existing guard
`this.currentAudioUrl === null || this.state.status !== 'playing'` returns
early, suppressing the queued-chunk/paragraph advance — so playback stalls at
every clip boundary, hidden or not.

**Gap A — falsifier:** fire `pause` with `ended === true` then `ended` on a
playing session that has another clip available; if the next clip starts even
though `state.status === 'paused'` at `ended` dispatch, the pause transition is
not the cause. Equivalently at runtime: if the fixed build still stalls at the
first hidden clip boundary, the cause is elsewhere and this hypothesis is
false.

**Gap B/C (view-unload policy dead for popup starts) — hypothesis:**
`playback.start` stamps the session owner's `documentId` from the **start
sender's** document (the popup's document for the canonical Unified-Extensions
Play this journey uses), while `playback.viewUnloaded` reports the **playing
page's** `sender.documentId`. `unloadMatchesOwner` sees two non-null, unequal
ids and returns NO_OP for every popup-started session — so the policy never
detaches (navigate: the lost-view footer stop then ends an enabled session)
and never stops (disabled reload keeps playing).

**Gap B/C — falsifier:** on current code, drive a popup-started session's page
unload through `applyViewUnloadPolicy`; if the outcome is `detached`/`stopped`
rather than NO_OP, the hypothesis is false. After unifying the owner identity
with the playing page: if navigate still stops an enabled session or a
disabled reload still keeps playing on the journey replay, the hypothesis (or
the fix) is false.

**Navigate-stop call-site pin (hypothesis to be pinned by test/code evidence):**
the stop that reaches an enabled navigate within ~160 ms is the `timeupdate`
listener's `this.updateFooterState()` (allowStop defaulting to `true`) →
`checkHighlight('updateFooterState', …, true)` → lost-view branch →
`await this.stop()`, taken because `isBackgroundPlaybackEnabled()`'s
settings-port read answers "off" for a stored `false`. Pin or refute by
focused unit evidence before fixing.

### Fix campaign outcome — 23/09/2026 (same day)

**Verdict: PASS.** Commits `5c1b9e3` (fixes + regression tests), `8734b0f`
(harness oracle evolution, disclosed below), `ddb9c85` (biome format of
pre-existing drift; `make verify` at the base was already red at
format-check). `nix-shell --run 'make verify'`: exit 0 after the sanctioned
setup (`make bootstrap` for the Prisma client, `make build` for the shared
package — both named by doctor). Full extension unit+contract projects:
165 suites / 3,312 tests passed, one pre-existing skip.

**Both hypotheses CONFIRMED by their falsifiers' failure to refute:**

- **Gap A** — fix: the `pause` listener skips the `playing → paused` flip when
  the element already reports `ended` (that transition belongs to the `ended`
  handler). Red-check: on unfixed code the new tests fail exactly as predicted
  (advance suppressed, final clip never stops); journey re-run: hidden audio
  advanced through two clip boundaries in 6 ms each (`tab switch policy`
  advancing ≥85 s and the boundary oracle both green).
- **Gap B/C** — fix: the message gate binds `__documentId` only for tab
  (content-script) senders, so a popup Play no longer stamps the session owner
  with the popup's document identity (`attachment.documentId` stays null and
  `unloadMatchesOwner` decides on the tab). Runtime-pinned before the fix:
  `ownerDoc ≠ unloadDoc` with outcome `{detached:false, stopped:false}`; after
  the fix, disabled reload stops within the window and enabled navigate keeps
  playing.

**Navigate-stop call site — pinned (runtime stack, not hypothesis):**
`timeupdate → updateFooterState()` (allowStop defaults true) →
`checkHighlight('updateFooterState', content_script_not_loaded, true)` →
`await this.stop()` → `performStop`. The enabler is a **third, adjacent
  defect** found while pinning (recorded as debt, NOT fixed in this slice):
the journey seeds `provider:'openai'` (a removed provider), so migration 6
writes `voiceId: null`, `settingsSchema` declares `voiceId: z.string()`
(non-nullable) — `load()`'s parse throws and its catch caches
`{...defaults}` with `stopPlaybackOnTabChange: true`, so the settings port
answered `stored:true` while raw storage held `false`. Every removed-provider
user's settings port silently serves defaults. Evidence: scratch-probe trace
(`stored:true` beside a raw `false` dump) + unit probe (`parse` throws
`invalid_type` on `voiceId:null`). After the gate fix this chain no longer
reaches the navigate decision (the policy detaches ~180 ms before the first
failing footer tick), but the debt stands.

**Harness oracle evolution (disclosed; the only journey-script change):**
`crossedParagraph` required the hidden page's highlight to move during the
hidden window. Spec 256 lists "visual work continues while hidden" as a
*Falsifier*, and PR #257 deliberately mutes highlight delivery to hidden
views — the oracle could never pass against spec-correct code. It now proves
clip continuation on the audio clock (ended clip, then a *different* source
playing inside the window; a replayed paragraph reuses its cached blob, so a
different source is a different paragraph in this one-clip-per-paragraph
fixture) and still requires page paragraph movement whenever a visible moment
falls inside the window. The stall regression remains caught twice (≥85 s
advance oracle + ended-then-new-source legs); `stopped`/`advancing`/window
integrity oracles untouched. Self-test plants updated accordingly and PASS.

**Item map at `8734b0f` — every T008 item PROVEN (receipt
`verification-2026-09-23-fixed.json`):** start reading (live audio, both
legs); switch tab + 90 s quiet gap, audio time advances (ct 0.96 → 19.54 of
clip 3, two boundaries crossed hidden); navigate → continues (10.45 s still
playing); reload → continues (10.43 s still playing); disabled → stops on
switch, navigate AND reload (`emptied`+error within the window); event-page
lifetime finding unchanged (`persistentBackground: true`, stable `timeOrigin`
— persistent background, not an event page).

**Replay:** `nix-shell --run "FC_SEED=20260920 BACKGROUND_ARTIFACT_DIR=.artifacts/background-playback-replay make background-playback-journey"`
(seed **20260920**, both legs; exit 0 = all assertions passed). Focused
tests: `NODE_OPTIONS='--experimental-vm-modules' npx jest --selectProjects unit
-- tests/unit/core/playback-service-clip-end.test.ts
tests/unit/background/view-unload-policy.test.ts`.
