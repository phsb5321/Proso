# Proso Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-09

## Active Technologies
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13 (build framework), Zod (schema validation), PDF.js (bundled with Firefox) (041-firefox-first-pivot)
- IndexedDB (audio cache), browser.storage.local (settings), browser.storage.session (transient state) (041-firefox-first-pivot)
- Playwright (E2E testing), esbuild (build-time code stripping) (039-extension-debug-testing)
- Rust 1.75+ (backend), TypeScript 5.x (frontend) + Tauri 2.x, PDF.js v5.4.x, Rust `tts` crate v0.26 (044-tauri-pdf-reader)
- SQLite via `tauri-plugin-sql` (highlights, library, settings) (044-tauri-pdf-reader)
- TypeScript 5.9.3 (strict mode: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`) + WXT 0.20.13 (build framework), Zod 3.25.76 (validation), Dexie 4.2.1 (IndexedDB), @webext-core/messaging 2.3.0, franc-min 6.2.0 (language detection), lamejs 1.2.1 (MP3 encoding) (056-production-readiness-sprint)
- IndexedDB via Dexie (audio cache, highlights), browser.storage.local (settings, provider config) (056-production-readiness-sprint)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, franc-min 6.2.0, Dexie 4.2.1, Jest 29.x, Biome (linter) (063-extension-quality-sprint)
- IndexedDB (audio cache via Dexie), browser.storage.local (settings) (063-extension-quality-sprint)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes): Follow standard conventions

## Recent Changes
- 063-extension-quality-sprint: Added TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, franc-min 6.2.0, Dexie 4.2.1, Jest 29.x, Biome (linter)
- 063-extension-quality-sprint: Added TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, franc-min 6.2.0, Dexie 4.2.1, Jest 29.x, Biome (linter)
- 063-extension-quality-sprint: Added TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, franc-min 6.2.0, Dexie 4.2.1, Jest 29.x, Biome (linter)

## Firefox-First Guidelines

Proso is developed Firefox-first. Key architectural decisions:

1. **Background scripts use event pages** (not service workers) - DOM access available
2. **Native `Audio` API** in background scripts - no offscreen documents needed
3. **Native `speechSynthesis`** for Browser TTS - direct API access
4. **Data URLs for audio** - service worker compatible pattern
5. **Minimum Firefox version**: 112.0 (see `manifest.json` gecko settings)

### Firefox Manual Validation

Before releases, run the manual validation checklist:
- Quick checklist: `docs/firefox-manual-validation.md`
- Comprehensive checklist: `specs/041-firefox-first-pivot/manual-validation.md`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
