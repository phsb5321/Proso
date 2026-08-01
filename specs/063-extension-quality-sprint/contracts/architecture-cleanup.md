# Contract: Architecture Cleanup

**Feature**: 063-extension-quality-sprint
**Covers**: FR-018, FR-019, FR-020, FR-021

## Handler Migration (FR-018)

Files to migrate from `src/utils/messaging/handlers/` to `src/handlers/`:

| Source | Target | Action |
|--------|--------|--------|
| `src/utils/messaging/handlers/export.ts` | `src/handlers/export.handlers.ts` | Merge or replace (export.handlers.ts already exists) |
| `src/utils/messaging/handlers/queue.ts` | `src/handlers/queue.handlers.ts` | Merge or replace (queue.handlers.ts already exists) |
| `src/utils/messaging/handlers/settings.ts` | `src/handlers/settings.handlers.ts` | Merge or replace |
| `src/utils/messaging/handlers/cache-handlers.ts` | `src/handlers/cache.handlers.ts` | Merge or replace |
| `src/utils/messaging/handlers/index.ts` | Remove | Re-export barrel no longer needed |

Post-migration: `src/utils/messaging/handlers/` directory should be deleted.

## Message Name Standardization (FR-019)

### Canonical Names (dot-notation)

All message types MUST use `domain.action` format:

```typescript
// Single source of truth for message names
const MESSAGE_TYPES = {
  'playback.start',
  'playback.pause',
  'playback.resume',
  'playback.stop',
  'playback.next',
  'playback.prev',
  'playback.setSpeed',
  'playback.setMode',
  'footer.show',
  'footer.hide',
  'footer.action',
  'footer.stateUpdate',
  'footer.toggleSettings',
  'language.detect',
  'language.getState',
  'language.setOverride',
  'language.clearOverride',
  // ... all other handlers
} as const;
```

### Bridge Mapping

Legacy names MUST be bridged at exactly ONE location (`src/entrypoints/background.ts`):

```typescript
const LEGACY_BRIDGE: Record<string, string> = {
  'FOOTER_SHOW': 'footer.show',
  'FOOTER_HIDE': 'footer.hide',
  'FOOTER_STATE_UPDATE': 'footer.stateUpdate',
  'FOOTER_ACTION': 'footer.action',
  'TOGGLE_FOOTER_SETTINGS': 'footer.toggleSettings',
  'languageDetected': 'language.detect',
  // All other legacy names
};
```

Content script (sender side) should be updated to use dot-notation directly where possible, reducing bridge dependency over time.

## Language Extraction Module (FR-020)

Extract inline language detection from `src/entrypoints/content.ts` to `src/utils/language/extractor.ts` (or enhance existing module).

Current: Language extraction logic embedded in content script (~50-100 lines).
Target: Dedicated module importable by both content script and background.

## Dead Code Removal (FR-021)

TODOs marked for removal in `src/entrypoints/content.ts`:
- Line 543: TODO marker
- Line 764: TODO marker
- Line 1061: TODO marker

Identify and remove:
- Legacy floating controller references (superseded by sticky footer)
- Unused message handler stubs
- Commented-out code blocks

Verification: `grep -r 'TODO.*remove\|TODO.*delete\|TODO.*cleanup' src/` should return zero results for addressed items.
