# Feature 243 — Recovery delivery plan

Recovery recorded 12/09/2026. The original implementation and `spec.md` were
recovered staged, with a failed commit; this is a continuation plan, not a
claim that a plan existed before that implementation.

## Scope and hypothesis

Keep the existing shared playback-service, settings-store, footer-message and
content-extraction seams. Play rejected loading/error states, footer progress
mixed paragraph/document units, settings voice changes did not regenerate the
current paragraph, and hover extraction ran only at document startup.

Falsifiers: the retained reader-control tests or loaded-extension hover gate
remain red; an idle pass renumbers paragraphs after playback starts; keyboard
voice selection changes playback instead of selecting a voice.

## Recovery sequence

1. Reconcile filesystem, parent transcript, GitHub refs and services before
   writing. Resume the failed duplication gate, not a second implementation.
2. Share footer test setup and contract fixtures without dropping assertions.
3. Pin and fix recovery findings: stale voice labels, Escape, native option
   keyboard activation, focus loss on playback ticks, and idle-callback races.
4. Repair the shared test launcher for geckodriver 0.37's process-level
   `--allow-system-access` opt-in; prove both privileged and unprivileged cases.
5. Run focused tests, seeded fuzz, full deterministic checks, public Firefox
   journeys and the fail-closed Feature 095 user gate. Preserve failures.
6. Commit and retain an exact-head draft PR. Obtain a capable different-family
   review and green required checks before considering merge. No release,
   deployment or daily-profile installation in this slice.

## Constitution check

- No new runtime dependency, network destination, provider, permission or
  telemetry. New voice control reuses the existing background message API.
- Framework-free playback domain and existing Result/port contracts retained.
- Voice options remain native buttons with visible state and keyboard access.
- Real Firefox tests use disposable profiles. System access remains opt-in,
  only for the test driver; the extension manifest gains no permission.
- Tests and gates remain fail-closed. An unresolved full gate is not a pass.

## Public-footer continuation — 13/09/2026

Use Firefox's platform accessibility tree (`nsIAccessibilityService`) to find
visible footer controls by role/name and invoke their public accessibility
activation, or focus and send WebDriver keys. Do not query the closed shadow
DOM, call extension handlers, or mutate storage after the actor starts.
A synthetic closed-root button probe confirmed that Firefox exposes its public
`pushbutton` name in this tree without changing the root's mode.

Extend the existing local-host public journey rather than duplicating its
settings/permission setup. An opt-in fixture-only footer campaign checks:
voice catalog, successful voice change with a matching HTTP request and playing
state, a predetermined failed voice request followed by Play recovery, keyboard
selection/Escape/focus, and Close player. Retain exact request history,
accessibility snapshots, screenshot, process log and build hashes on failure
as well as success. Missing accessibility/control is BLOCKED. Add negative
plants so a broken voice path cannot pass on a renamed button alone.
The actor selects 0.5x through the public speed control before the short-clip
campaign, leaving a measurable window for Firefox's asynchronous accessibility
cache under host load; response/current-first-word assertions stay unchanged.

Hypothesis: public footer actions still fail at seams mocked by unit tests.
Falsifier: named actions produce neither the expected voice-specific HTTP
request nor the subsequent visible playing state within a bounded wait.

## Known delivery constraints

`main` was unprotected and its protection endpoint returned HTTP 403 on
12/09/2026. `make verify-full` stopped at the dependency audit with 14
high-severity advisory paths; no allowlist was expanded. `make user-gate`
intentionally blocks pending Feature 095's complete outcome/soak receipt.
The legacy adversarial script pins retired models and must not be invoked;
review must use a currently permitted, privacy-eligible different-family lane.

Generator provenance: recovered application changes are Anthropic-authored;
recovery repairs are OpenAI-authored. GLM was used only for generic public DOM
API explanations, without repository content, implementation or verdict authority.
