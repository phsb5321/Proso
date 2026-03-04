# Feature 075: UnoCSS Integration for Extension Styling

**Status**: Draft
**Created**: 2026-03-04
**Branch**: `075-unocss-integration`

---

## Problem Statement

Proso's browser extension has 4,146 lines of hand-written CSS across 5 files, using a design-token-driven architecture with BEM naming (`proso-` prefix). While the current architecture is functional and well-organized, it presents several developer experience and maintainability challenges:

1. **Verbose styling for common patterns** — Layout, spacing, and responsive adjustments require writing full CSS rules in separate files. Simple UI changes (padding, flex direction, gap) require context-switching between HTML and CSS files.

2. **Duplicated style definitions** — The popup (1,226 lines) and settings page (1,137 lines) contain many similar layout and spacing patterns that are independently authored. Common patterns like "flex column with gap" or "padded card with border" are redefined across files.

3. **Inline CSS duplication** — The content script injects ~2,000 characters of inline CSS via `injectContentStyles()`, duplicating rules already in `content.css`. The sticky footer contains ~8,000 characters of inline CSS in its `getStyles()` function that partially duplicates tokens and component patterns.

4. **No utility classes for rapid prototyping** — All styling requires authoring new BEM classes, even for one-off layout adjustments. This slows iteration on popup and settings page UI.

5. **Growing maintenance surface** — As features are added, the CSS files grow linearly. Without tree-shaking, unused styles from removed features persist in the bundle.

---

## User Scenarios & Testing

### Scenario 1: Developer Styles Popup UI Components

**Actor**: Extension developer

**Flow**:
1. Developer opens popup HTML template to add a new section
2. Developer applies utility classes directly in the HTML for layout and spacing
3. Developer uses existing design tokens (CSS custom properties) for colors and typography
4. Build system generates only the CSS actually used in the popup
5. Production bundle contains minimal CSS with no unused styles

**Acceptance Criteria**:
- Developers can style popup and settings page elements using utility classes without writing new CSS rules
- Utility classes reference the existing design token system (Proso color palette, spacing scale, typography)
- Only CSS for classes actually used in each entrypoint is included in the production build
- Build completes without errors and produces a valid Firefox extension

### Scenario 2: Developer Maintains Content Script Styles

**Actor**: Extension developer

**Flow**:
1. Developer modifies word-highlighting or paragraph-selection styles
2. Content script CSS remains hand-written with `!important` overrides for page isolation
3. Build system does not interfere with content script CSS injection
4. Highlighting styles continue to work at 60fps without framework overhead

**Acceptance Criteria**:
- Content script inline CSS injection (`injectContentStyles()`) is unaffected by the utility framework
- Word-highlighting classes (`.proso-w--active`, `.proso-w--glow`, etc.) remain hand-written CSS
- No runtime CSS generation occurs in the content script execution path
- 60fps word-by-word highlighting performance is maintained

### Scenario 3: Developer Updates Sticky Footer in Shadow DOM

**Actor**: Extension developer

**Flow**:
1. Developer modifies the sticky footer component's styles
2. Footer CSS remains scoped within Shadow DOM
3. Utility classes are available within the Shadow DOM scope if needed for future footer improvements
4. Footer continues to render correctly on all web pages without style leaking

**Acceptance Criteria**:
- Sticky footer Shadow DOM isolation is maintained
- Footer styles do not leak into host pages
- Host page styles do not affect footer rendering
- Footer functions correctly on both light and dark themed sites

### Scenario 4: Extension Build and Size Verification

**Actor**: CI system / Extension reviewer (Mozilla AMO)

**Flow**:
1. Extension is built for production
2. Build output is smaller than or equal to current bundle size
3. Extension passes Mozilla AMO automated review
4. Extension loads and functions correctly in Firefox

**Acceptance Criteria**:
- Total extension bundle size does not increase by more than 5 KB compared to current baseline
- Build time does not increase by more than 50% compared to current baseline
- Background service worker is excluded from CSS processing (no DOM)
- Extension passes `web-ext lint` validation
- All 2,300+ existing tests continue to pass

---

## Functional Requirements

### FR-001: Utility Class Framework for Extension Pages

The system must provide utility classes (spacing, layout, typography, colors) usable in popup and settings page HTML files. Utility classes must be generated at build time with zero runtime overhead.

### FR-002: Design Token Integration

The utility framework must reference the existing CSS custom property design token system defined in `tokens.css`. Custom colors (accent, success, warning, error), spacing scale, typography scale, and shadow values must be available as utility classes.

### FR-003: Per-Entrypoint CSS Tree-Shaking

Each extension entrypoint (popup, options, content script) must receive only the CSS for utility classes used within that entrypoint's source files. Unused utility classes must not appear in the production bundle.

### FR-004: Content Script CSS Isolation

The utility framework must not interfere with content script CSS injection. Content script highlighting styles (`.proso-highlight`, `.proso-w--*`, `.proso-selectable`, `.proso-play-icon`) must remain hand-written with `!important` declarations. No utility framework CSS should be injected into web pages.

### FR-005: Shadow DOM Compatibility

Utility classes must be available inside Shadow DOM components (sticky footer) if explicitly imported. The framework must not break Shadow DOM style encapsulation.

### FR-006: Background Script Exclusion

The background service worker must be excluded from all CSS processing. Background scripts have no DOM and CSS generation would be wasted build time.

### FR-007: Pixel-Based Units

All utility class output must use pixel units instead of rem units. Extension popups and content scripts operate in contexts where the root font size is unpredictable. A configuration must convert rem to px at build time.

### FR-008: Build System Compatibility

