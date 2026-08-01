# Research: Development Quality Automation

**Feature**: 073-dev-quality-automation | **Date**: 2026-03-03

---

## R1: Pre-Commit Hook Tooling

**Decision**: Lefthook

**Rationale**: Fastest option (Go binary, 3-8s vs 8-15s for Husky). Supports parallel hook execution out-of-the-box — Biome lint + tsc type-check can run simultaneously. Growing adoption in monorepos (n8n, Codmon). Language-agnostic.

**Alternatives considered**:
- **Husky + lint-staged**: Most mature ecosystem, excellent pnpm monorepo docs. Rejected due to sequential-only execution and Node.js startup overhead.
- **simple-git-hooks**: Simplest setup but no monorepo-specific features, no parallel execution, minimal documentation for workspaces.

**Key findings**:
- Lefthook requires explicit `root` directive for monorepos (GitHub issue #443 has clear solution)
- Biome `--staged` flag runs in 1-3 seconds for typical changes
- TypeScript Project References enable incremental type-checking (2-5s for staged TS)
- Jest full suite too slow for pre-commit; use `--filter` by affected package or defer to CI

---

## R2: CI/CD Quality Gates

**Decision**: Codecov + audit-ci + license-checker + size-limit + GitHub Actions matrix strategy

**Rationale**: All free for small teams (Codecov free for ≤5 users). Minimal configuration overhead. Native GitHub Actions integration.

**Alternatives considered**:
- **Coveralls**: Similar to Codecov but less monorepo-aware
- **Snyk**: More powerful but paid for CI integration; audit-ci covers npm audit adequately
- **Bundlewatch**: Viable alternative to size-limit; size-limit chosen for tighter Vite integration

**Key findings**:
- Current extension jest coverage thresholds: 35% (need to raise to 60%)
- Current server CI: single job (lint + test + build sequential) — needs matrix parallelization
- Extension CI: 3 jobs (test, visual-tests, e2e-tests) — already somewhat parallel
- Matrix strategy: `{extension-unit, extension-e2e, server-unit, shared-unit}` run concurrently
- Coverage delta enforcement: Codecov `patch` coverage requires new code to meet threshold
- `audit-ci --high` blocks PRs on high/critical vulnerabilities
- `license-checker --failOn "GPL-2.0;GPL-3.0"` ensures AGPL compatibility (GPL deps are fine in AGPL project, but proprietary deps aren't)
- `size-limit` tracks extension bundle size against 4MB threshold

---

## R3: E2E Extension Testing with Playwright

**Decision**: Chromium-based extension testing in Docker (Firefox extension testing NOT supported by Playwright)

**Rationale**: Playwright officially supports loading extensions in Chromium via `--load-extension` flag but has no equivalent for Firefox. The current project architecture (Chromium for extension UI testing, Firefox for page-level tests) is correct.

**Alternatives considered**:
- **Firefox extension E2E via web-ext + Selenium**: Possible but fragile, no community support
- **Manual Firefox testing only**: Acceptable for release validation but not CI automation

**Key findings**:
- Chromium extension loading: `chromium.launchPersistentContext('', { args: ['--disable-extensions-except=path', '--load-extension=path'] })`
- Docker approach: `mcr.microsoft.com/playwright` image with `--headless=new` and `--shm-size=1gb`
- Extension popup accessible via `chrome-extension://<id>/popup.html`
- Service worker accessible via `chrome://serviceworker-internals`
- Background page events can be captured via `context.serviceWorkers()`
- Current E2E setup exists but tests are skeletal — need real user journey tests
- Flakiness mitigation: deterministic test data, retry logic (max 2 retries), Docker-based browser

---

## R4: Zod Validation Strategy

**Decision**: nestjs-zod v5.1 for server; shared Zod schemas in `@proso/shared`; incremental migration

**Rationale**: Extension already uses Zod 4.3.4 extensively. Server controllers currently accept unvalidated request bodies. nestjs-zod provides NestJS pipe integration with minimal boilerplate. Shared schemas prevent type drift between packages.

**Alternatives considered**:
- **class-validator + class-transformer**: NestJS default, but requires decorators and doesn't share schemas with extension
- **Manual Zod pipes**: More control but reinvents nestjs-zod functionality
- **tRPC**: Full-stack type safety but requires major architecture change

**Key findings**:
- Extension Zod usage: `src/utils/messaging/schemas.ts` defines 37+ message schemas
- Server has 0 Zod usage currently — all DTOs are plain TypeScript interfaces
- Shared package exports TypeScript types but no runtime schemas
- Migration path: (1) Add Zod schemas to `@proso/shared/schemas/`, (2) Server controllers adopt `ZodValidationPipe`, (3) Extension validates server responses at boundary
- Bundle impact: Zod tree-shakes well; unused schemas eliminated from extension build
- Server endpoints to validate: `POST /tts/synthesize`, `POST /license/validate`, `GET /credits/balance`, `POST /credits/deduct`

---

## R5: Test Coverage Gap Inventory

**Decision**: Prioritize untested adapters and handlers; raise thresholds incrementally

**Findings**:

### Extension (19/22 adapter files untested)
| Category | Untested Files |
|----------|---------------|
| Audio adapters | `browser-tts.adapter.ts`, `elevenlabs.adapter.ts`, `openai.adapter.ts`, `server-proxy.adapter.ts` |
| Cache adapters | `indexeddb-cache.adapter.ts`, `in-memory-cache.adapter.ts` |
| Content adapters | `readability-extractor.adapter.ts`, `trafilatura-scorer.adapter.ts` |
| Messaging adapters | `content-script-highlight.adapter.ts`, `content-script-messaging.adapter.ts` |
| Storage adapters | `browser-settings.adapter.ts`, `browser-audio-url.adapter.ts` |
| Queue adapters | `dexie-queue.adapter.ts` |
| Handlers | `credit.handlers.ts` (0 tests) |

### Server (30% coverage ratio)
- 20 test files for 66 source files
- Missing: most adapter tests, infrastructure tests, guard tests

### Coverage Threshold Ramp
| Phase | Statements | Branches | Functions | Lines |
|-------|-----------|----------|-----------|-------|
| Current | 35% | 35% | 35% | 35% |
| Phase 1 (this feature) | 60% | 50% | 55% | 60% |
| Phase 2 (future) | 75% | 65% | 70% | 75% |

---

## R6: Integration/Wiring Test Patterns

**Decision**: Composition root verification tests + handler registry tests + adapter contract tests

**Findings**:
- Composition root (`src/composition/container.ts`) wires all adapters — tests should verify singleton instances are shared correctly (prevents dual-cache-split bugs)
- Handler registry (`src/handlers/registry.ts`) should have completeness test: every message type in protocol has a registered handler
- Contract tests already exist for some ports — need to extend to all 6 port interfaces
- Server module tests: NestJS `Test.createTestingModule()` verifies DI wiring
