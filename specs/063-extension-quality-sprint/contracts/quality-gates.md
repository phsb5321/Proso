# Contract: Quality Gates

**Feature**: 063-extension-quality-sprint
**Covers**: FR-014, FR-015, FR-016, FR-017

## Coverage Thresholds (FR-014)

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    statements: 60,   // up from 25
    branches: 50,     // up from 20
    functions: 60,     // up from 25
    lines: 60,         // up from 25
  },
},
```

## Biome Linting Rules (FR-015)

```json
// biome.json — suspicious rules
{
  "rules": {
    "suspicious": {
      "noUnusedVariables": "warn",    // currently "off"
      "noExplicitAny": "warn"         // currently "off"
    }
  }
}
```

All existing warnings must be resolved before merge.

## Dispatch Integration Tests (FR-016)

Test file: `tests/integration/dispatch.test.ts`

Required test cases:
1. Hexagonal dispatch succeeds for registered handler
2. Legacy fallback executes when handler not in registry
3. Unknown message returns structured error (not crash)
4. Handler error returns `Result.Err` with `execution_failed` type
5. Validated params accepted by handler
6. Invalid params rejected with `VALIDATION_ERROR` code

## Round-Trip Integration Tests (FR-017)

Test file: `tests/integration/popup-background.test.ts`

Required message round-trips (minimum 5):
1. `playback.start` — popup → background → response
2. `settings.get` — popup → background → response
3. `provider.select` — popup → background → response
4. `cache.getStats` — popup → background → response
5. `export.start` — popup → background → response

Each test MUST verify:
- Request validation passes for valid input
- Request validation fails for invalid input
- Response matches expected schema
- Error responses have structured format
