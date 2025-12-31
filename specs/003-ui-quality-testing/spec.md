# Feature Specification: UI Quality & Testing Infrastructure

**Feature Branch**: `003-ui-quality-testing`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "Web search for the best practices for UI implementation and testing. Currently the UI is all over the place. I do not like this purple color, there are icons floating above other stuff. The styles are off. I need you to web search how to improve this kind of stuff in claude code via MCP, Plugins etc... And in relation to code via packages, testing, best practices and so on. The goal here is to make a extensive research with the goal to make this UI the best it can be"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fix Visual Stacking Issues (Priority: P1)

As a VoxPage user, I want UI elements to display in the correct visual order without icons or elements floating above other content, so that I can use the extension without visual confusion.

**Why this priority**: Visual stacking issues directly impact usability and make the extension appear broken. This is the most visible defect affecting user trust.

**Independent Test**: Can be fully tested by opening the popup and verifying all elements (icons, buttons, overlays) appear in their intended visual layers without overlapping incorrectly.

**Acceptance Scenarios**:

1. **Given** the popup is open with the onboarding overlay active, **When** viewing the interface, **Then** the overlay appears above all other content and no icons or buttons poke through.
2. **Given** the visualizer section is playing, **When** other UI elements are visible, **Then** no visualizer elements appear above the player controls or other sections.
3. **Given** multiple interactive elements are present, **When** hovering or focusing on any element, **Then** hover/focus states do not cause elements to incorrectly stack above other content.

---

### User Story 2 - Replace Purple Color Scheme (Priority: P1)

As a VoxPage user, I want a modern, accessible color scheme that replaces the current purple accent color, so that the extension feels professional and is comfortable to use.

**Why this priority**: Color scheme is a fundamental branding and usability concern that affects every interaction. The user explicitly dislikes the current purple color.

**Independent Test**: Can be fully tested by verifying all accent colors have been updated across the design tokens and that the new colors meet WCAG AA contrast ratios.

**Acceptance Scenarios**:

1. **Given** the extension popup is opened, **When** viewing any accent-colored element, **Then** the color should be the new brand color (not purple).
2. **Given** text is displayed on accent-colored backgrounds, **When** measuring contrast ratio, **Then** the contrast ratio meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text).
3. **Given** the user has system dark mode enabled, **When** opening the popup, **Then** the new color scheme renders correctly in dark mode.
4. **Given** the user has system light mode enabled, **When** opening the popup, **Then** the new color scheme renders correctly in light mode with appropriate contrast adjustments.

---

### User Story 3 - Align with Firefox Design System (Priority: P2)

As a VoxPage user, I want the extension to feel native to Firefox by following the Acorn/Photon design guidelines, so that the experience is consistent with the browser I chose.

**Why this priority**: Firefox users expect extensions to match the browser's look and feel. Following Mozilla's guidelines improves trust and usability.

**Independent Test**: Can be fully tested by comparing the extension's visual elements (buttons, inputs, spacing) against Firefox Photon design specifications.

**Acceptance Scenarios**:

1. **Given** a button is displayed in the popup, **When** comparing to Firefox Photon button styles, **Then** the button follows similar border-radius, padding, and interaction patterns.
2. **Given** form inputs (select, slider) are displayed, **When** comparing to Firefox Photon form styles, **Then** inputs follow similar styling conventions.
3. **Given** the popup content needs scrolling, **When** scrolling occurs, **Then** scrollbar styling matches Firefox conventions.

---

### User Story 4 - Implement Visual Regression Testing (Priority: P2)

As a developer, I want automated visual regression testing for the popup UI, so that CSS changes can be validated against baseline screenshots and regressions are caught before release.

**Why this priority**: Prevents future visual bugs from being introduced. Essential for maintaining UI quality long-term.

**Independent Test**: Can be fully tested by running the visual test suite, making a CSS change, and verifying the test catches the visual difference.

**Acceptance Scenarios**:

1. **Given** baseline screenshots exist for the popup, **When** running visual regression tests with no changes, **Then** all tests pass with no differences detected.
2. **Given** a CSS change affects the visual appearance, **When** running visual regression tests, **Then** the affected components are flagged with visual diff reports.
3. **Given** visual tests detect differences, **When** reviewing the test output, **Then** side-by-side comparison images are generated showing the change.

---

### User Story 5 - Refactor CSS Architecture (Priority: P2)

As a developer, I want a clean CSS architecture using design tokens with proper naming conventions, so that styles are maintainable, consistent, and easy to modify.

**Why this priority**: Proper CSS architecture prevents style drift and makes future UI work more efficient.

**Independent Test**: Can be fully tested by auditing the CSS for hardcoded values, verifying all colors/spacing use tokens, and confirming naming follows BEM or similar conventions.

**Acceptance Scenarios**:

1. **Given** any CSS file in the project, **When** searching for hardcoded color values (hex, rgb), **Then** zero hardcoded colors are found outside the tokens file.
2. **Given** a design token needs to change (e.g., spacing-md), **When** the token value is updated in tokens.css, **Then** all components using that token update consistently.
3. **Given** CSS class names in the codebase, **When** reviewing naming patterns, **Then** classes follow a consistent naming convention (Component-Element-Modifier pattern).

