# Implementation plan: First-run onboarding corrections

**Branch**: `169-onboarding-corrections`
**Spec**: `specs/169-onboarding-corrections/spec.md`
**Base after merge-order gate**: `6c93d3e051e6e0a93708f36859bb4706da365fca`

## Summary

Repair the shipped onboarding in place. Keep the existing first-run decision module and popup entrypoint, reuse the existing `settings.testApiKey` validation handler, and make the live PlaybackService voice follow the local-route selection. Add behavioral JSDOM/controller tests around the real popup rather than expanding source-regex pins.

## Technical context

- **Language**: TypeScript 5.9, strict mode, ES modules
- **Runtime**: WXT Firefox MV2 and Chromium MV3 WebExtension
- **UI**: Existing popup HTML/CSS/TypeScript entrypoint
- **Tests**: Jest unit/JSDOM plus retained Firefox and Chromium actors
- **Persistence**: Existing browser local storage and configuration migration v8
- **Architecture**: Existing first-run decision/orchestrator, message handlers, and composition root; no new abstraction layer

## Constitution check

| Principle | Decision |
|---|---|
| Privacy First | PASS — no destination is added; host remains reader-entered and exact-origin granted. |
| Security by Default | PASS — candidate provider keys are validated before local persistence; rejected candidates never replace working keys. |
| User Experience Excellence | PASS — success starts reading once, errors remain actionable, labels match actions, and billing copy is not an introduction. |
| Modular Architecture | PASS — pure classification/validation remains in `utils/first-run.ts`; adapter/service reconfiguration remains in the composition root. |
| Critical-path tests | PASS — each historical bug receives a regression assertion and near-miss; public browser QA remains fail-closed. |
| INV-001 / INV-002 | PASS — the account-free host and BYOK routes remain available; managed entitlement is unchanged. |

No complexity exception is required.

## Design

### 1. Canonical managed-route classification

Import `defaults` into the first-run decision module and expose one pure custom-managed-route predicate. Normalize valid addresses to their URL origins before comparison so an equivalent trailing slash or host-case spelling cannot masquerade as custom configuration. `isUnconfigured` treats the canonical default as product configuration and a distinct valid origin as explicit configuration. The popup uses the same predicate for failure classification, eliminating the duplicated “any nonempty URL” rule.

Migration v8 remains unchanged: persisting the canonical service address is required for managed requests, but a new regression joins its output to first-run classification.

### 2. Validate, persist, select, start

Extend the existing BYOK save orchestrator with one injected validator. Order is:

1. normalize and locally sanity-check the candidate;
2. invoke the existing background `settings.testApiKey` path;
3. on success only, send the validated candidate to the existing provider-selection handler;
4. reconfigure and persist the candidate/provider as one selection operation;
5. hide onboarding and invoke playback once.

Validation failures return a typed `invalid` versus `unavailable` reason from the existing settings handler through the API-key utility to the popup rather than relying on message-string matching. The UI says an invalid key was rejected only for the validation result that proves it; transport/server failures say the key was not saved.

Both host and BYOK success use one guarded popup completion helper that hides onboarding and calls `handlePlayPause()` once. Route controls are disabled synchronously while their asynchronous setup is in flight. The old pending-retry flag is removed so proactive, recovery, and rapid duplicate-input paths cannot stack two starts.

### 3. Atomic fix-action state

Replace the label-only helper with one setter receiving action kind, label, and reason together. Grant discovery resolves the origin first and then sets `grant` + `Grant access` in one synchronous update. Retry and Edit key use the same setter.

### 4. Actual local voice state

The first-run host save writes `voice: null`, the setting PlaybackService consumes, instead of claiming that `localHostVoice` controls playback. When the composition root reconfigures to the local provider, it also calls `PlaybackService.setVoice(null)` so a currently running background context cannot retain a managed voice until restart.

### 5. Presentation and address correction

Accept bracketed IPv6 loopback hostname syntax. Replace hardware-specific host prose with generic reader-operated-machine wording. Extend the first-run CSS suppression set to the cost section.

## Files

```text
specs/169-onboarding-corrections/{spec,plan,tasks}.md
packages/extension/src/utils/first-run.ts
packages/extension/src/entrypoints/popup/main.ts
packages/extension/src/entrypoints/popup/index.html
packages/extension/src/entrypoints/popup/style.css
packages/extension/src/composition/container.ts
packages/extension/src/handlers/settings.handlers.ts
packages/extension/src/handlers/provider.handlers.ts
packages/extension/src/handlers/schemas/provider.schemas.ts
packages/extension/src/utils/options/api-key-tester.ts
packages/extension/src/utils/messaging/protocol.ts
packages/extension/tests/unit/utils/first-run.test.ts
packages/extension/tests/unit/config/migrations.test.ts
packages/extension/tests/unit/entrypoints/popup-first-run-controller.test.ts
packages/extension/tests/unit/composition/container.test.ts
packages/extension/tests/unit/utils/first-run-wiring.test.ts
packages/extension/tests/unit/handlers/settings.handlers.test.ts
packages/extension/tests/unit/handlers/provider.handlers.test.ts
packages/extension/tests/unit/utils/options/api-key-tester.test.ts
```

## Test strategy

### Red first

Add assertions for canonical/trailing-slash-vs-custom classification, migration v8 output, neutral 402 introduction, bracketed IPv6, generic host copy, validation-before-save, invalid-vs-transport status, rejection preservation, proactive and recovery host/BYOK one-start behavior, Retry→Grant label/action transition, configured-reader hidden-row preservation, actual live voice clearing, and computed cost visibility. Update the existing source pins that intentionally mention `pendingPlayAfterConnect` and the exact host-save payload so they assert the new contract rather than failing incidentally. Run all new assertions against the shipped implementation and retain the failing receipt.

### Green checks

1. Focused Feature 169 unit/JSDOM suites.
2. Full extension unit project.
3. Extension TypeScript, Biome lint/format, Firefox build, Chrome build.
4. Seeded fuzz with recorded seed and replay command.
5. `make verify` and browser diagnostics.
6. `make user-gate-diagnostic`; `make user-gate` remains fail-closed unless public acceptance exists.

### Exact-head acceptance

After commit and push, an independent actor uses a clean exact-head checkout and fresh profiles. Firefox must expose a real optional-permission prompt, typed host address, Connect and Allow controls, a host HTTP request, Playing, and audible output in no more than three clicks. If bracketed IPv6 is exercised, the actor must also prove Firefox accepts the exact-origin match pattern rather than inferring route support from URL normalization. A configured profile must preserve the player. Brave/Chromium must regress the corresponding popup behavior. Missing prompt, request, Playing, or audio is BLOCKED.

The OpenAI-generated final head requires a direct DeepSeek v4 Pro review bound to the exact pushed SHA. Any head movement invalidates both browser QA and review.

## Delivery and rollback

Commit additively with subjects no longer than 72 characters; never amend or force-push. Open one hotfix PR after local gates. Merge only when GitGuardian/required checks are green, all threads are resolved, exact-head browser QA passes, and exact-head DeepSeek allows.

Rollback is one squash revert PR: `git revert <feature-169-merge-sha>`.
