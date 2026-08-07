# Implementation Plan: PROSO-79 documentation reconcile

**Branch**: `113-architecture-audit-reconcile` | **Date**: 06/08/2026
**Spec**: [spec.md](./spec.md)

## Approach

1. Verify current drift claims with search commands.
2. Update architecture docs with minimal substitutions that keep their intent while removing stale browser-TTS references.
3. Re-run grep command to prove the scoped claim class is clean.
4. Add spec artifacts to satisfy the repo rule that feature work ships with `specs/NNN-slug/`.

## Sequence

- **Phase 0 — Evidence receipt:** run the scoped grep against existing docs and capture output.
- **Phase 1 — Documentation edits:** patch `docs/architecture/current.md` and `docs/architecture/proposed.md` only.
- **Phase 2 — Scope validation:** re-run grep and capture zero-hit output.
- **Phase 3 — Closeout evidence:** collect file-level evidence and mark testing strategy doc as flag-only.

## Validation

- Re-run the mandated grep against `docs/architecture` and `docs/PRE_LAUNCH_CHECKLIST.md`.
- Capture route evidence lines from code (`ProsoApiAdapter.synthesize`, `TTSController.synthesizeAudio`, `tts.service` entitlement checks).
