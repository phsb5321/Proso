# Implementation Plan: UnoCSS Integration for Extension Styling

**Branch**: `075-unocss-integration` | **Date**: 2026-03-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/075-unocss-integration/spec.md`

## Summary

Integrate UnoCSS as a build-time utility CSS framework into the Proso Firefox extension's WXT + Vite pipeline. UnoCSS will provide utility classes for the popup and settings page entrypoints, reference the existing `tokens.css` design token system, and enable per-entrypoint tree-shaking. Content scripts and Shadow DOM components remain hand-written. The integration adds zero runtime overhead and must not increase bundle size by more than 5 KB per entrypoint.

## Technical Context

**Language/Version**: TypeScript 5.9.3, ES2020 build target
**Primary Dependencies**: WXT ^0.20.13, Vite ^5.4.21, UnoCSS (to be added), Biome 1.9.4
**Storage**: N/A (build-time tooling only — no runtime storage changes)
**Testing**: Jest 29.x (unit/contract/integration/security/regression), Playwright (e2e/visual)
**Target Platform**: Firefox 109+ (Manifest V3, gecko event pages), extension popup + options page
**Project Type**: Browser extension (monorepo package: `packages/extension`)
**Performance Goals**: Build time increase ≤50% (~5s baseline); 60fps content script highlighting unaffected; zero runtime CSS generation
**Constraints**: Bundle size increase ≤5 KB per entrypoint; must pass `web-ext lint`; must pass AMO review; no CSS injected into host web pages; pixel units only (no rem)
**Scale/Scope**: 4,146 lines existing CSS across 5 files; 2 target entrypoints (popup, options); ~2,300 existing tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Privacy First — PASS

UnoCSS is build-time only. No data is transmitted, collected, or stored at runtime. No new network requests. No telemetry from UnoCSS. The integration does not touch user data or API keys.

### II. Security by Default — PASS

No new external API requests. No changes to CSP (UnoCSS generates static CSS at build time, no inline `<style>` injection at runtime for extension pages). Content script CSS injection path remains unchanged. No new permissions required in manifest.json.

### III. User Experience Excellence — PASS

No user-facing behavior changes. Utility classes improve developer velocity for future UI changes, indirectly benefiting UX through faster iteration. Existing UI remains pixel-identical.

### IV. Modular Architecture — PASS

UnoCSS configuration is a standalone file (`uno.config.ts`) with clear separation from WXT config. Design token mapping is centralized. The framework augments existing CSS without requiring modifications to current files. Provider pattern is not affected.

### V. Test Coverage for Critical Paths — PASS

All 2,300+ existing tests must continue to pass. Build verification and size regression testing are specified as success criteria. Contract tests for design token consistency are recommended in the spec.

### Security Constraints — PASS

- No changes to API key handling
- No new external requests or host_permissions
- Content script isolation maintained (UnoCSS excluded from content scripts)
- No innerHTML or unsafe DOM manipulation introduced

### Development Workflow — PASS

- `web-ext lint` must pass (success criterion)
- Biome + tsc pre-commit hooks must pass with new `uno.config.ts`
- No new permissions needed

**GATE RESULT: ALL CHECKS PASS — proceed to Phase 0**

## Project Structure

### Documentation (this feature)

```text
specs/075-unocss-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/extension/
├── uno.config.ts                    # NEW: UnoCSS configuration (theme, presets, shortcuts)
├── wxt.config.ts                    # MODIFIED: Register @wxt-dev/unocss module
├── package.json                     # MODIFIED: Add UnoCSS dependencies
├── src/
│   ├── styles/
│   │   ├── tokens.css               # UNCHANGED: Design token source of truth
│   │   └── components.css           # UNCHANGED: BEM component library
│   ├── entrypoints/
│   │   ├── popup/
│   │   │   ├── index.html           # Target for utility classes
│   │   │   ├── main.ts              # May add `import 'virtual:uno.css'`
│   │   │   └── style.css            # UNCHANGED initially (gradual migration)
│   │   ├── options/
│   │   │   ├── main.ts              # May add `import 'virtual:uno.css'`
│   │   │   └── options.css          # UNCHANGED initially (gradual migration)
│   │   ├── settings.html            # Target for utility classes
│   │   ├── content.ts               # EXCLUDED from UnoCSS processing
│   │   └── background.ts            # EXCLUDED from UnoCSS processing
│   └── ...
└── tests/
    ├── unit/                        # Existing tests (must pass)
    ├── contract/                    # Existing + new token contract tests
    └── integration/                 # Existing tests (must pass)
```

**Structure Decision**: This feature modifies the existing `packages/extension` package only. No new packages or directories beyond the UnoCSS config file and potential contract test files. The monorepo structure (extension/server/shared) is unchanged.

## Post-Design Constitution Re-check

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Evidence |
|---|---|---|
| I. Privacy First | PASS | Build-time only. Content script excluded. No runtime data collection. `var()` references — no external requests. |
| II. Security by Default | PASS | Static CSS output. No inline styles or `eval()`. Icons use data URI masks (CSP-safe). No new permissions. Content script exclusion prevents host page injection. |
| III. User Experience Excellence | PASS | No user-facing changes. `presetRemToPx` ensures consistent sizing. Dark/light theming works via `var()` token references. |
| IV. Modular Architecture | PASS | Standalone `uno.config.ts`. Single-line WXT module registration. Existing `vite()` function untouched. Clean separation: tokens.css → uno.config.ts → wxt.config.ts. |
| V. Test Coverage | PASS | All 2,300+ tests must pass. Token consistency contract defined. Bundle size contract with 5 KB threshold. `web-ext lint` validation required. |

**POST-DESIGN GATE RESULT: ALL CHECKS PASS**

## Complexity Tracking

> No constitution violations detected. No complexity justification needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
