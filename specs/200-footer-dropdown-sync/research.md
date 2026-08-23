# Research — 200-footer-dropdown-sync

Pre-fix receipts (verified against `main @ 8ab6936`, 23/08/2026):

| Bug | Evidence |
|---|---|
| L1 — language override never reaches synthesis | `language.handlers.ts` `handleLanguageSetOverride` wrote only module-global `globalOverride`; `playback.handlers.ts:334-338` `playback.start` reads only `tabLanguageStates.get(tabId).override` (null by default, never written). Two stores, written in one, read in the other. |
| L2 — mid-playback override applies to nothing | `service.setLanguage()` called only from `playback.start` (`playback.handlers.ts:345`); `setOverride` never touched `PlaybackService.detectedLanguage` (consumed at `playback-service.ts:757/1113/1377`). |
| S1 — footer speed not persisted | `footer.action {speed}` -> `PlaybackService.setSpeed` mutated state + broadcast only; no settings-store write; restart lost the value. |
| D1 — dropdown highlights stale | `StickyFooter.updateState` refreshed button text/aria only; option highlights refreshed only on full `_render()`. |
| D3 — full footer rebuild per pick | speed action and language-option click both called `this._render()` (whole shadow-root rebuild). |
| D4 — menus don't close properly | Escape closed only the speed dropdown; no outside-click close. |

## Verification receipts (branch `f7aa9ce`)

- Focused suites: language.handlers + playback-service + sticky-footer-coherence — 87 tests PASS.
- Full extension unit suite: 124 suites / 2642 tests PASS, 1 skipped (env-blocked).
- `make verify` PASS (doctor, format, lint, typecheck, smoke-reader, smoke-server-boot, security, brand-assets, icons, preflight 45 assertions).
- `make verify-full` PASS in the nix-shell toolchain (coverage, build-all, quality, dependency audit, subscription-deploy-rehearsal PASS at `f7aa9ce`).
- `make fuzz` PASS.
- Real-host journey: `LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301 node scripts/local-host-journey-gate.mjs` → PASS at `f7aa9ce` against the live Supertonic bridge.3 daemon (zero managed requests, tab policy, real audio).
- Different-family adversarial review: BLOCKED by lane availability — the anthropic holdback oracle is capped (0/3 bearers), delegate auto refused (100% of window), the DeepSeek lane refuses private payloads (Chinese-frontier boundary), groq meta-llama retired (model_not_found), codex same-family. Per repo precedent (e.g. #115, #117) the diff landed on the qa mechanical gate + orch verification of the review questions (label/audio divergence closed by unified per-tab write + live-apply; setSpeed persistence idempotent; float equality safe for all SPEED_OPTIONS; targeted updateState covers all _render() side effects the paths needed; outside-click retargeting verified; tests fail on regression by construction — the Escape test failed twice in development).
