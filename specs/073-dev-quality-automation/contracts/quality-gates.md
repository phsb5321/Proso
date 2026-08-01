# Contracts: Quality Gates & CI Pipeline

**Feature**: 073-dev-quality-automation | **Date**: 2026-03-03

---

## Pre-Commit Hook Contract

### Trigger
Git pre-commit event on staged files.

### Checks (parallel execution via Lefthook)

| Check | Command | Scope | Pass Criteria | Timeout |
|-------|---------|-------|---------------|---------|
| Biome lint | `biome check --staged` | `*.{ts,tsx,js,json}` | Exit 0 | 10s |
| TypeScript | `tsc --build --noEmit` | `*.{ts,tsx}` | Exit 0 | 15s |
| Unit tests | `pnpm --filter <affected> test:unit` | Changed packages | Exit 0 | 30s |

### Failure behavior
- Commit is rejected
- Error output shows which check failed and how to fix
- Developer can bypass with `git commit --no-verify` (for WIP commits)

---

## CI Pipeline Contract

### Trigger
Push to any branch, PR opened/updated.

### Jobs (matrix strategy, parallel)

| Job | Runner | Steps | Artifacts |
|-----|--------|-------|-----------|
| `extension-test` | ubuntu-latest | checkout → pnpm install → biome check → tsc → jest (coverage) | coverage/extension.json |
| `server-test` | ubuntu-latest | checkout → pnpm install → biome check → tsc → jest (coverage) | coverage/server.json |
| `e2e-test` | ubuntu-latest | checkout → pnpm install → build extension → playwright (Chromium) | e2e-results/ |
| `security-audit` | ubuntu-latest | checkout → pnpm audit → license-checker | audit-report.json |

### Coverage Enforcement

```yaml
# Per-package thresholds
extension:
  statements: 60%
  branches: 50%
  functions: 55%
  lines: 60%

server:
  statements: 60%
  branches: 50%
  functions: 55%
  lines: 60%

# Delta enforcement
patch_coverage: 80%  # New code in PR must be 80% covered
coverage_decrease: block  # PRs that decrease coverage are blocked
```

### PR Merge Requirements

| Requirement | Source | Override |
|-------------|--------|---------|
| All CI jobs pass | GitHub branch protection | Admin override |
| Coverage threshold met | Codecov status check | Maintainer comment `!coverage-override` |
| No critical/high vulnerabilities | audit-ci | Maintainer approval |
| Extension bundle < 4MB | size-limit | None |

---

## Validation Schema Contract

### Server Endpoints Requiring Zod Validation

| Endpoint | Method | Request Schema | Response Schema |
|----------|--------|---------------|-----------------|
| `/tts/synthesize` | POST | `SynthesizeRequestSchema` | `SynthesizeResponseSchema` |
| `/license/validate` | POST | `LicenseValidateRequestSchema` | `LicenseValidateResponseSchema` |
| `/credits/balance` | GET | (query params) | `CreditBalanceResponseSchema` |
| `/credits/deduct` | POST | `CreditDeductRequestSchema` | `CreditDeductResponseSchema` |

### Validation Behavior

- Invalid request → `400 Bad Request` with structured Zod error
- Valid request → proceed to handler
- Response validation failure → `500 Internal Server Error` with logged warning (never expose internals)

---

## Contract Test Coverage Requirements

### Port Interfaces

| Port | Adapter(s) | Contract Test File |
|------|-----------|-------------------|
| `IAudioGenerator` | OpenAI, ElevenLabs, Browser, ServerProxy | `audio-generator.contract.test.ts` |
| `ICacheStore` | IndexedDB, InMemory | `cache-store.contract.test.ts` |
| `IHighlightSynchronizer` | ContentScriptHighlight | `highlight-sync.contract.test.ts` |
| `ITextExtractor` | ReadabilityExtractor | `text-extractor.contract.test.ts` |
| `IContentScorer` | TrafilaturaScorer | `content-scorer.contract.test.ts` |
| `ISettingsStore` | BrowserSettings | `settings-store.contract.test.ts` |

### Contract Test Behaviors

Each contract test must verify:
1. Happy path (valid input → expected output)
2. Error case (invalid input → proper error result)
3. Type conformance (return types match port interface)
