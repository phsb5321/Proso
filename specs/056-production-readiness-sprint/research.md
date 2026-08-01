# Research: Production Readiness Sprint

**Branch**: `056-production-readiness-sprint` | **Date**: 2026-02-06

## RQ-1: How to move the hardcoded telemetry gateway token to runtime configuration

### Current State

The token `5Q0LlZ+6fcJ0wAPsSXtJzaf2rfd64fN6vUx84wWlzwY=` is hardcoded as a fallback in 3 files:

| File | Line | Pattern |
|------|------|---------|
| `src/entrypoints/background.ts` | 2072 | `(result.telemetryGatewayToken as string) \|\| '<token>'` |
| `src/entrypoints/popup/main.ts` | 1350 | `(stored.telemetryGatewayToken as string) \|\| '<token>'` |
| `src/entrypoints/options/controller.ts` | 1694 | `(stored.telemetryGatewayToken as string) \|\| '<token>'` |

The gateway URL `https://voxpage-logs.home301server.com.br/ingest` is also hardcoded alongside it in each file.

**Notable**: `src/entrypoints/content.ts` (line 816-821) does NOT hardcode a fallback -- it reads from `browser.storage.local` and silently skips telemetry if either `gatewayUrl` or `gatewayToken` is missing. This is the correct pattern.

The token authenticates the extension against the VoxPage Log Gateway as a Bearer token in the HTTP `Authorization` header. It is a shared static secret (not per-user).

### Recommended Approach: Hybrid (build-time inject + storage seeding)

1. **Add Vite `define` in `wxt.config.ts`**:
   ```typescript
   vite: () => ({
     define: {
       __TELEMETRY_GATEWAY_URL__: JSON.stringify(
         process.env.TELEMETRY_GATEWAY_URL || 'https://voxpage-logs.home301server.com.br/ingest'
       ),
       __TELEMETRY_GATEWAY_TOKEN__: JSON.stringify(
         process.env.TELEMETRY_GATEWAY_TOKEN || ''
       ),
     },
     // ... existing config
   })
   ```

2. **In `background.ts` `runtime.onInstalled`**, seed `browser.storage.local` with the build-time values (only if not already set).

3. **In all 3 entrypoints**, remove the hardcoded fallback and adopt the `content.ts` pattern -- read from storage, skip if not set.

4. **Add `.env.example`** and `.env` to `.gitignore`.

Benefits: Token removed from source code; single seeding point; consistent pattern across all entrypoints; overridable at runtime for testing (E2E tests already set these storage keys); CI/CD just sets the env var.

---

## RQ-2: Browser TTS (Web Speech API) as a fallback provider

### Current State

**Existing ad-hoc implementation**: `src/entrypoints/content.ts` (lines 1384-1435) has a basic `speechSynthesis` integration that handles `speakText` and `stopSpeech` messages. It runs in the content script, bypasses the hexagonal architecture, has no caching, no word timing, and no provider registration.

**Code that anticipates `'browser'` provider**: ~10 files reference `provider: 'browser'` (defaults, settings handlers, tests, init-hexagonal.ts), but the type system does NOT include it:

| File | Definition |
|------|-----------|
| `src/core/shared/errors.ts` | `type ProviderId = 'elevenlabs'` -- missing `'browser'` |
| `src/utils/config/schema.ts` | `PROVIDERS = ['elevenlabs'] as const` -- missing `'browser'` |
| `src/utils/messaging/schemas.ts` | `providerIdSchema = z.enum(['elevenlabs'])` -- missing `'browser'` |

**No `BrowserTtsAudioAdapter` exists.** The factory in `src/composition/factories.ts` only handles `'elevenlabs'`.

### Key Architectural Tension

The `IAudioGenerator` port returns `AudioResponse` with an `audioBlob: Blob`. But `speechSynthesis` speaks text directly -- it does not produce audio data. Options:

1. **Branch in PlaybackService** (pragmatic): Detect `provider === 'browser'` and delegate to `speechSynthesis` directly for playback, while still using `IAudioGenerator` for voice listing and credential validation.
2. **Second port interface** (`ISpeechProvider`): Adds abstraction complexity.
3. **Record via MediaRecorder** (fragile): Convert speech output to blob via AudioContext capture.

**Recommended**: Option 1 (branch in PlaybackService). The adapter implements `IAudioGenerator` for metadata operations (voice listing, validation returns `true` always) and sets `supportsWordTiming: false`. Playback uses `speechSynthesis` directly from the background event page (Firefox has DOM access).

