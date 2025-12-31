<!--
  SYNC IMPACT REPORT
  =================
  Version change: 1.0.0 → 1.1.0 (MINOR - added Cartesia to permitted providers)

  Modified principles:
    - I. Privacy First: Added Cartesia to permitted TTS providers list

  Added sections: N/A

  Removed sections: N/A

  Templates status:
    ✅ .specify/templates/plan-template.md - compatible (Constitution Check section present)
    ✅ .specify/templates/spec-template.md - compatible (requirements align)
    ✅ .specify/templates/tasks-template.md - compatible (phase structure aligns)

  Follow-up TODOs: None
-->

# VoxPage Constitution

## Core Principles

### I. Privacy First

All user data, including API keys and preferences, MUST be stored locally using the
browser's extension storage APIs. The extension MUST NOT transmit any data to servers
other than the explicitly selected TTS provider (OpenAI, ElevenLabs, Cartesia) when the user
initiates playback. No telemetry, analytics, or tracking of any kind is permitted.

**Rationale**: Users trust browser extensions with access to their browsing context.
VoxPage handles sensitive API credentials and page content; privacy violations would
be a fundamental breach of that trust.

### II. Security by Default

All external API requests MUST use HTTPS exclusively. API keys MUST be stored in
`browser.storage.local` and NEVER exposed to content scripts or page contexts.
Content Security Policy (CSP) MUST be as restrictive as possible. User-provided
or page-extracted text MUST be sanitized before processing.

**Rationale**: Browser extensions are high-value attack targets. A compromised
extension can access all websites the user visits. Strict security defaults
prevent credential theft and injection attacks.

### III. User Experience Excellence

The extension MUST provide immediate, visible feedback for all user actions.
Audio playback controls MUST be intuitive and accessible. Error states MUST
display user-friendly messages with actionable guidance. The UI MUST work
consistently across light and dark Firefox themes.

**Rationale**: TTS is an accessibility-adjacent feature. Users may have visual
impairments or cognitive needs that make clear, responsive UI essential rather
than optional.

### IV. Modular Architecture

Each functional area (TTS providers, text extraction, UI components, storage)
MUST be implemented as an independent module with clear interfaces. Provider
implementations MUST follow a common interface pattern to enable adding new
TTS services without modifying core logic.

**Rationale**: Browser extension APIs evolve; TTS providers change their APIs;
new features will be requested. Modular design isolates change impact and
simplifies testing.

### V. Test Coverage for Critical Paths

All TTS provider integrations MUST have contract tests verifying API request
format and response handling. Text extraction logic MUST have unit tests for
various HTML structures. UI components SHOULD have basic interaction tests.
Bug fixes MUST include regression tests.

**Rationale**: Browser extensions run in diverse environments with limited
debugging visibility. Tests catch issues before users encounter them in
production across different Firefox versions.

## Security Constraints

### API Key Handling

- API keys MUST be stored using `browser.storage.local`, never `localStorage`
- API keys MUST NOT be logged, even in debug mode
- API keys MUST NOT be passed to content scripts; all API calls originate from
  the background service worker
- Options page MUST mask API key display with reveal toggle

### External Requests

- All TTS API endpoints MUST be explicitly declared in `manifest.json` permissions
- Requests to undeclared origins are forbidden
- Response data from TTS APIs MUST be validated before use

### Content Script Isolation

- Content scripts MUST NOT have access to API credentials
- Message passing between content scripts and background MUST use structured
  message types with validation
- DOM manipulation MUST use safe methods (textContent, classList) over innerHTML

## Development Workflow

### Code Review Requirements

All changes MUST be reviewed for:

1. **Privacy compliance** - No new data collection or transmission
2. **Security posture** - No credential exposure, proper input sanitization
3. **WebExtension API usage** - Correct permission scoping, MV3 compliance
4. **Error handling** - Graceful degradation, user-friendly messages

### Quality Gates

- Manifest validation MUST pass (`web-ext lint`)
- No console errors in popup, options, or content script contexts
- All declared permissions MUST be justified in PR description
- Breaking changes to storage schema MUST include migration logic

### Browser Compatibility

- Target Firefox 109+ (Manifest V3 baseline)
- Test on both Firefox Release and Firefox Developer Edition
- Document any Firefox-specific API usage that differs from Chrome

## Governance

This constitution supersedes conflicting guidance in any other project documentation.
Amendments require:

1. Written proposal documenting the change rationale
2. Review of impact on existing code and documentation
3. Update to constitution version following semantic versioning
4. Propagation of changes to dependent templates and documentation

All pull requests MUST verify compliance with these principles. Reviewers MUST
reject changes that violate constitution principles without documented exception
and justification in the Complexity Tracking section of the implementation plan.

For runtime development guidance, refer to the project README.md and inline code
documentation.

**Version**: 1.1.0 | **Ratified**: 2025-12-30 | **Last Amended**: 2025-12-30
