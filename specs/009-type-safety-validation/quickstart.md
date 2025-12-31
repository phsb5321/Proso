# Quickstart: Type Safety & Import/Export Validation

## Overview

This feature adds ESLint-based import/export validation to catch mismatches at test time rather than runtime.

## Installation

```bash
npm install --save-dev eslint eslint-plugin-import-x
```

## Configuration

### 1. Create eslint.config.js

```javascript
import importPlugin from 'eslint-plugin-import-x';

export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly'
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

### 2. Add package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "npm run lint && jest"
  }
}
```

## Usage

### Run Linting

```bash
npm run lint
```

### Run Tests (includes lint)

```bash
npm test
```

### Fix Auto-fixable Issues

```bash
npm run lint:fix
```

## What It Catches

### Import/Export Mismatches

```javascript
// visualizer.js exports:
export function setState(state) { ... }

// popup-ui.js - BAD (will be caught):
import { setVisualizerState } from './visualizer.js';
// Error: 'setVisualizerState' not found in './visualizer.js'

// popup-ui.js - GOOD:
import { setState as setVisualizerState } from './visualizer.js';
// OK: 'setState' exists, aliased to setVisualizerState
```

### Actual Error Format

When ESLint catches an import mismatch, the output looks like:

```
/home/notroot/Documents/Code/Firefox/VoxPage/popup/popup-ui.js
  10:3  error  setVisualizerState not found in './components/visualizer.js'  import-x/named

✖ 1 problem (1 error, 0 warnings)
```

The error message includes:
- **File path**: Full path to the file with the bad import
- **Line:column**: Exact location (`10:3`)
- **Missing export**: The name that doesn't exist (`setVisualizerState`)
- **Target module**: The module being imported from (`'./components/visualizer.js'`)
- **Rule name**: `import-x/named`

### Other Rules

- `import-x/namespace`: Validates namespace imports (`import * as utils`)
- `import-x/default`: Validates default imports
- `import-x/export`: Detects duplicate exports
- `import-x/no-unresolved`: Detects missing modules

## IDE Integration

Install the ESLint extension for your editor:

- **VS Code**: ESLint extension (dbaeumer.vscode-eslint)
- **WebStorm**: Built-in ESLint support

Errors will appear inline as you type.

## Troubleshooting

### False Positive on `browser` Import

The `browser` global is WebExtension-specific. We ignore it:

```javascript
'import-x/no-unresolved': ['error', { ignore: ['^browser$'] }]
```

### Content Script Namespace Pattern

Files using `window.VoxPage = { ... }` instead of ES modules won't be validated for imports (they have none). This is expected.

### Slow Linting

Enable ESLint caching:

```bash
eslint --cache .
```

Or add to package.json:

```json
{
  "scripts": {
    "lint": "eslint --cache ."
  }
}
```

---

## Message Contract Validation with Zod

In addition to import/export validation, this feature includes Zod schemas for runtime validation of messages between extension components.

### Installation

```bash
npm install --save-dev zod
```

### Available Schemas

The schemas are defined in `shared/message-schemas.js`:

#### Base Types

```javascript
import {
  ProviderIdSchema,    // 'openai' | 'elevenlabs' | 'cartesia' | 'groq' | 'browser'
  PlaybackStatusSchema, // 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'
  ReadingModeSchema,    // 'full' | 'selection' | 'article'
  SpeedSchema           // number between 0.5 and 2.0
} from '../../shared/message-schemas.js';
```

#### Playback Control Messages

```javascript
import {
  PlayMessageSchema,   // { action: 'play', provider?, voice?, speed?, mode?, text? }
  PauseMessageSchema,  // { action: 'pause' }
  StopMessageSchema,   // { action: 'stop' }
  PrevMessageSchema,   // { action: 'prev' }
  NextMessageSchema    // { action: 'next' }
} from '../../shared/message-schemas.js';
```

#### Settings Messages

```javascript
import {
  SetProviderMessageSchema, // { action: 'setProvider', provider: ProviderId }
  SetVoiceMessageSchema,    // { action: 'setVoice', voice: string }
  SetSpeedMessageSchema     // { action: 'setSpeed', speed: 0.5-2.0 }
} from '../../shared/message-schemas.js';
```

### Validation Helpers

```javascript
import {
  validateIncomingMessage,
  validateOutgoingPopupMessage,
  validateOutgoingContentMessage,
  assertMessage
} from '../../shared/message-schemas.js';

// Safe parsing (returns result object)
const result = validateIncomingMessage(message);
if (result.success) {
  console.log('Valid message:', result.data);
} else {
  console.error('Invalid message:', result.error);
}

// Assertive parsing (throws on invalid)
const validated = assertMessage(PlayMessageSchema, message);
```

### Example Usage

```javascript
import { PlayMessageSchema, validateIncomingMessage } from '../../shared/message-schemas.js';

// Validate a play message
const playMsg = {
  action: 'play',
  provider: 'openai',
  voice: 'alloy',
  speed: 1.5
};

// Option 1: Safe parse
const result = PlayMessageSchema.safeParse(playMsg);
if (result.success) {
  // result.data is typed and validated
  startPlayback(result.data);
}

// Option 2: Throw on invalid
try {
  const validated = PlayMessageSchema.parse(playMsg);
  startPlayback(validated);
} catch (error) {
  console.error('Invalid message:', error.message);
}

// Option 3: Use helper for discriminated union
const incoming = validateIncomingMessage(playMsg);
if (incoming.success) {
  switch (incoming.data.action) {
    case 'play':
      // TypeScript knows incoming.data has play message shape
      break;
    case 'setSpeed':
      // TypeScript knows incoming.data has setSpeed message shape
      break;
  }
}
```

### Testing Schemas

The test file at `tests/unit/message-schemas.test.js` contains 55 tests covering all schemas.

```bash
npm run test:unit -- tests/unit/message-schemas.test.js
```

### Benefits

1. **Runtime validation**: Catch invalid messages before they cause errors
2. **Type inference**: Zod infers TypeScript types from schemas (useful in JSDoc)
3. **Clear error messages**: Zod provides detailed validation errors
4. **Schema composition**: Combine schemas for complex message types
5. **Discriminated unions**: Validate message type and payload in one step
