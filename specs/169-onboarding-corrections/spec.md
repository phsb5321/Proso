# Feature 169: First-run onboarding corrections

**Created**: 13/08/2026
**Status**: In progress
**Purpose**: Correct the first-run journey shipped by Feature 162 so every route shown to a new reader is truthful, safe, and immediately usable.

## Problem

A fresh or migrated reader may already have Proso's default managed service address in local settings even though they have no usable listening route. The popup mistakes that default for user configuration, hides the two free routes, and can introduce the product with a billing refusal. When onboarding does appear, route success copy may promise playback without starting it, an untested provider key may replace a working key, a stale action label may invoke a different action, and a previously selected provider voice may remain active after switching to a reader-operated host.

Exact-head browser QA also exposed two boundary defects that attribute-only and portless fixtures had masked: authored `display: flex` kept the hidden onboarding panel rendered and tabbable for configured readers, and Firefox stored a port-bearing permission string that its MatchPattern engine could not apply. WebExtension host permissions cannot be scoped to one port, so the narrowest usable runtime grant is scheme plus host; Proso must disclose that permission breadth while keeping every network request pinned to the exact reader-entered origin.

## User stories

### US1 — A reader without a route sees a truthful introduction

A reader who has no enabled host, provider key, or licence sees the two free routes even when migration stored Proso's default managed service address. The default address is product configuration, not evidence that the reader configured a route. A genuinely custom managed service address may preserve the normal player.

### US2 — One successful setup gesture starts one reading

After a reader successfully connects their own host or verifies their own provider key from the visible first-run panel, Proso leaves onboarding and starts the requested page exactly once. The status copy describes the observed behavior. Failed provider-key validation changes neither the selected working key nor playback configuration.

### US3 — Every repair action says and does the same thing

A missing host grant always exposes a button named **Grant access** that requests access. An unreachable host exposes **Retry**. A rejected key exposes **Edit key**. Moving between failures updates the action and label together. A local-host selection uses automatic voice selection, and no cost estimate appears beneath the two-free-routes panel.

## Functional requirements

- **FR-001 Default route classification**: The canonical managed service address shipped by Proso MUST NOT count as reader configuration.
- **FR-002 Migrated defaults**: A profile whose migration persisted the canonical managed service address and no reader-owned route MUST show onboarding.
- **FR-003 Custom managed route**: A valid managed service origin that differs from the canonical default MUST preserve the normal player. Equivalent spellings of the canonical origin, including a trailing slash, remain the default.
- **FR-004 No billing introduction**: A managed billing refusal for a default-only profile MUST lead to neutral free-route guidance, not display the billing refusal as the introduction.
- **FR-005 Host setup completion**: Successful host validation, the narrowest browser-expressible runtime host grant derived from the exact entered origin, capability check, and save MUST initiate playback exactly once from both proactive onboarding and failure-recovery onboarding.
- **FR-006 Provider-key validation**: A provider key MUST pass the existing real validation path before it is persisted or selected.
- **FR-007 Preserve working key**: A rejected or unverifiable candidate MUST NOT overwrite a previously working provider key.
- **FR-008 Honest key status**: Provider-key status MUST distinguish successful verification from a validation or transport failure without calling every failure a rejected credential.
- **FR-009 Atomic repair action**: Repair action kind, visible label, and reason MUST be updated as one state change. A missing grant always resets the action to **Grant access**.
- **FR-010 Loopback address**: IPv4 loopback, `localhost`, and bracketed IPv6 loopback addresses MAY use HTTP; non-loopback HTTP and addresses with paths remain rejected.
- **FR-011 No hardware implication**: Onboarding MUST describe a reader-operated host generically and MUST NOT imply that Proso discovers or ships an address for a particular device.
- **FR-012 Automatic local voice**: Selecting the reader-operated host MUST clear the actual voice preference consumed by playback, both in persisted settings and the live playback service.
- **FR-013 Free-route presentation**: While onboarding is visible, status, progress, playback controls, speed, and cost estimate MUST be absent from layout.
- **FR-014 Existing reader preservation**: A configured profile MUST retain the normal player; the first-run panel and grant row MUST compute to `display: none`, occupy no layout, and contribute no focusable controls.
- **FR-015 Single start**: Storage notifications, route reconfiguration, a prior failed Play, and rapid duplicate activation MUST NOT cause a second playback start after one successful setup.
- **FR-016 Honest host-permission scope**: Because WebExtension MatchPattern grammar cannot encode a port, a ported reader origin MUST request the narrowest usable scheme-plus-host pattern without a port. The interface MUST disclose that the browser grant covers that host across ports, while persisted configuration, capability checks, and synthesis traffic remain pinned to the exact entered origin. Browser API rejection MUST remain a visible actionable failure rather than an unhandled promise, and an ungrantable saved address MUST return the reader to editable onboarding.

