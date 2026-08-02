# Implementation Plan: TTS boundary hardening

**Branch**: `096-tts-boundary-hardening` | **Date**: 02/08/2026 | **Spec**: [spec.md](spec.md)

## Summary

Reuse the existing `ApiClientError` and `AudioError` boundaries. Add one narrow
`payment_required` audio error, map only HTTP 402 to it, preserve its message at
the handler, correct the server's obsolete browser-TTS remedy, and attach the
already-installed Nest throttler to the dynamic voices route.

## Technical context

- **Language/Version**: TypeScript 5.9.3, Node.js 22 on the current host
- **Primary dependencies**: existing WXT/Jest extension stack and NestJS
  `@nestjs/throttler`
- **Storage**: N/A
- **Testing**: Jest unit tests plus the tracked Make delivery harness
- **Target platform**: Firefox WebExtension and Proso NestJS API
- **Project type**: monorepo, extension plus API boundary
- **Constraints**: no new dependency; no framework import in extension core;
  no pricing/entitlement change; no source upload

## Constitution check

- **Privacy First**: PASS. No destination, payload, credential, or retention
  behavior changes.
- **Security by Default**: PASS. The dynamic provider-backed route gains a
  finite anonymous-call limit; no secret enters logs or responses.
- **User Experience Excellence**: PASS with a known product gate. The refusal
  becomes accurate and actionable, but this slice does not make Free-tier
  reading available.
- **Modular Architecture**: PASS. Core declares a pure discriminated union;
  adapters translate HTTP errors; handlers translate domain errors to message
responses; Nest decorators remain at the controller boundary.
- **Critical-path testing**: PASS when RED/GREEN evidence covers the adapter,
  handler, visible popup failure state, server copy, and HTTP-observed throttle
  behavior. Reflection remains a wiring regression, not the product oracle.

## Project structure

```text
specs/096-tts-boundary-hardening/
├── analysis.md
├── plan.md
├── spec.md
└── tasks.md

packages/extension/src/core/shared/errors.ts
packages/extension/src/adapters/audio/server-tts-audio.adapter.ts
packages/extension/src/handlers/audio.handlers.ts
packages/extension/src/entrypoints/popup/playback-failure.ts
packages/extension/tests/unit/
packages/server/src/core/tts/tts.service.ts
packages/server/src/infrastructure/controllers/tts.controller.ts
packages/server/tests/unit/
```

**Structure decision**: change the existing shared error and boundary mappings;
extract only the popup's existing two-line failure-state update so the public
DOM outcome can be tested without importing the side-effectful entrypoint. Do
not add a service or dependency.

## Delivery order

1. Add outcome-level regression assertions.
2. Temporarily remove each staged implementation branch from the worktree while
   retaining it in the index, and capture the expected RED results.
3. Restore/refine the minimum implementation and reach GREEN.
4. Run focused suites, type/lint/build gates, deterministic full verification,
   and a different-family review.
5. Update status documents without overstating Free-tier or browser evidence.

## Rollback

One revert PR for the eventual squash commit restores the previous error
classification, message, and voices-route metadata.
