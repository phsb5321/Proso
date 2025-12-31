# Research: Type Safety & Import/Export Validation

**Feature**: 009-type-safety-validation
**Date**: 2025-12-31

## Problem Statement

During Feature 008 (Architecture Refactor), a runtime error broke the extension:

```
Uncaught SyntaxError: The requested module 'moz-extension://...popup/components/visualizer.js'
doesn't provide an export named: 'setVisualizerState'
```

The bug: `popup-ui.js` imported `setVisualizerState` directly, but `visualizer.js` exports it as `setState`. This was not caught by Jest (153 tests passed) or any static analysis.

## Approaches Evaluated

### 1. ESLint with eslint-plugin-import

**How it works**: Static analysis of import/export statements. The `import/named` rule verifies that named imports correspond to actual named exports.

**Would catch the bug**: YES - `import/named` specifically checks that imported names exist in exports.

**Pros**:
- Well-established (14M+ weekly downloads)
- Integrates with existing ESLint infrastructure
- IDE integration provides immediate feedback
- Zero runtime overhead

**Cons**:
- Can be slow on large codebases
- Requires careful resolver configuration for ES modules

### 2. eslint-plugin-import-x (Modern Fork)

**How it works**: Maintained fork of `eslint-plugin-import` with better ES module support and performance improvements.

**Would catch the bug**: YES - Same `named` rule.

**Pros**:
- Actively maintained
- Better ESM support out of the box
- Performance improvements
- Drop-in replacement for original

**Cons**:
- Smaller community
- Less documentation

### 3. Custom Jest Setup File

**How it works**: Parse all JS files with Acorn, extract imports/exports, validate matches before tests run.

**Would catch the bug**: YES - Explicit validation logic.

**Pros**:
- Full control over validation
- Customizable error messages
- No external dependencies (uses Acorn)

**Cons**:
- More code to maintain
- Need to handle edge cases (re-exports, barrel files)
- Less battle-tested
- Slower startup time

### 4. esbuild Validation

**How it works**: Use esbuild's bundler in analyze mode. Fails when imports don't resolve.

**Would catch the bug**: PARTIALLY - Validates resolution but error messages less clear.

**Pros**:
- Extremely fast (Go-based)
- Validates entire dependency graph
- Also catches circular dependencies

**Cons**:
- WebExtension imports need external configuration
- Less specific error messages
- Overkill for just validation

### 5. Rollup Validation

**How it works**: Rollup explicitly warns about missing exports with `MISSING_EXPORT` code.

**Would catch the bug**: YES - Clear messages like `'setVisualizerState' is not exported by 'audio-visualizer.js'`.

**Pros**:
- Explicit missing export warnings
- Battle-tested, mature
- Good error messages

**Cons**:
- Slower than esbuild
- Requires WebExtension configuration
- Another tool in the chain

## Decision: eslint-plugin-import-x

**Rationale**:
1. **Catches the exact bug**: The `import-x/named` rule detects non-existent named exports
2. **Active maintenance**: Better ESM support than original plugin
3. **Workflow integration**: Runs as part of `npm run lint`, can gate `npm test`
4. **IDE support**: Immediate feedback in VS Code with ESLint extension
5. **Low overhead**: Static analysis, no runtime impact
6. **Flat config**: Uses modern ESLint flat config format (eslint.config.js)

**Alternatives Rejected**:
- **eslint-plugin-import (original)**: Less active maintenance, weaker ESM support
- **Custom Jest setup**: More maintenance burden, less battle-tested
- **esbuild**: Overkill, less clear error messages
- **Rollup**: Adds another tool when ESLint already exists

## Configuration

### Installation

```bash
npm install --save-dev eslint eslint-plugin-import-x
```

### ESLint Flat Config (eslint.config.js)

```javascript
import importPlugin from 'eslint-plugin-import-x';

export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'tests/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Audio: 'readonly',
        AudioContext: 'readonly',
        CSS: 'readonly',
        Highlight: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly'
      }
    },
    plugins: {
      'import-x': importPlugin
    },
    rules: {
      'import-x/named': 'error',
      'import-x/namespace': 'error',
      'import-x/default': 'error',
      'import-x/export': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^browser$'] }]
    },
    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js']
        }
      }
    }
  }
];
```

### Package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "npm run lint && jest"
  }
}
```

## P3: Message Contract Validation (Optional)

For runtime message validation, Zod can define schemas:

```javascript
// shared/message-schemas.js
import { z } from 'zod';

export const PlayMessage = z.object({
  action: z.literal('play'),
  provider: z.string(),
  voice: z.string(),
  speed: z.number().min(0.5).max(2).optional(),
  mode: z.enum(['full', 'selection', 'article']).optional()
});

export const MessageSchemas = {
  play: PlayMessage,
  pause: z.object({ action: z.literal('pause') }),
  stop: z.object({ action: z.literal('stop') }),
  // ... other message types
};
```

This is P3 priority and optional for initial implementation.

## Verification

After implementation, this test should demonstrate the bug would be caught:

```bash
# Introduce the exact bug from Feature 008
sed -i 's/setState as setVisualizerState/setVisualizerState/' popup/popup-ui.js

# This should fail
npm run lint
# Expected error: 'setVisualizerState' not found in './components/visualizer.js'

# Revert
git checkout popup/popup-ui.js
```