## Measurable acceptance criteria

The repository uses native Jest and retained browser actors rather than adding a Gherkin layer.

- A fresh profile and a version-7 profile migrated to the canonical managed address both render the first-run panel.
- A canonical managed address with an equivalent trailing slash still renders onboarding, while a genuinely custom origin renders the normal player.
- When `playback.start` returns the managed billing refusal for a default-only profile, the onboarding subtitle reads neutral free-route guidance and contains no billing refusal.
- A proactive host Connect produces one `playback.start` request after save; zero or two requests fail the criterion.
- A recovery journey of failed Play → onboarding → successful Connect produces one additional `playback.start`, never zero or two.
- A proactive accepted provider key is validated before storage, selected after storage, and produces one `playback.start` request.
- A rejected provider key leaves the prior stored key byte-identical and produces no provider selection or playback start.
- A provider-key transport failure says the key was not saved and does not describe the candidate as rejected.
- A Retry action followed by a grant-missing failure visibly becomes **Grant access**, and activating it requests the browser-valid pattern derived from the exact configured origin.
- A configured reader retains the normal player; the first-run panel and grant row compute to `display: none`, and no first-run or repair control appears in sequential focus order.
- Switching to the local route leaves the live playback voice and persisted `voice` value null.
- With onboarding visible, the real popup stylesheet computes the cost section as `display: none`; without onboarding it retains its normal display.
- `http://127.0.0.1:45019` requests `http://127.0.0.1/*` while capability and synthesis requests still reach port `45019`; a stored port-bearing pattern is rejected as ineffective.
- A thrown permission API call produces a visible host-access error with no playback retry, while a saved `file:` destination hides the inert grant row and reopens editable onboarding.
- `http://[::1]:8080` normalizes successfully and requests `http://[::1]/*`, while `http://192.168.1.5` remains rejected; the exact Firefox gate verifies that the IPv6 pattern is effective rather than inferring support from URL normalization.
- Popup copy contains no named hardware example or shipped/discovered host implication.
- In a fresh Firefox profile, a reader types the host address, uses real Connect and Allow controls, observes a host request, and reaches Playing with audible output in no more than three clicks after opening onboarding.
- The same exact build leaves a configured Firefox profile on the player and completes the corresponding Brave/Chromium regression journey.

## Falsifiers

Each historical defect is planted or represented by a near-miss:

1. Treat the canonical managed address (or its trailing-slash spelling) as custom: fresh and migrated-default assertions fail.
2. Forward the managed billing refusal into the onboarding subtitle: neutral-introduction assertion fails.
3. Remove the post-connect start: proactive setup assertion observes zero starts.
4. Start once for the old retry flag and once for setup success, or accept two rapid setup activations: assertions observe two starts or duplicate grants/saves.
5. Persist before validation: rejected-candidate preservation assertion detects changed storage.
6. Render transport failure as credential rejection: honest-status assertion fails.
7. Keep the previous Retry/Edit label when grant is required: action-reset assertion fails by name or invokes no permission request.
8. Clear only a local-host-specific field: live PlaybackService voice assertion remains the previous managed voice.
9. Remove the first-run cost selector: computed-style assertion exposes the cost section.
10. Compare IPv6 hostname without brackets: loopback normalization assertion fails.
11. Restore a named hardware example: generic-host copy assertion fails.
12. Let authored first-run layout override `hidden`: computed display and rendered-tab-stop assertions expose the panel for a configured reader.
13. Send a port-bearing origin string to `permissions.request()`, or treat a stored port-bearing pattern as effective: MatchPattern assertions fail and the no-CORS public host journey cannot reach capabilities.
14. Let a rejected permission promise escape or leave an unsupported saved origin behind an inert **Grant access** button: rejection and editable-onboarding assertions fail.

## Non-goals

- No change to managed Free entitlement, credit accounting, or billing.
- No new provider-validation service or new browser framework.
- No host discovery, probing, shipped host address, production deployment, Paddle change, credential rotation, store publication, or workflow edit.
- No removal of legacy local-host configuration fields outside the corrected first-run write path.
