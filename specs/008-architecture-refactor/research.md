# Research: Architecture Refactor & Code Quality Improvement

**Date**: 2025-12-31
**Feature**: 008-architecture-refactor

## 1. Circular Dependency Detection

### Decision: **madge**

**Rationale**: Best balance of features, ES module support, and ease of use. Works without a bundler, generates visual dependency graphs, and has excellent CI/CD integration. The `--circular` flag exits with code 1 when cycles are detected, making it ideal for npm scripts.

**Alternatives Considered**:
- **dpdm**: Lighter weight but less mature ecosystem
- **eslint-plugin-import (no-cycle rule)**: Good for lint-time but requires ESLint setup; less suitable for standalone verification

**Integration**:
```json
{
  "scripts": {
    "deps:check": "madge --circular background/ content/",
    "deps:graph": "madge --image deps.svg background/ content/"
  },
  "devDependencies": {
    "madge": "^8.0.0"
  }
}
```

---

## 2. Code Duplication Detection

### Decision: **jscpd**

**Rationale**: Supports 150+ languages, provides percentage metrics in JSON output, and has CI-friendly threshold enforcement. The `--threshold` flag fails if duplication exceeds the limit.

**Alternatives Considered**:
- **PMD CPD**: Java-based, heavier setup
- **SonarQube**: Overkill for this project size

**Integration**:
```json
{
  "scripts": {
    "duplication": "jscpd --threshold 10 --min-tokens 50 background/ content/ popup/"
  },
  "devDependencies": {
    "jscpd": "^4.0.5"
  }
}
```

**Measuring 20% Reduction (SC-005)**:
1. Run jscpd before refactor, capture `statistics.total.percentage`
2. Run after refactor, verify percentage dropped by ≥20% relative

---

## 3. WebExtension ES Module Patterns

### Decision: Static imports at top level with lazy loading for expensive modules

**Rationale**: Firefox 112+ supports `"type": "module"` in manifest background scripts. Static imports ensure listener registration happens synchronously at the top level (critical for MV3). Dynamic imports can be used for expensive modules loaded on-demand.

**Key Pattern**:
```javascript
// background/index.js (entry point)
import { MessageRouter } from './message-router.js';
import { PlaybackController } from './playback-controller.js';

// Register listeners SYNCHRONOUSLY at top level
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessageAsync(msg, sender).then(sendResponse);
  return true;
});
```

**Gotchas Documented**:
1. Event listeners MUST be registered at top level, not inside async callbacks
2. Don't rely on module-level variables for state in Chrome (service worker termination)
3. Content scripts don't support `type: "module"` in manifest - use dynamic imports with `web_accessible_resources`

---

## 4. Sharing Code Between Background and Content Scripts

### Decision: Dynamic import via `web_accessible_resources`

**Rationale**: Allows content scripts to import ES modules without a bundler. Requires listing modules in `web_accessible_resources` and using `browser.runtime.getURL()`.

**Alternatives Considered**:
- **Duplicate code**: Violates DRY, hard to maintain
- **Message-based shared logic**: Higher latency, only for complex operations
- **Bundler**: Explicitly rejected per clarifications

**Implementation**:
```json
{
  "web_accessible_resources": [{
    "resources": ["shared/*.js", "content/*.js"],
    "matches": ["<all_urls>"]
  }]
}
```

```javascript
// content/content.js
(async () => {
  const { MessageTypes } = await import(browser.runtime.getURL('shared/message-types.js'));
  // ...
})();
```

**Trade-off**: Loses `document_start` timing for imported modules (acceptable for this refactor).

---

## 5. Message Router Pattern

### Decision: Handler Registry with Dependency Injection

**Rationale**: Enables unit testing without browser context by injecting mock dependencies. Each handler is a pure function that can be tested in isolation.

**Pattern**:
```javascript
// message-router.js
export class MessageRouter {
  constructor() {
    this.handlers = new Map();
  }

  register(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  async route(message, sender) {
    const handler = this.handlers.get(message.type);
    if (!handler) throw new Error(`Unknown message type: ${message.type}`);
    return handler(message.payload, sender);
  }
}

export function createRouter(deps = {}) {
  const router = new MessageRouter();
  router.register('START_PLAYBACK', payload => deps.playback?.start(payload));
  return router;
}
```

**Testing**:
```javascript
const mockPlayback = { start: jest.fn() };
const router = createRouter({ playback: mockPlayback });
await router.route({ type: 'START_PLAYBACK', payload: {} }, {});
expect(mockPlayback.start).toHaveBeenCalled();
```

---

## 6. Testing Mocks for Browser APIs

### Decision: **jest-chrome** (already in ecosystem)

**Rationale**: Lightweight, integrates with existing Jest setup, provides `browser.*` API mocks. The project already uses Jest; adding jest-chrome requires minimal configuration.

**Alternatives Considered**:
- **sinon-chrome**: More comprehensive but heavier
- **Manual mocks**: More maintenance overhead

**Integration**:
```javascript
// jest.setup.js
import { chrome } from 'jest-chrome';
global.chrome = chrome;
global.browser = chrome;
```

---

## Summary: New Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| madge | ^8.0.0 | Circular dependency detection |
| jscpd | ^4.0.5 | Code duplication detection |
| jest-chrome | ^0.8.0 | Browser API mocking for tests |

**Total additional footprint**: ~3 npm packages (dev only, not shipped)

---

## Sources

- [madge - npm](https://www.npmjs.com/package/madge)
- [jscpd - npm](https://www.npmjs.com/package/jscpd)
- [jest-chrome - npm](https://www.npmjs.com/package/jest-chrome)
- [MDN - background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Firefox Extension Workshop - Manifest V3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
