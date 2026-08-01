# Phase 0 Research: Extension Quality Sprint

**Feature**: 063-extension-quality-sprint
**Date**: 2026-02-09

## Research Questions

### RQ-1: What runtime message validation exists and where are the gaps?

**Decision**: Add Zod validation schemas to all handler parameter processing.

**Rationale**: Only `src/utils/content/sticky-footer.ts` uses Zod validation. All 18 handler files in `src/handlers/` accept `unknown` params and cast without runtime validation. The popup's `sendMessage<T>()` uses `response as T` (blind type assertion). This means malformed messages silently cause runtime type errors.

**Alternatives Rejected**:
- *Do nothing*: Unvalidated payloads are the #1 source of silent failures per spec research.
- *TypeScript-only guards*: Erased at runtime; doesn't protect against actual message corruption.

**Key Files**:
- `src/handlers/settings.handlers.ts`: Defines `UpdateSettingsParams` interface but NO runtime validation
- `src/handlers/cache.handlers.ts`: Typed `CacheStatsResponse` but no Zod parsing
- `src/handlers/registry.ts`: `dispatch()` passes `unknown` params straight through
- `src/entrypoints/popup/main.ts`: `sendMessage<T>()` uses `response as T`

---

### RQ-2: Which TTS providers exist in legacy code and what's needed to wire them hexagonally?

**Decision**: Create `IAudioGenerator` adapters for OpenAI, Groq, and Cartesia by wrapping existing legacy providers.

**Rationale**: `ProviderId` in `src/core/shared/errors.ts` only allows `'elevenlabs' | 'browser'`. The factory in `src/composition/factories.ts` only handles these two cases. Yet the legacy codebase has provider implementations in `src/utils/providers/` (with `BaseTTSProvider` abstract class) and `src/background/providers/`. The popup UI references 5+ providers. Users selecting OpenAI, Groq, or Cartesia hit "Unknown audio provider" error.

**Alternatives Rejected**:
- *Rewrite providers from scratch*: Existing legacy code is functional; adapter pattern wraps it cleanly.
- *Keep only 2 providers*: Blocks users who pay for OpenAI/Groq/Cartesia services.

**Key Files**:
- `src/core/shared/errors.ts:13` — `ProviderId = 'elevenlabs' | 'browser'`
- `src/utils/config/schema.ts:24` — `PROVIDERS = ['elevenlabs', 'browser'] as const`
- `src/composition/factories.ts:44-61` — `createAudioGeneratorAdapter()` switch with only 2 cases
- `src/composition/factories.ts:152-159` — `getApiKeyForProvider()` only returns elevenlabs key
- `src/utils/providers/base.ts` — `ITTSProvider` interface + `BaseTTSProvider` abstract class
- `src/adapters/audio/elevenlabs-audio.adapter.ts` — Reference adapter pattern
- `src/adapters/audio/browser-tts-audio.adapter.ts` — Reference adapter pattern

---

### RQ-3: What accessibility gaps exist in the current UI?

**Decision**: Add `prefers-reduced-motion` media queries, ARIA live regions, and keyboard navigation improvements.

**Rationale**:
- No `prefers-reduced-motion` in popup CSS or options CSS (only partial coverage in `src/styles/components.css:1020`)
- Options CSS has `save-pulse` animation without reduced-motion guard
- `settings.html` has 12 aria attributes but missing `aria-live` regions for dynamic content
- No evidence of modifier-key keyboard shortcuts (WCAG 2.1.4 compliance gap)

**Alternatives Rejected**:
- *WCAG AAA compliance*: AAA is aspirational, not practical for this extension type. AA is the appropriate target.
- *Remove all animations*: Animations aid usability; reduced-motion should suppress them conditionally.

**Key Files**:
- `src/entrypoints/popup/` — Popup CSS (no reduced-motion queries)
- `src/entrypoints/options/` — Options CSS with unguarded animations
- `src/styles/components.css:1020` — Partial `animation: none !important` rule
- `src/entrypoints/settings.html` — 12 aria attributes, missing live regions

---

### RQ-4: What are the current test coverage thresholds and linting gaps?

**Decision**: Raise coverage thresholds to 60% statements / 50% branches. Enable `noUnusedVariables` and `noExplicitAny` at warning level in Biome.

