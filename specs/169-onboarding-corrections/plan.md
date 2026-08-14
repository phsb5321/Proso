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
| Privacy First | PASS WITH DOCUMENTED EXCEPTION — no destination is added and traffic remains pinned to the reader-entered exact origin. WebExtension MatchPattern grammar cannot encode a port, so the narrowest effective runtime permission covers the entered scheme and host across ports; the popup discloses that breadth. |
| Security by Default | PASS WITH MITIGATION — candidate provider keys are validated before local persistence; rejected candidates never replace working keys. Port-bearing permission strings that Firefox stores but cannot apply are rejected, and all host requests continue to use the exact persisted origin. |
| User Experience Excellence | PASS — success starts reading once, errors remain actionable, labels match actions, and billing copy is not an introduction. |
| Modular Architecture | PASS — pure classification/validation remains in `utils/first-run.ts`; adapter/service reconfiguration remains in the composition root. |
| Critical-path tests | PASS — each historical bug receives a regression assertion and near-miss; public browser QA remains fail-closed. |
| INV-001 / INV-002 | PASS — the account-free host and BYOK routes remain available; managed entitlement is unchanged. |

### Complexity tracking

| Constitutional rule | Necessary exception | Mitigation and falsifier |
|---|---|---|
| Principle I condition 3 says the runtime host permission is for the exact origin. | Firefox and Chromium MatchPattern grammar has no port component. A non-default-port origin cannot receive a usable port-scoped permission; the narrowest platform grant is scheme plus host across ports. | Persist, display, test, and synthesize only against the exact reader-entered origin; disclose the browser grant's across-port scope; reject dead port-bearing patterns; prove with a no-CORS host that the effective grant reaches the exact configured port. |

No abstraction-layer exception is required.

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

Accept bracketed IPv6 loopback hostname syntax. Replace hardware-specific host prose with generic reader-operated-machine wording. Extend the first-run CSS suppression set to the cost section. Give the first-run panel its own `[hidden] { display: none; }` override so authored flex layout cannot defeat the platform attribute. A real-popup regression evaluates computed style and rendered tab stops for a configured reader rather than trusting the `hidden` property.

### 6. Browser-valid runtime host grants

Construct runtime permission patterns in one pure helper beside the existing effective-grant matcher. WebExtension MatchPattern grammar has no port component, so `http://127.0.0.1:45019` requests `http://127.0.0.1/*` and bracketed IPv6 requests `http://[::1]/*`. A typed request wrapper invokes the browser API synchronously before its first await, preserves the user gesture, and converts denial or API rejection into a non-throwing result. The constructor rejects non-origin input, and the matcher rejects legacy port-bearing patterns Firefox may store without applying. All four request sites use the wrapper. Unsupported saved origins return to editable onboarding instead of leaving an inert grant button. The popup discloses that the browser permission covers the host across ports while Proso's persisted destination, capability check, and synthesis requests remain pinned to the exact origin.

## Files

```text
specs/169-onboarding-corrections/{spec,plan,tasks}.md
packages/extension/src/utils/first-run.ts
packages/extension/src/utils/permissions/match-pattern.ts
packages/extension/src/entrypoints/popup/main.ts
packages/extension/src/entrypoints/popup/index.html
packages/extension/src/entrypoints/popup/style.css
packages/extension/src/entrypoints/options/controller.ts
packages/extension/wxt.config.ts
packages/extension/src/composition/container.ts
packages/extension/src/handlers/settings.handlers.ts
packages/extension/src/handlers/provider.handlers.ts
packages/extension/src/handlers/schemas/provider.schemas.ts
packages/extension/src/utils/options/api-key-tester.ts
packages/extension/src/utils/messaging/protocol.ts
packages/extension/tests/unit/utils/first-run.test.ts
packages/extension/tests/unit/utils/permissions/match-pattern.test.ts
packages/extension/tests/unit/config/migrations.test.ts
packages/extension/tests/unit/entrypoints/popup-first-run-controller.test.ts
packages/extension/tests/unit/composition/container.test.ts
packages/extension/tests/unit/utils/first-run-wiring.test.ts
packages/extension/tests/unit/handlers/settings.handlers.test.ts
packages/extension/tests/unit/handlers/provider.handlers.test.ts
packages/extension/tests/unit/utils/options/api-key-tester.test.ts
docs/agent-delivery-harness.md
docs/reading-journey-status.md
```

## Test strategy

### Red first

Add assertions for canonical/trailing-slash-vs-custom classification, migration v8 output, neutral 402 introduction, bracketed IPv6, generic host copy, validation-before-save, invalid-vs-transport status, rejection preservation, proactive and recovery host/BYOK one-start behavior, Retry→Grant label/action transition, configured-reader hidden-row preservation, actual live voice clearing, and computed cost visibility. After exact-head QA, add discriminating regressions for computed first-run-panel visibility, rendered focus order, port-free host permission construction, legacy dead-pattern rejection, permission API rejection, unsupported saved origins, and exact-origin network use. Update the existing source pins that intentionally mention `pendingPlayAfterConnect` and the exact host-save payload so they assert the new contract rather than failing incidentally. Run every new assertion against the defective implementation and retain the failing receipt.

### Green checks

1. Focused Feature 169 unit/JSDOM suites.
2. Full extension unit project.
3. Extension TypeScript, Biome lint/format, Firefox build, Chrome build.
4. Seeded fuzz with recorded seed and replay command.
5. `make verify` and browser diagnostics.
6. `make user-gate-diagnostic`; `make user-gate` remains fail-closed unless public acceptance exists.

### Exact-head acceptance

After commit and push, an independent actor uses a clean exact-head checkout and fresh profiles. Firefox must expose a real optional-permission prompt, typed host address, Connect and Allow controls, a capability request at the exact configured port, one playback start, Playing, highlight, and audible non-zero output in no more than three clicks. The no-CORS host fixture makes an ineffective grant fail rather than pass through CORS. For bracketed IPv6, the actor must prove Firefox applies `http://[::1]/*` and that requests still reach the exact entered port. A configured profile must preserve the player with a zero-sized hidden first-run panel and no onboarding controls in focus order. Brave/Chromium must regress the corresponding popup behavior. Missing prompt, request, Playing, highlight, or audio is BLOCKED.

The OpenAI-generated final head requires a direct DeepSeek v4 Pro review bound to the exact pushed SHA. Any head movement invalidates both browser QA and review.

## Delivery and rollback

Commit additively with subjects no longer than 72 characters; never amend or force-push. Open one hotfix PR after local gates. Merge only when GitGuardian/required checks are green, all threads are resolved, exact-head browser QA passes, and exact-head DeepSeek allows.

Rollback is one squash revert PR: `git revert <feature-169-merge-sha>`.
