# Feature Specification: Reconcile architecture audit with actual TTS routing

**Feature Branch**: `113-architecture-audit-reconcile`
**Created**: 06/08/2026
**Status**: Draft

## Problem

The architecture docs still describe legacy TTS behavior (`ElevenLabs` direct calls and `BrowserTTSAdapter`) while `main` now routes synthesis through the server contract (`POST /api/v1/tts/synthesize`) and does not offer browser speech inside this production path.

## Scope

- Update `docs/architecture/current.md` so the flow and role descriptions match the running `main` route (`ProsoApiAdapter` → `/api/v1/tts/synthesize` → server synthesis/router/cache/credits).
- Update `docs/architecture/proposed.md` to remove historical `BrowserTTSAdapter (future)` from the IAudioGenerator implementer list.
- Sweep `docs/architecture/findings.md` and `docs/PRE_LAUNCH_CHECKLIST.md` for historical `speechSynthesis` / browser-TTS assertions and replace or confirm no such claims remain in scope.
- Record whether `docs/firefox-extension-testing-strategy.md` needs a fix or can be left as a flagged out-of-scope call.
- Produce evidence receipts for the before/after grep and route verification.

## Verification Outcomes

- `git grep -rn -i 'speechSynthesis|browser tts|speech\.synthesis' docs/architecture docs/PRE_LAUNCH_CHECKLIST.md` shows no remaining hits after the docs update.
- `current.md` aligns with the real route (`POST /api/v1/tts/synthesize`, managed 402 fallback for Free, BYOK path).
- Changes are documentation-only for this PR.

## Acceptance Criteria

1. The two dated claims are reconciled with the current route.
2. Any historical browser-TTS claim outside the declared scope is replaced with a source reference or explicitly deferred.
3. Spec artifacts (`spec.md`, `plan.md`, `tasks.md`) exist in `specs/113-architecture-audit-reconcile/`.
4. PR evidence includes the exact grep command outputs (pre- and post-change) and file:line evidence.
