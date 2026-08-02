# Gate contract

## Separation of duties

- **Actor:** uses browser-visible or accessibility-visible controls—click,
  type, keyboard, scroll, resize, close, and relaunch.
- **Observer:** owns hermetic article/API/profile fixtures, assertions, browser
  console, extension/background logs, HTTP records, process health, and resource
  samples.
- **Verdict:** comes from deterministic assertions and a replayable trace, not
  the actor's narrative.

The actor must not call handlers, mutate storage, dispatch extension messages,
or edit fixture state after the journey begins. Observer setup may configure a
fresh profile before launch and may collect internal diagnostics after public
assertions fail; it cannot perform the actor's action.

## Current tools

- `fast-check` 4.9.0: state and schema properties with seed/run overrides.
- Jest: deterministic extension/server models and fault injection.
- Real Firefox + geckodriver: retained loaded-extension reader smoke.
- Dockerized Playwright: popup/content/visual Chromium paths and trace/video.
- `jest-axe`: deterministic accessibility checks.
- Existing console fixture: unexpected console/error anomaly oracle.

Do not add another browser framework until a public journey cannot be expressed
with these tools and that limitation has been reproduced.

## Required tiers

1. **PR-fast:** targeted unit/integration checks plus `make fuzz`.
2. **Feature completion:** `make user-gate` and every journey mapped to the
   changed feature.
3. **Nightly fuzz:** larger seed budgets, message-order faults, corrupt storage,
   HTTP delay/error/retry, rapid valid playback/navigation sequences, retained
   minimized regressions.
4. **Nightly soak:** repeated extract/play/pause/resume/seek/stop/reload cycles
   with crash, hang, CPU, RSS, file-descriptor, process, request-rate, and
   listener/event observations.

## Action grammar

Prefer commands with explicit preconditions:

- install/load extension, open article, open/close popup;
- start, pause, resume, stop, speed, seek, previous, next;
- switch tabs, navigate/reload, background/foreground;
- open settings, change provider/cache/voice/speed, relaunch;
- network delay, 4xx/5xx/429, disconnect, corrupt/missing storage;
- keyboard-only and accessibility traversal.

Weight the normal Firefox reading journey most heavily while preserving fault
and boundary exploration. Persist every discovered seed and minimized trace.

## Evidence record

Retain commit/build and browser identities, isolated profile/fixture identity,
seed, complete actions, replay command, assertions, timestamps, HTTP records,
console/background/process logs, screenshots/video/trace, resource samples, and
exit code. The existing smoke writes `.artifacts/smoke-reading/receipt.json` and
`reading-journey.png`; extend rather than replace that contract.

Replay failures at least twice to classify reproducibility. Never erase an
original anomaly because a later replay passed.