---

### User Story 6 - Component Unit Testing (Priority: P3)

As a developer, I want unit tests for UI component logic (accessibility.js, visualizer.js, onboarding.js), so that component behavior can be verified independently.

**Why this priority**: Unit tests catch logic bugs early but are less critical than visual issues for this feature.

**Independent Test**: Can be fully tested by running Jest tests against each component file and verifying coverage meets target threshold.

**Acceptance Scenarios**:

1. **Given** the accessibility component, **When** running its test suite, **Then** all screen reader announcement functions are tested.
2. **Given** the onboarding component, **When** running its test suite, **Then** tooltip positioning, dismiss logic, and state persistence are tested.
3. **Given** any component test file, **When** checking coverage, **Then** statement coverage exceeds 70%.

---

### Edge Cases

- What happens when the popup opens while system color scheme changes (dark/light mode toggle)?
- How does the UI handle extremely long voice names in the select dropdown?
- What happens when animations are disabled via prefers-reduced-motion?
- How do stacking contexts behave when the onboarding overlay is dismissed?
- What happens when the browser zoom level is increased to 200%?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace all purple accent colors (#7c3aed, #a855f7) with a Teal/Cyan color scheme (#0D9488 primary, #14B8A6 secondary)
- **FR-002**: System MUST ensure all interactive elements maintain correct z-index stacking order
- **FR-003**: System MUST use the CSS `isolation` property to create predictable stacking contexts for overlay elements
- **FR-004**: System MUST pass WCAG AA color contrast requirements for all text/background combinations
- **FR-005**: System MUST use only design tokens for colors, spacing, typography, and radii (no hardcoded values)
- **FR-006**: System MUST support visual regression testing via screenshot comparison
- **FR-007**: System MUST include unit tests for all JavaScript UI components
- **FR-008**: System MUST work correctly in both Firefox light and dark modes
- **FR-009**: System MUST follow Firefox Photon/Acorn design system patterns for native feel
- **FR-010**: System MUST maintain reduced motion support (prefers-reduced-motion)

### Key Entities

- **Design Tokens**: Centralized CSS custom properties defining the visual language (colors, spacing, typography, shadows, radii)
- **Stacking Contexts**: Isolated visual layers that control element overlap behavior (overlay, popup, content layers)
- **Visual Baselines**: Reference screenshots used for regression testing comparison
- **Test Suites**: Collections of unit tests and visual tests organized by component

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero hardcoded color values exist outside of tokens.css
- **SC-002**: All text/background color combinations achieve WCAG AA contrast ratio (4.5:1 minimum)
- **SC-003**: Visual regression test suite achieves 100% coverage of popup UI states (idle, playing, paused, error, onboarding)
- **SC-004**: Unit test coverage for UI components exceeds 70%
- **SC-005**: Zero z-index stacking bugs reported (icons floating above overlays, elements appearing in wrong layer)
- **SC-006**: Extension popup visually matches Firefox Photon design patterns (verified by manual comparison checklist)
- **SC-007**: Color scheme receives user approval before implementation begins

## Assumptions

- The new color scheme is Teal/Cyan (#0D9488 primary, #14B8A6 secondary) - confirmed by user
- Playwright will be used for visual regression testing based on industry research
- Jest will be used for unit testing JavaScript components
- The existing design token architecture (tokens.css) will be extended, not replaced
- Firefox-specific Photon design guidelines from design.firefox.com will be the reference
- Visual regression tests will run in a CI/CD pipeline once established

## Research Summary

Based on extensive web research, the following best practices and tools were identified:

### UI Design Best Practices for Browser Extensions
- Keep interfaces clean and intuitive; design for quick actions
- Avoid auto-triggered popups; use accordions, dropdowns, and side panels efficiently
- Build consistent branding (colors, tone, UI) to separate extension from existing sites
- Extensions should feel invisible - not slowing down the browser

### Firefox-Specific Guidelines
- Follow the Acorn Design System (design.firefox.com)
- Match Firefox Photon patterns for native feel
- Popup sizing: Firefox calculates preferred width; max 800x600 pixels
- Set popup width in `<body>`, not `:root`

### CSS Architecture & Design Tokens
- Use design tokens as named entities for visual attributes
- Structure: Component-Variant-Kind-Modifier-Property
- Use CSS variables for maintainability
- Semantic tokens reference existing tokens for context-specific use
- Support theming via token value changes (light/dark modes)

### Z-Index & Stacking Best Practices
- Use CSS `isolation: isolate` to create predictable stacking contexts
- Minimize nested stacking contexts
- Use DOM order strategically
- Modern layout tools (flexbox/grid) work with z-index without position: relative

### Testing Infrastructure
- **Visual Regression**: Playwright, BackstopJS, or Percy for screenshot comparison
- **Unit Testing**: Jest for component logic testing
- **Extension Testing**: Playwright supports Firefox extension loading and UI testing
- Jest-Playwright integration available for combined testing workflows

### Claude Code MCP Servers for UI Development
- **Figma MCP Server**: Translates Figma designs to code
- **Shadcn/UI MCP Server**: Access to React component registry with TypeScript props
- MCP enables AI-driven workflows connecting design to production code
