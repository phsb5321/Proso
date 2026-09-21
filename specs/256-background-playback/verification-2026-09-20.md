# Feature 256 — loaded Firefox verification

Recorded on 20/09/2026 (America/Recife). **PASS in two isolated enabled trials:**
audio continued while hidden for at least 90 seconds, after source navigation,
and after reload. The disabled control stopped audio on all three triggers.
The first run failed while another Firefox smoke overlapped; that anomaly is
retained below. **The background survived, but Firefox reports it as persistent,
not an event page.** Event-page suspension is therefore not tested by this build.

Timestamped samples, all original attempts/replays, process logs, exact commands,
and build identities are in [the JSON evidence](verification-2026-09-20.json).

## Measured results

Final replay, Firefox 157.0a1; native audio positions in seconds:

| Background playback (stored stop flag) | Trigger | Audio position | Paused afterward | Result |
|---|---|---|---|---|
| Enabled (`false`) | Hidden 90.002 s | 0.112062 → 90.265166 | false | PASS |
| Enabled (`false`) | navigate | 90.345395 → 100.395895 | false | PASS |
| Enabled (`false`) | reload | 100.516458 → 110.619062 | false | PASS |
| Disabled (`true`) | Hidden 90.067 s | 0.204062 → 0.000000 | true | PASS |
| Disabled (`true`) | navigate | 0.191000 → 0.000000 | true | PASS |
| Disabled (`true`) | reload | 0.208812 → 0.000000 | true | PASS |

All enabled samples retain one background time origin and the same audio blob;
the hidden sample records the source tab unselected/inactive and only the
background extension view open. Navigation goes to about:blank; in the final
replay the source then returns to the fixture without restarting audio before
reloading it, exercising a real content-script unload. The disabled mode starts
a fresh audible session before navigation and before reload; it is paused/reset
by the 3-second samples and remains stopped at 10 seconds. The tab-switch stop
is sampled at 90 seconds, so its precise stop latency is not measured.

The first isolated replay also passed (0.725291 → 90.868041 s hidden,
90.908250 → 101.017875 s navigation, 101.058125 → 111.092104 s reload of
about:blank). The final replay strengthens reload coverage to the article.
The initial pause did not reproduce in either isolated enabled replay; it is
not attributed conclusively to the overlapping smoke. Neither failed nor
passing runs exhibited background replacement or suspension.

Process logs contain generic Firefox JavaScript exceptions (including repeated
`uncaught exception: Object { message }`); complete logs are retained in JSON.
This is an audio/lifetime verdict, not a clean-console assertion. Disabled
stop samples include native media error code 4 after source clearing, alongside
paused/reset audio.

## Build and method

- Worktree: `proso-256-background-playback`; product HEAD:
  `c4d89a2416be9bc5ab942b745442ea0279f71c40`.
- Build: `pnpm --filter @proso/extension build`, exit 0.
- Full build-tree SHA-256:
  `fece429ed175e9fff38c9fb0e7e73954889bca97da9321901fa388448a10a5fd`.
  The JSON records every file hash and the digest algorithm.
- Firefox: **157.0a1**, `/etc/profiles/per-user/notroot/bin/firefox-nightly`;
  geckodriver: **0.37.1**. Fresh disposable headless profiles.
- Seed: **20260920**; real wall clock, with monotonic elapsed time for the
  uninterrupted hidden interval. No fake timers or idle-timeout overrides.
- Actor: the existing Unified Extensions → Proso → public **Play** helper;
  normal WebDriver tab activation, navigation, and reload. Storage is seeded
  before playback, separately for each preference value.
- Fixture: the retained multi-paragraph article/API server, returning a
  deterministic **240-second non-silent PCM tone**, 16 kHz mono, as synthesis.
  No external provider, account, credentials, or real speech model is involved.
  The audio duration prevents natural completion from looking like a policy stop.
- Observer: native `HTMLAudioElement.currentTime`, `paused`, `ended`, `duration`,
  and error state; Firefox background state, effective persistence, and
  `performance.timeOrigin`. `playback.getState.currentTime` is hardcoded to zero,
  so it cannot be the audio advancement oracle.
- A setup-only forwarding Proxy around native `Audio` keeps weak references
  for observation. It does not change play/pause behavior or retain audio strongly.
  The popup is dismissed before sampling; there are **no observer calls during
  the 90-second hidden interval**. Audio output is not muted in the preferences.