The framework must integrate with the existing WXT 0.20.13 + Vite 5.x build pipeline. Configuration must be achievable through `wxt.config.ts` and a standalone configuration file.

### FR-009: Gradual Adoption Path

The framework must coexist with existing hand-written CSS. Developers must be able to mix utility classes with existing BEM component classes (`.proso-button`, `.proso-card`, etc.) without conflicts. Existing CSS files must not require modification during initial integration.

### FR-010: CSS Directive Support

Developers must be able to use `@apply` directives within CSS files to compose utility classes into component classes. This enables gradual migration of existing BEM component definitions.

### FR-011: Icon System

The framework should provide a pure-CSS icon system that replaces inline SVGs with utility classes. Icons must render without JavaScript and support sizing and color customization through utility classes.

### FR-012: Developer Tooling

The framework should provide IDE autocomplete for utility classes. A VS Code / Cursor extension should be available that provides class name suggestions and hover documentation.

---

## Success Criteria

| ID | Criterion | Metric |
|----|-----------|--------|
| SC-001 | Developer styling velocity improves | Common layout changes achievable by editing HTML only, without creating new CSS rules |
| SC-002 | Production CSS bundle is smaller or comparable | Total CSS output per entrypoint does not increase by more than 5 KB |
| SC-003 | Build performance is acceptable | Production build time increases by no more than 50% (currently ~5 seconds) |
| SC-004 | Content script performance is unaffected | Word-by-word highlighting maintains 60fps rendering (no runtime CSS overhead) |
| SC-005 | Extension passes store review | Extension passes `web-ext lint` and can be submitted to Mozilla AMO |
| SC-006 | Existing tests pass | All 2,300+ unit tests pass without modification (excluding tests that directly assert CSS class names from refactored components) |
| SC-007 | Design token consistency | All utility-generated colors, spacing, and typography values match existing design tokens |
| SC-008 | Zero style leaking | Utility framework CSS is never injected into host web pages |

---

## Scope

### In Scope

- Installation and configuration of a build-time utility CSS framework with official WXT support
- Integration with the existing design token system (`tokens.css`)
- Configuration for popup and settings page entrypoints
- rem-to-px conversion for extension contexts
- Pure CSS icon system setup with relevant icon collections
- `@apply` directive support for gradual migration
- Developer tooling (IDE extension) documentation
- Build verification and size regression testing

### Out of Scope

- Full migration of existing BEM CSS to utility classes (gradual migration, not big-bang)
- Content script CSS refactoring (stays hand-written)
- Sticky footer CSS refactoring (stays inline in Shadow DOM)
- Runtime CSS-in-JS solutions
- React, Vue, or other framework adoption
- Component library adoption (shadcn, Radix, etc.)

---

## Dependencies

- **WXT 0.20.13**: Must remain compatible with current WXT version
- **Vite 5.x**: Must work with current Vite bundler version
- **Firefox 109+**: Must produce CSS compatible with minimum supported Firefox version
- **Biome**: Pre-commit hooks (biome + tsc) must pass with new configuration files
- **Existing design tokens**: `tokens.css` custom properties must remain the source of truth for theming

---

## Assumptions

1. **Build-time only**: The utility framework operates entirely at build time. Zero JavaScript is added to the extension runtime for CSS generation.
2. **Popup and settings pages are primary targets**: These are the pages that benefit most from utility classes. Content scripts and Shadow DOM components continue using their current approach.
3. **Existing CSS remains**: All current CSS files (`tokens.css`, `components.css`, `content.css`, `popup/style.css`, `options/options.css`) remain in place. UnoCSS augments rather than replaces.
4. **Incremental migration**: Teams may optionally convert existing BEM classes to utility classes over time, but this is not required for the initial integration.
5. **No CSS reset for content scripts**: CSS resets are only applied within popup and settings page contexts, never in content scripts.
6. **Known limitation**: Shadow DOM content scripts using `createShadowRootUi` with `cssInjectionMode: 'ui'` have a known WXT issue (#1125) with utility CSS injection. The integration should document this limitation and provide a workaround path.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Utility CSS increases bundle size beyond threshold | Low | Medium | Per-entrypoint tree-shaking ensures only used CSS is emitted; measure before/after |
| Build time regression from CSS scanning | Low | Low | UnoCSS is significantly faster than PostCSS-based alternatives; benchmark |
| Content script CSS interference | Medium | High | Exclude content scripts from utility processing; keep inline injection unchanged |
| Shadow DOM style injection failure | Medium | Medium | Document known WXT issue #1125; keep footer using manual `getStyles()` approach |
| IDE autocomplete not working in HTML files | Low | Low | Provide configuration guide for VS Code UnoCSS extension |
| Design token mapping drift | Medium | Medium | Create contract tests verifying utility colors match token values |
| Biome/lefthook conflicts with new config files | Low | Low | Verify `uno.config.ts` passes biome and tsc checks before commit |

---

## Key Entities

### Configuration File (`uno.config.ts`)

- **Presets**: List of enabled utility presets (wind3, icons, rem-to-px)
- **Theme overrides**: Mapping of Proso design tokens to utility class values
- **Shortcuts**: Named utility class compositions for common patterns
- **Safelist**: Dynamically-generated class names that must always be included
- **Transformers**: Enabled CSS directives (@apply, variant grouping)

### Entrypoint CSS Bundles

- **Popup bundle**: Utility CSS + existing popup styles, tree-shaken per popup source files
- **Settings bundle**: Utility CSS + existing settings styles, tree-shaken per settings source files
- **Content script bundle**: No utility CSS; remains hand-written inline injection
- **Background bundle**: Excluded from all CSS processing
