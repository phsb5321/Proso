# Quickstart: Production Readiness Sprint

**Branch**: `056-production-readiness-sprint` | **Date**: 2026-02-06

Integration and testing scenarios for validating the sprint deliverables.

## Prerequisites

```bash
# Install dependencies
pnpm install

# Build for Firefox (development)
pnpm run build:firefox

# Run all tests
pnpm test
```

## Scenario 1: UI Integrity — No Phantom Providers

**Goal**: Verify that settings and popup only show implemented providers (ElevenLabs, Browser TTS).

### Manual Validation

1. Load the extension in Firefox (`about:debugging` → Load Temporary Add-on → `.output/firefox-mv2/manifest.json`)
2. Open the settings page (click gear icon or navigate to extension options)
3. **Assert**: Only "ElevenLabs" and "Browser TTS" provider cards are visible
4. **Assert**: No cards for OpenAI, Groq, or Cartesia
5. Click the popup icon → check the provider dropdown
6. **Assert**: Only "ElevenLabs" and "Browser TTS" appear
7. Click every visible "Test" button
8. **Assert**: Each test button executes and returns a meaningful result (not a no-op)

### Automated Validation

```bash
# Run E2E tests for settings page
pnpm run test:e2e -- --grep "provider"

# Check for phantom provider references in UI HTML
grep -rn "openai\|groq\|cartesia" src/entrypoints/settings.html src/entrypoints/popup/index.html
# Expected: zero matches
```

---

## Scenario 2: Security — No Hardcoded Credentials in Build

**Goal**: Verify production builds contain no secrets.

### Automated Validation

```bash
# Build production artifacts
NODE_ENV=production pnpm run build:firefox

# Scan for hardcoded token (should find zero matches)
grep -rn "5Q0LlZ" .output/
# Expected: zero matches

# Scan for gateway URL as fallback (should only be in config, not inline)
grep -rn "voxpage-logs.home301server" .output/
# Expected: zero matches in JS files (only in env-injected config)

# Run existing security tests
pnpm run test:security

# Scan for console.log in production output
grep -rn "console\.\(log\|debug\|info\|warn\)" .output/firefox-mv2/
# Expected: zero matches (esbuild drops console.* in production)
```

---

## Scenario 3: Test Coverage Enforcement

**Goal**: Verify CI blocks on coverage drops.

### Local Validation

```bash
# Run tests with coverage
pnpm run test:coverage

# Expected output should include:
# - Coverage summary meeting thresholds: 70% statements, 60% branches, 70% functions, 70% lines
# - If below threshold, Jest exits with non-zero code

# Verify coverage report exists
ls coverage/lcov.info
```

### CI Validation

After pushing changes, verify in GitHub Actions:
1. `ci.yml` job runs tests with `--coverage`
2. Coverage thresholds cause build failure if not met
3. Codecov upload succeeds with `fail_ci_if_error: true`

---

## Scenario 4: Handler Tests — All Hexagonal Handlers Covered

**Goal**: Verify every handler file in `src/handlers/` has corresponding tests.

### Automated Validation

```bash
# List all handler files
ls src/handlers/*.handlers.ts

# List all handler test files
ls tests/unit/handlers/

# For each handler file, there MUST be a corresponding test file
# Example: src/handlers/playback.handlers.ts → tests/unit/handlers/playback.handlers.test.ts

# Run handler tests specifically
pnpm run test:unit -- --testPathPattern="handlers"
```

---

## Scenario 5: Hexagonal Migration — No Legacy Handlers

**Goal**: Verify all message types route through hexagonal handlers.

### Automated Validation

```bash
# Check migration flags (all should be false)
grep -n "USE_LEGACY" src/entrypoints/background.ts
# Expected: All flags are `false`

# Check background.ts line count
wc -l src/entrypoints/background.ts
# Expected: Under 500 lines

# Run debug handler to check dispatch stats
# (In browser console with debug mode enabled)
# browser.runtime.sendMessage({ type: 'debug.getDispatchSummary' })
# Expected: 100% hexagonal routing, 0% legacy fallback
```

---

## Scenario 6: Browser TTS Fallback

**Goal**: Verify Browser TTS works when no ElevenLabs API key is configured.

### Manual Validation

1. Load extension with NO API keys configured
2. Navigate to an article page
3. Click the play button
4. **Assert**: Article begins reading using browser's built-in speech synthesis
5. **Assert**: Popup shows "Browser TTS" as the active provider
6. **Assert**: No error messages appear about missing API keys
7. Open settings → configure an ElevenLabs API key → test it
8. Navigate to another article → play
9. **Assert**: Article reads using ElevenLabs voice

---

## Scenario 7: Debug Infrastructure

**Goal**: Verify structured logging works in development, is stripped in production.

### Development Build

```bash
# Build development version
pnpm run build:firefox

# Load in Firefox, open browser console
# Trigger a playback action
# Expected: Structured log entries with format:
#   [background] playback.start: Starting playback for tab 123
#   [handler] audio.generate: Generating audio for paragraph 0
```

### Production Build

```bash
# Build production version
NODE_ENV=production pnpm run build:firefox

# Verify no debug code in output
grep -rn "createLogger\|debugApi\|console\.\(log\|debug\)" .output/firefox-mv2/
# Expected: zero matches
```

---

## Scenario 8: Accessibility

**Goal**: Verify keyboard navigation and screen reader support.

### Automated Validation

```bash
# Run accessibility tests
pnpm run test:visual -- --grep "accessibility"

# Run axe-core tests
pnpm run test:unit -- --testPathPattern="accessibility"
```

### Manual Validation

1. Open settings page
2. Press Tab repeatedly
3. **Assert**: Focus moves through all interactive elements in logical order
4. **Assert**: Focus indicators are visible
5. Open popup
6. Press Arrow keys on tab navigation
7. **Assert**: Tab selection changes with ARIA state updates
8. Trigger a destructive action (e.g., "Clear Cache")
9. **Assert**: An accessible modal confirmation appears (not a native browser `confirm()`)

---

## Scenario 9: Codebase Hygiene

**Goal**: Verify obsolete specs are archived and dead code is removed.

```bash
# Verify obsolete specs are archived
ls specs/_archived/
# Expected: 10 directories (044, 024, 042, 021, 037, 010, 032, 023, 022, 018)

# Verify no stale root files
test -f manifest.json && echo "FAIL: stale manifest.json exists" || echo "PASS"
test -f package-lock.json && echo "FAIL: stale package-lock.json exists" || echo "PASS"

# Count remaining TODO markers
grep -rn "TODO" src/ --include="*.ts" | wc -l
# Expected: fewer than 10

# Verify each remaining TODO references a tracked issue
grep -rn "TODO" src/ --include="*.ts"
# Expected: Each TODO contains a reference like "TODO(#123)" or "TODO(issue-url)"
```

---

## Scenario 10: Settings Migration

**Goal**: Verify upgrade from any previous version preserves user data.

### Automated Validation

```bash
# Run migration tests
pnpm run test:unit -- --testPathPattern="migration"
```

### Manual Validation

1. Install an older version of VoxPage (pre-sprint)
2. Configure settings: ElevenLabs API key, voice selection, speed, cache preferences
3. Update to the sprint version
4. **Assert**: All existing settings are preserved
5. **Assert**: Provider is still "elevenlabs" (not reset to "browser")
6. **Assert**: Previously saved highlights are still accessible
7. **Assert**: Audio cache entries are intact