- The existing popup actor requires `extensions.webextensions.remote=false`.
  This process-model relaxation is a limitation; this is not an untouched
  default-profile or full Feature 095 acceptance claim.

## Background lifetime finding

The built manifest has MV2 `background.scripts` with no `persistent` key.
Firefox itself reports **`persistentBackground: true`**, not an event page.
Therefore the premise in the Feature 256 spec is incorrect for this artifact:
this journey can establish whether its persistent background survives, but
cannot prove that playing Audio would prevent suspension in a different
`persistent: false` artifact. No manifest or product source was changed to
manufacture that experiment.

## Replay

From this worktree, with loopback listeners and local Firefox execution allowed:

```sh
pnpm --filter @proso/extension build
FC_SEED=20260920 \
FIREFOX_BIN=/etc/profiles/per-user/notroot/bin/firefox-nightly \
BACKGROUND_ARTIFACT_DIR=.artifacts/background-playback/replay \
node scripts/background-playback-journey.mjs
```

The default runs both preference values. Set `BACKGROUND_MODE=enabled` or
`BACKGROUND_MODE=disabled` to replay one leg. Each artifact directory contains
`receipt.json` plus browser/driver process logs; use a fresh directory to retain
prior anomalies. Exit 0 means every selected runtime assertion passed, 1 means a
behavioral assertion failed, and 2 means the observer/journey was blocked.

## Harness changes

The raw `scripts/lib/webdriver.mjs` already installs a built unpacked extension;
it required no changes. `scripts/background-playback-journey.mjs` adds this
bounded diagnostic, reusing the existing driver, popup actor, and fixture.
The fixture server gains only optional audio bytes and content type, retaining
its existing defaults. There are no product-code changes.

## Retained anomalies and broader gates

The first runtime attempt (`run-3`) overlapped with `make user-gate` running
another real Firefox smoke. Its enabled audio advanced from 0.631312 s to
76.305583 s and was paused at the 90-second sample, while its background stayed
running with the same time origin. Navigation/reload afterward inherited that
paused session, so they did not independently establish those trigger outcomes.
This is retained as a failed run, not overwritten by subsequent passes. The
overlapping browser is a possible source of interference; causation was not
proven. Both isolated enabled replays passed; the original failure remains in the evidence.

Two earlier observer setup attempts were blocked before the hidden interval:
ordinary extension `eval` was denied by CSP, then privileged access to a weak
reference hit Firefox's Xray wrapper. The observer now executes its setup in a
privileged sandbox and explicitly unwraps weak references. The extension CSP
and built files are unchanged. Both original receipts are retained.

An initial direct `freePort()` probe returned `listen EPERM` on loopback. The
unmodified retained smoke and subsequent launcher calls succeeded, so this did
not remain a blocking prerequisite. No sandbox flags or host escape were used.

- `make browser-linkage`: exit 0, Firefox/driver version checks passed.
- Retained `node scripts/smoke-reading.mjs`: exit 0, real loaded-extension
  synthesis/start/pause/resume diagnostic passed.
- Focused background-playback/policy unit tests: 3 suites, 13 tests passed.
- `FC_SEED=20260920 make fuzz`: exit 0, 4 suites, 11 tests passed.
- `pnpm exec biome check scripts/background-playback-journey.mjs
  scripts/lib/reading-fixture-server.mjs`: passed; `node --check` and
  `git diff --check` passed.
- **BLOCKED:** `FC_SEED=20260920 make user-gate` exits 2 by the repository's
  explicit Feature 095 public-control/anomaly/restart/soak contract, after its
  fuzz and loaded-Firefox diagnostic pass.
- **BLOCKED:** `GENERATOR_FAMILY=openai make gate` exits 2 at `make doctor`:
  `Prisma client is missing; run make bootstrap`. Consequently the full
  deterministic/cross-family delivery gate did not run.
- **Unmeasured:** a true non-persistent event page, default remote-extension
  process behavior, other Firefox versions, sleep/browser restart, long-term
  soak, and external-provider audio. No broader feature-completion claim.

## Local delivery

The changes are prepared for the conventional local commit
`test(background): verify loaded Firefox playback survival`; nothing is pushed.
The final standalone `git add` succeeded. An earlier combined shell command
failed to create the worktree's `index.lock` with `Read-only file system`; that
attempt is retained in the JSON. No alternate Git directory or hook bypass was
used. The commit's own output/history establishes its final status.
