# VoxPage Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-09

## Active Technologies
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13 (build framework), Zod (schema validation), PDF.js (bundled with Firefox) (041-firefox-first-pivot)
- IndexedDB (audio cache), browser.storage.local (settings), browser.storage.session (transient state) (041-firefox-first-pivot)
- Playwright (E2E testing), esbuild (build-time code stripping) (039-extension-debug-testing)
- Rust 1.75+ (backend), TypeScript 5.x (frontend) + Tauri 2.x, PDF.js v5.4.x, Rust `tts` crate v0.26 (044-tauri-pdf-reader)
- SQLite via `tauri-plugin-sql` (highlights, library, settings) (044-tauri-pdf-reader)
- TypeScript 5.x (strict mode: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`) + WXT 0.20.x (build framework), Zod (schema validation), browser.storage API (050-groq-tts-provider)
- browser.storage.local (settings, API keys), IndexedDB (audio cache) (050-groq-tts-provider)
- IndexedDB (audio cache), browser.storage.local (settings, API keys) (050-groq-tts-provider)

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
- 050-groq-tts-provider: Added TypeScript 5.x (strict mode: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`) + WXT 0.20.x (build framework), Zod (schema validation), browser.storage API
- 050-groq-tts-provider: Added TypeScript 5.x (strict mode: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`) + WXT 0.20.x (build framework), Zod (schema validation), browser.storage API
- 044-tauri-pdf-reader: Added Rust 1.75+ (backend), TypeScript 5.x (frontend) + Tauri 2.x, PDF.js v5.4.x, Rust `tts` crate v0.26

## Firefox-First Guidelines

VoxPage is developed Firefox-first. Key architectural decisions:

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
