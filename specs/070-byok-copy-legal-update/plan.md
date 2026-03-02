# Implementation Plan: BYOK Legal & Marketing Copy Update

**Branch**: `070-byok-copy-legal-update` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/070-byok-copy-legal-update/spec.md`

## Summary

Update all legal documents, marketing pages, and the privacy policy to accurately reflect the BYOK key handling architecture after 069-server-tts-centralization. Research identified 9 false claims across 4 HTML files that state BYOK keys "never leave the browser" or "are never transmitted to Proso servers" — all contradicting the current server-proxied model. This is a copy-only feature: no code changes, no new dependencies, just text content edits in existing HTML files.

## Technical Context

**Language/Version**: HTML5, CSS3 (no JavaScript changes)
**Primary Dependencies**: None (static HTML files, no build step for site/legal packages)
**Storage**: N/A (no data persistence changes)
**Testing**: Manual grep verification for false claim patterns; visual review of rendered pages
**Target Platform**: Static website (GitHub Pages) + legal document pages
**Project Type**: Documentation/copy update (no source code structure)
**Performance Goals**: N/A (static content)
**Constraints**: LGPD compliance (Brazilian data protection law); no HTML structure/CSS class changes
**Scale/Scope**: 5 HTML files, ~15-20 individual text edits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Cross-Browser with MV3 Priority | N/A | No extension code changes |
| II. Privacy by Design | NOTED | Constitution states "API keys MUST be stored in browser-encrypted storage only." Keys ARE still stored locally; ephemeral server forwarding is a 069 architecture decision. Amendment recommended as follow-up (out of scope for 070). Privacy policy update in this feature IMPROVES privacy transparency. |
| III. Hexagonal Architecture | N/A | No code changes |
| IV. Test Coverage | N/A | No testable code; verification via grep |
| V. Observability | N/A | No code changes |
| VI. Simplicity | PASS | Minimal text-only changes, no structural modifications |

**Gate Result**: PASS — No blocking violations. Section II deviation is documented and improves user transparency.

## Project Structure

### Documentation (this feature)

```text
specs/070-byok-copy-legal-update/
├── plan.md              # This file
├── research.md          # Phase 0: false claim inventory, LGPD analysis
├── quickstart.md        # Phase 1: copy change guide with before/after
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

Note: `data-model.md` and `contracts/` are not applicable — this is a documentation-only feature with no entities, APIs, or data models.

### Files to Modify (repository root)

```text
packages/
├── legal/
│   └── terms.html       # Primary legal document (4 sections to update)
├── site/
│   ├── privacy.html     # Privacy policy (3 sections to update)
│   ├── terms.html       # Simplified site terms (1 section to update)
│   ├── pricing.html     # Marketing/pricing page (2 sections to update)
│   └── index.html       # Landing page (1 line to clarify)
```

**Structure Decision**: No new files created. All changes are text content edits within existing HTML files. The file structure is unchanged.

### Change Summary by File

| File | Sections | False Claims | Edits |
|------|----------|--------------|-------|
| `packages/legal/terms.html` | Sections 2, 3, 9, 14 | 3 critical | ~6 edits |
| `packages/site/privacy.html` | Data handling, provider flow, rights | 3 critical | ~4 edits |
| `packages/site/terms.html` | Section 7 | 1 critical | ~1 edit |
| `packages/site/pricing.html` | BYOK callout, FAQ | 2 high | ~2 edits |
| `packages/site/index.html` | Privacy features section | 0 (1 incomplete) | ~1 edit |

**Total**: 9 false claims to fix, ~14 individual text edits across 5 files.

## Complexity Tracking

> No constitution violations requiring justification.

N/A — This feature is a straightforward copy update with no architectural complexity.