### What Needs to Be Built

1. **Type system updates** (3 files): Add `'browser'` to `ProviderId`, `PROVIDERS`, `providerIdSchema`
2. **New adapter**: `src/adapters/audio/browser-tts-audio.adapter.ts` implementing `IAudioGenerator`
3. **Factory update**: `src/composition/factories.ts` -- add `case 'browser'`
4. **Provider metadata**: `src/handlers/provider.handlers.ts` -- add `'browser'` to `PROVIDER_METADATA`
5. **Fallback logic**: Auto-select Browser TTS when no ElevenLabs API key is configured
6. **Remove content script ad-hoc code**: Lines 1384-1435 in `content.ts`

---

## RQ-3: Strangler Fig hexagonal migration completion strategy

### Current Migration Status

The migration uses feature flags in `background.ts` (`MIGRATION_FLAGS`):

| Domain | Hexagonal Handlers | Flag | Status |
|--------|-------------------|------|--------|
| Playback | 10 handlers | `USE_LEGACY_PLAYBACK: true` | **ONLY domain still legacy** |
| Audio | 4 handlers | `USE_LEGACY_AUDIO: false` | Hexagonal |
| Settings | 5 handlers | `USE_LEGACY_SETTINGS: false` | Hexagonal |
| Cache | 7 handlers | `USE_LEGACY_CACHE: false` | Hexagonal |
| Queue | 11 handlers | `USE_LEGACY_QUEUE: false` | Hexagonal |
| Provider | 3 handlers | `USE_LEGACY_AUDIO: false` | Hexagonal |
| Prefetch | 4 handlers | `USE_LEGACY_CACHE: false` | Hexagonal |
| Footer | 6 handlers | `USE_LEGACY_SETTINGS: false` | Hexagonal |
| Content | 4 handlers | N/A | Hexagonal |
| Debug | 5 handlers | N/A | Hexagonal |
| Reader | 6 handlers | N/A | Hexagonal |
| Highlight | 6 handlers | N/A | Hexagonal |

**Total: ~71 hexagonal handlers registered. Only playback is forced legacy.**

### The ~35 Stubs in `src/utils/messaging/handlers/`

These are an **older layer** from when the protocol was first designed. Most are stubs with `// TODO Phase 4` returning hardcoded responses. However, some files contain **real implementations** that are still actively used:

- **Stubs (can delete)**: `playback.ts` (8), `audio.ts` (4), `provider.ts` (3), `content.ts` (3), `highlight.ts` (4), `language.ts` (4), `footer.ts` (5), `logging.ts` (3) = ~34 stubs
- **Real implementations (preserve/migrate)**: `cache-handlers.ts` (10), `queue.ts` (11), `export.ts` (4), `summarize.ts` (3), parts of `settings.ts` (3)

### Missing Hexagonal Handlers

These message types have NO handlers in `src/handlers/`:
- `export.*` (4 types) -- real implementations in legacy stubs
- `summarize.*` (3 types) -- real implementations in legacy stubs
- `language.*` (4 types) -- stubs only
- `logging.*` (3 types) -- stubs only
- `settings.getTheme/setTheme/resetSection` (3 types) -- real implementations in legacy stubs

### Recommended Migration Strategy

**Wave 1 -- Low Risk** (move existing implementations to hexagonal handlers):
1. `settings.getTheme/setTheme/resetSection` → Add to `settings.handlers.ts`
2. `export.*` → Create `export.handlers.ts` wrapping existing logic
3. `summarize.*` → Create `summarize.handlers.ts` wrapping existing logic
4. Delete pure stubs for fully-hexagonal domains

**Wave 2 -- Medium Risk** (implement from scratch):
5. `language.*` → Create `language.handlers.ts` with real language detection
6. `logging.*` → Create `logging.handlers.ts` with real structured logging

**Wave 3 -- High Risk** (the final boss):
7. **Playback migration** -- Connect `PlaybackService` to actual `HTMLAudioElement` playback, migrate `speakCurrentParagraph` orchestration (~1500 lines), blob URL management, word timing, prefetch integration, content script footer updates. This is the last step to reduce `background.ts` from 2,371 lines to <500 lines.

---

## RQ-4: Enforcing Jest coverage thresholds in CI

### Current State