**Rationale**: Current jest thresholds are 25% statements, 20% branches, 25% functions, 25% lines. Industry standard for production extensions is 60-80%. Biome has `noUnusedVariables: "off"` and `noExplicitAny: "off"` — these catch real bugs that currently slip through. 2,405 tests currently pass, so there's a solid foundation to build on.

**Alternatives Rejected**:
- *80% coverage immediately*: Too aggressive a jump from 25%; 60% is a realistic stepping stone.
- *Error level for linting*: Warning level allows incremental cleanup without blocking builds.

**Key Files**:
- `jest.config.js` — `coverageThreshold: { global: { statements: 25, branches: 20, functions: 25, lines: 25 } }`
- `biome.json:16` — `noUnusedVariables: "off"`
- `biome.json:21` — `noExplicitAny: "off"`

---

### RQ-5: What legacy code and architectural cleanup is needed?

**Decision**: Standardize message naming to dot-notation, move straggling handlers to `src/handlers/`, remove dead code.

**Rationale**:
- Content script uses SCREAMING_SNAKE (`FOOTER_SHOW`, `FOOTER_HIDE`, `FOOTER_STATE_UPDATE`) while handlers use dot-notation (`footer.show`, `footer.stateUpdate`). This creates confusion and handler-name mismatches.
- `src/utils/messaging/handlers/` still has export, queue, settings, and cache handler files that duplicate or shadow `src/handlers/` equivalents.
- Content script (`src/entrypoints/content.ts`) has TODO markers at lines 543, 764, 1061 for legacy code removal.
- Export polling has no timeout, risking indefinite resource consumption.

**Alternatives Rejected**:
- *Keep both naming conventions*: Increases cognitive load and mismatch risk.
- *Remove legacy handlers immediately*: Need bridge mappings first for backward compatibility during migration.

**Key Files**:
- `src/entrypoints/content.ts` — 1600+ lines, mixes SCREAMING_SNAKE and dot-notation
- `src/utils/messaging/handlers/export.ts` — Straggling handler outside `src/handlers/`
- `src/utils/messaging/handlers/queue.ts` — Straggling handler outside `src/handlers/`
- `src/utils/messaging/handlers/settings.ts` — Straggling handler outside `src/handlers/`
- `src/utils/messaging/handlers/cache-handlers.ts` — Straggling handler outside `src/handlers/`
- `src/entrypoints/background.ts` — `dispatchMessage()` strangler fig with legacy fallback

---

### RQ-6: What security issues exist in provider code?

**Decision**: Remove API key metadata logging and add production build guards.

**Rationale**: ElevenLabs provider logs API key length and prefix for debugging. While `wxt.config.ts` drops `console.*` in production builds, this is defense-in-depth — the logging should not exist in the source either.

**Key Files**:
- `src/utils/providers/elevenlabs.ts` — API key length/prefix logging
- `wxt.config.ts` — `esbuild.drop: ['console', 'debugger']` in production

---

## External Research Summary

### Firefox Extension Best Practices (2025-2026)
- Manifest V3 service worker lifecycle: ensure handlers re-register on wake
- Content Security Policy tightening in Firefox 130+
- IndexedDB preferred over `browser.storage.local` for large data (>5MB)

### OpenAI TTS API Updates
- `gpt-4o-mini-tts` model available with streaming, supports all languages
- `tts-1` and `tts-1-hd` models still available
- Voice options: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer

### ElevenLabs API Updates
- Turbo v2.5 model with lower latency
- 29+ languages supported with `language_code` parameter
- Streaming endpoints for real-time audio

### Accessibility Standards
- WCAG 2.1 AA is the standard target for assistive technology tools
- `aria-live="polite"` for non-critical updates, `"assertive"` for errors
- `prefers-reduced-motion: reduce` should disable all non-essential animations
- Single-character shortcuts must have modifier keys (WCAG 2.1.4)

### Competitor Feature Analysis (Speechify, NaturalReader)
- Multi-voice support with language auto-detection
- Export to MP3/WAV with progress indication
- Reading queue for multiple pages
- Speed control with fine-grained increments (0.5x to 4x)
