# Quickstart: Architecture Refactor

**Feature**: 008-architecture-refactor
**Date**: 2025-12-31

## Prerequisites

- Node.js 18+
- npm 9+
- Firefox Developer Edition (for testing)

## Setup

### 1. Install New Dev Dependencies

```bash
npm install --save-dev madge jscpd jest-chrome
```

### 2. Add NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "deps:check": "madge --circular background/ content/",
    "deps:graph": "madge --image deps.svg background/ content/",
    "duplication": "jscpd --threshold 10 --min-tokens 50 background/ content/ popup/",
    "quality": "npm run deps:check && npm run duplication && npm run lint"
  }
}
```

### 3. Configure jscpd

Create `.jscpd.json`:

```json
{
  "threshold": 10,
  "reporters": ["console", "json"],
  "ignore": ["**/node_modules/**", "**/tests/**"],
  "minTokens": 50,
  "minLines": 5,
  "absolute": true,
  "gitignore": true
}
```

## Development Workflow

### Before Each Module Split

1. **Run baseline tests**:
   ```bash
   npm test
   ```

2. **Check current duplication**:
   ```bash
   npm run duplication
   ```
   Record the baseline percentage for SC-005 verification.

### During Refactoring

1. **Extract module** (e.g., message-router from background.js)

2. **Update imports** in dependent files

3. **Verify no circular deps**:
   ```bash
   npm run deps:check
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Manual verification** in Firefox:
   ```bash
   npx web-ext run --firefox=firefoxdeveloperedition
   ```

### After Each Module Split

1. **Commit the working state**:
   ```bash
   git add -A && git commit -m "refactor(background): extract message-router module"
   ```

2. **Proceed to next module** only after tests pass

## Module Extraction Order

Follow this sequence to minimize conflicts:

### Phase 1: Background Layer (background.js → 4 modules)

1. `message-router.js` - Extract message handling
2. `ui-coordinator.js` - Extract popup/controller state sync
3. `audio-generator.js` - Extract TTS API calls
4. `playback-controller.js` - Remaining orchestration
5. `index.js` - Entry point with imports

### Phase 2: Content Layer (content.js → 3 modules)

1. `content-scorer.js` - Extract heuristic scoring
2. `content-extractor.js` - Extract text extraction
3. `highlight-manager.js` - Extract highlighting
4. `index.js` - Entry point

### Phase 3: Popup Layer (popup.js → 2 modules)

1. `popup-ui.js` - Extract DOM manipulation
2. `popup-controller.js` - Remaining logic
3. `index.js` - Entry point

### Phase 4: Shared & CSS

1. Create `shared/message-types.js`
2. Create `shared/dom-utils.js`
3. Extract CSS from `floating-controller.js`
4. Update `manifest.json` with new paths

## Verification Commands

```bash
# Full quality check
npm run quality

# Generate dependency graph (visual)
npm run deps:graph
# Opens deps.svg

# Check file sizes
wc -l background/*.js content/*.js popup/*.js | sort -n

# Run all tests
npm run test:all
```

## Success Criteria Verification

| Criterion | Command | Target |
|-----------|---------|--------|
| SC-001: File size | `wc -l <file>` | ≤300 lines each |
| SC-002: Tests pass | `npm test` | All green |
| SC-004: No cycles | `npm run deps:check` | Exit code 0 |
| SC-005: Duplication | `npm run duplication` | ≥20% reduction |
| SC-007: Functionality | Manual test | Playback works |

## Troubleshooting

### Circular Dependency Detected

```bash
# Find the cycle
npx madge --circular --warning background/

# Common fix: Extract shared code to lower-level module
# e.g., both A and B import each other → extract shared to C
```

### Tests Fail After Split

1. Check import paths are correct
2. Verify exports match what dependents expect
3. Check for missing `browser` API mocks in tests

### Extension Won't Load

1. Check `manifest.json` script paths
2. Verify `web_accessible_resources` includes shared modules
3. Check browser console for import errors

## File Templates

### New Module Header

```javascript
/**
 * [Module Name]
 * [Brief description of single responsibility]
 *
 * @module background/[module-name]
 */

import { MessageType, StorageKey } from './constants.js';

// ... module code ...

export { /* public API */ };
```

### Entry Point Pattern

```javascript
/**
 * Background Service Worker Entry Point
 * Initializes modules and registers event listeners
 */

import { MessageRouter, createRouter } from './message-router.js';
import { PlaybackController } from './playback-controller.js';
import { AudioGenerator } from './audio-generator.js';
import { UICoordinator } from './ui-coordinator.js';

// Initialize services
const playbackController = new PlaybackController(/* deps */);
const router = createRouter({ playbackController });

// Register listeners at TOP LEVEL (MV3 requirement)
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  router.route(msg, sender).then(sendResponse);
  return true;
});
```