**Jest thresholds are defined** in `jest.config.js` (lines 85-92):
```js
coverageThreshold: {
  global: {
    statements: 70,
    branches: 60,
    functions: 70,
    lines: 70
  }
}
```

**But never evaluated in CI** because:
- `ci.yml` runs `pnpm run test:unit` (no `--coverage` flag)
- `test.yml` runs `pnpm run test:unit` (no `--coverage` flag)
- Codecov upload in `test.yml` has `fail_ci_if_error: false`
- No `codecov.yml` exists for project/patch targets

### Recommended Fix

**Primary (Jest built-in enforcement)**:

Add `--coverage` to test commands in both CI workflows:
```yaml
# In ci.yml and test.yml:
- name: Unit Tests
  run: pnpm run test:unit -- --coverage
```

Jest exits non-zero when thresholds are missed. This is the highest-impact, lowest-effort change.

**Secondary (Codecov PR-level protection)**:

1. Change `fail_ci_if_error` to `true` in `test.yml`
2. Create `codecov.yml` with project target (70%) and patch target (80%)
3. Enable Codecov status checks in GitHub branch protection rules

---

## RQ-5: Handling obsolete specs

### Current State

- 55 specs in `specs/`, no existing archive convention
- 2 local branches exist for obsolete specs: `024-settings-page-redesign`, `044-tauri-pdf-reader`
- No `.specify/` tooling for archiving
- 3 obsolete specs (`018`, `022`, `023`) are referenced in source code comments (attribution, not functional)
- `CLAUDE.md` and `AGENTS.md` reference several obsolete specs

### Recommendation: Move to `specs/_archived/`

1. `mkdir specs/_archived`
2. `git mv` all 10 obsolete spec directories to `specs/_archived/`
3. Add a one-line `specs/_archived/README.md` explaining the convention
4. Update `AGENTS.md` and `CLAUDE.md` to remove/note obsolete spec references
5. Source code comments referencing `018`, `022`, `023` can remain as historical attribution
6. Delete local branches `024-settings-page-redesign` and `044-tauri-pdf-reader`

**Rationale**: Preserves discoverability (vs. delete), `_` prefix sorts to top of listing, negligible size (~1 MB across 80 files), git history preserved regardless.

---

## RQ-6: Firefox-first vs Cross-Browser constitution tension

### What the Constitution Says

Principle I (lines 5-8): "VoxPage targets Manifest V3 as the primary architecture, with Chrome and Firefox as **equal first-class platforms**."

Amendment history: "Changed from 'Firefox-First' on 2026-01-13 (feature 045-pdf-removal-page-reader)."

Technology stack mandates: Chrome 88+ (MV3 service workers) + Firefox 112+ (MV3 or MV2 event pages), E2E testing on both, offscreen documents for Chrome audio.

### What the Codebase Does

| Area | Constitution | Codebase |
|------|-------------|----------|
| Build target | Both equal | `wxt.config.ts`: `browser: "firefox"` hardcoded |
| AGENTS.md | Not updated | "VoxPage is developed Firefox-first" |
| CI (ci.yml) | E2E both | Firefox only (build, manifest, visual, E2E) |
| CI (test.yml) | E2E both | Firefox only (except one extension-e2e Chrome job) |
| Release (release.yml) | Both | Matrix `[firefox, chrome]` -- **does build both** |
| Audio playback | Offscreen (Chrome) + Direct (Firefox) | `new Audio()` directly everywhere (Firefox-only) |
| Offscreen code | Wired for Chrome | Exists (782 lines) but **never imported or instantiated** |

### Recommended Decision: Amend to "Firefox-first, Chrome-ready architecture"

**Option 3 (two-phase approach)**:

1. Amend constitution Principle I to: "Firefox-first development with Chrome-ready architecture. Firefox is the primary platform. Chrome compatibility is maintained via adapter interfaces and will become first-class when the Chrome adapter test suite is complete."
2. Update `AGENTS.md` to reflect the same
3. Add a `build:chrome` smoke-test step to `ci.yml` (build succeeds, no runtime tests)
4. File a tracked issue for "Chrome first-class: wire OffscreenAudioAdapter, add Chrome E2E"

**Rationale**: The constitution should describe enforceable invariants, not aspirations. The hexagonal architecture is sound (ports, adapters, offscreen code exists). The gap is validation, not architecture. Claiming "equal first-class" when Chrome has zero runtime test coverage creates a false sense of quality.
