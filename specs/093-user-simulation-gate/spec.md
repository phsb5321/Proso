# Feature 093 — User simulation gate

## Goal

Make agent-operated real-browser use, seeded stateful fuzzing, and independent
oracles the explicit feature-completion contract for Proso.

## Requirements

- **FR-001:** Codex must discover a repository-scoped Proso user-gate skill.
- **FR-002:** The actor must use public browser/accessibility interactions only.
- **FR-003:** Deterministic assertions, not agent prose, decide the verdict.
- **FR-004:** A focused command must run the existing extension/server
  `fast-check` properties with configurable seed and run count.
- **FR-005:** The retained real-Firefox smoke is an internal-dispatch
  diagnostic. Feature completion requires a separate public-control actor and
  the outcome-level acceptance in Feature 095.
- **FR-006:** Missing browser prerequisites must fail rather than skip.
- **FR-007:** The skill must state the current shortcut-matcher limitation so
  the smoke is not overclaimed as OS-level key input proof.
- **FR-008:** Evidence must retain build/browser/fixture identities, actions,
  assertions, HTTP and process logs, artifacts, anomalies, and replay command.

## Acceptance and status at exact receipt HEAD `7e4cda0`

This feature is governed by
[`Feature 095`](../095-reading-journey-contract/spec.md). A command is an
evidence carrier, never an acceptance verdict.

| Journey | Status | Evidence / falsifier |
|---|---|---|
| Seeded extension/server properties | ✓ verified | Default seed `20260730` and replay `FC_SEED=17 FC_NUM_RUNS=200 make fuzz` passed. A property failure falsifies this row. |
| Built Firefox downstream reader route | ◐ diagnostic only | The fixture run reached TTS, visible footer/highlight, pause, and resume, but `pressToggle()` directly calls `ExtensionParent`/`shortcuts.onCommand()`. Any claim of public actor control is therefore falsified. |
| Public start and accessible controls | ◯ blocked | Firefox exposes the Proso browser action in the Unified Extensions panel, but the current Marionette harness cannot drive its remote popup frame. A retained role/name and keyboard trace for start/pause/resume/previous/next/speed/seek/stop is required. |
| Fresh no-key managed Free reading (INV-001) | [pending] Pedro | `FEATURE_MATRIX.Free.managedTts = false` produces a pre-cache 402. The local fixture bypasses that entitlement and cannot prove this journey. |
| Privacy, BYOK, and accounting (INV-002/INV-006) | ◯ blocked | Requires sanitized HTTP, transient-BYOK, failed/malformed, and cache-repeat observer records in one receipt. |
| Anomaly, restart, and soak campaigns | ◯ blocked | Requires bounded corrupt-data, HTTP/network, interruption/relaunch, and soak traces with replayable seeds. |

`make user-gate-diagnostic` may collect the first two rows. `make user-gate`
must exit non-zero until the blocked rows have Feature 095-compliant evidence.

This slice reuses the already-pinned Playwright, geckodriver, Jest, fast-check,
and jest-axe stack. It does not add a redundant browser framework or claim that
the existing smoke tests Firefox's OS shortcut matcher.
