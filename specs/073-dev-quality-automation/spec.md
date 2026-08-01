# Feature 073: Development Quality Automation

**Status**: Draft
**Created**: 2026-03-03
**Branch**: `073-dev-quality-automation`

---

## Problem Statement

Proso is a maturing product with a monorepo (extension + NestJS server + shared types) containing 2400+ tests, hexagonal architecture, and production deployments. However, the development workflow has significant quality and efficiency gaps:

1. **No pre-commit validation** — developers can push broken code, lint violations, and type errors directly to branches. The CI pipeline catches issues only after push, wasting time.
2. **Critical test coverage gaps** — 12 of 16 extension adapters are untested, credit handlers have no tests, and 67% of utility modules lack adequate test coverage. The server has only 30% coverage ratio (20 test files for 66 source files).
3. **No automated user simulation** — there are Playwright configs for visual/e2e testing, but no automated user journey tests that simulate real usage flows (install extension → navigate to page → trigger TTS → verify audio plays → check cache works).
4. **Runtime validation inconsistencies** — the extension uses Zod extensively for message validation, but the server controllers accept unvalidated request bodies, and the shared package has zero runtime validation.
5. **CI/CD gaps** — no PR quality gates (test coverage thresholds per-PR), no automated dependency audits, no performance regression detection, and no canary/staged deployment strategy.
6. **Bug detection is manual** — bugs like the dual-cache split (feature 072) go undetected because there are no integration tests verifying that the cache adapter and cache handlers share the same store instance.

---

## User Scenarios & Testing

### Scenario 1: Developer Commits Code

**Actor**: Developer (contributor or maintainer)

**Flow**:
1. Developer makes changes to extension or server code
2. Before committing, automated checks run locally: type-checking, linting, and relevant unit tests
3. Developer commits — pre-commit hooks validate staged files pass lint and type checks
4. Developer pushes — CI pipeline runs full test suite with coverage analysis
5. PR is opened — automated quality report appears as PR comment showing coverage delta, test results, and flagged issues

**Acceptance Criteria**:
- Commits with type errors or lint violations are blocked locally before reaching CI
- PR reviews include automated test coverage delta (no decrease allowed without justification)
- Failed CI blocks merge to main

### Scenario 2: Automated Bug Detection via Integration Tests

**Actor**: CI system

**Flow**:
1. CI runs integration test suites that verify cross-module wiring (e.g., cache adapter uses same store as cache handlers)
2. Contract tests verify all adapter implementations satisfy their port interfaces
3. Message protocol tests verify all registered handlers respond correctly to their expected message types
4. Results are reported with clear failure messages identifying the broken contract or wiring issue

**Acceptance Criteria**:
- Wiring bugs (like the dual-cache split) are caught automatically before merge
- Every port interface has at least one contract test
- Every registered message handler has at least one test

### Scenario 3: User Journey Simulation

**Actor**: Automated test runner (Playwright)

**Flow**:
1. Extension is built and loaded in a test browser
2. Test navigates to a sample page with article content
3. Test triggers TTS playback via the popup or paragraph click
4. Test verifies: footer appears, audio status updates, paragraph highlighting works
5. Test stops and replays — verifies cache hit (no new API call)
6. Test checks error states: invalid API key, network failure, empty page

**Acceptance Criteria**:
- Core user journey (page load → playback → cache reuse) passes in CI
- Error scenarios are covered (graceful degradation verified)
- Tests run against the actual built extension (not mocked browser APIs)

### Scenario 4: Dependency and Security Auditing

**Actor**: CI system (scheduled + on PR)

**Flow**:
1. On every PR, `pnpm audit` runs to check for known vulnerabilities
2. Weekly scheduled job checks for outdated dependencies
3. License compliance is verified (no GPL-incompatible deps in AGPL project)
4. Results are posted as PR comments or Slack notifications

**Acceptance Criteria**:
- PRs with critical/high vulnerabilities are blocked
- Dependency update recommendations are generated weekly
- No new dependency with incompatible license can be merged

---

## Functional Requirements

### FR-001: Pre-Commit Quality Gates

The system must run automated validation on staged files before each commit:
- TypeScript type-checking on changed files
- Biome lint on changed files
- Relevant unit tests for changed modules (test file association by naming convention)

Commits that fail any check are rejected with clear error messages showing what failed and how to fix it.

### FR-002: Comprehensive Test Coverage Enforcement

The CI pipeline must:
- Calculate test coverage per package (extension, server, shared)
- Enforce minimum coverage thresholds: 60% statements, 50% branches, 55% functions, 60% lines
- Report coverage delta on PRs (coverage cannot decrease without explicit override)
- Flag untested source files in PR review

### FR-003: Integration & Wiring Tests

The test suite must include integration tests that verify:
- Composition root wires adapters correctly (singleton cache, correct provider selection)
- Handler registry contains all expected handlers and they respond to messages
- Server module dependency injection provides correct implementations for all ports
- Extension ↔ server communication works end-to-end (API contract compliance)

### FR-004: User Journey E2E Tests

Playwright-based E2E tests must cover:
- Extension installation and popup interaction
- Article mode: extract text → play → pause → resume → stop
- Paragraph click: click paragraph → playback starts from that paragraph
- Cache verification: replay same content → no new TTS generation
- Settings: change provider/voice/speed → verify settings persist
- Error handling: invalid API key → user sees clear error message
- Footer player: appears during playback, controls work, minimizes/expands

### FR-005: Runtime Validation Standardization

All data boundaries must use Zod schemas for runtime validation:
- Server controller request bodies validated via Zod schemas
- Shared package exports include Zod schemas alongside TypeScript types
- Extension ↔ server API responses validated at the boundary
- Invalid data produces structured error responses (not 500 errors)

### FR-006: CI/CD Pipeline Enhancements

The CI/CD pipeline must include:
- Parallel test execution (extension tests + server tests run concurrently)
- Dependency vulnerability scanning on every PR
- Build artifact size tracking (warn if extension exceeds 4MB)
- Automated changelog generation from conventional commits
- PR merge requirements: all CI checks pass, coverage threshold met, no critical vulnerabilities

### FR-007: Automated Test Generation Assistance

The development workflow must support:
- A test scaffold command that generates test boilerplate for untested source files
- Contract test templates for new adapter implementations
- Handler test templates when new message handlers are registered
- Documentation of testing patterns and conventions

---

## Success Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Pre-commit validation prevents broken commits | Percentage of CI failures caused by type/lint errors | < 5% (down from current ~20%) |
| Test coverage | Overall statement coverage across all packages | > 60% |
| Adapter test coverage | Percentage of adapters with contract tests | 100% |
| Handler test coverage | Percentage of message handlers with tests | 100% |
| User journey test pass rate | E2E test reliability in CI | > 95% |
| Bug detection before merge | Wiring/integration bugs caught in PR | > 90% |
| PR feedback time | Time from push to CI results | < 10 minutes |
| Dependency vulnerability exposure | Critical vulnerabilities in dependencies | 0 unresolved after 7 days |

---

## Scope

### In Scope

- Pre-commit hooks (husky + lint-staged or equivalent)
- CI pipeline improvements (coverage, vulnerability scanning, parallel execution)
- Integration/wiring tests for critical paths (cache, playback, handler registry)
- Playwright E2E user journey tests
- Zod validation for server request DTOs
- Test scaffolding tooling
- Coverage threshold enforcement

### Out of Scope

- Performance benchmarking and regression detection (future feature)
- Canary/staged deployment strategy (requires infrastructure changes)
- Visual regression test improvements (already functional)
- Load testing and stress testing
- Monitoring and alerting (separate concern)
- Paddle SDK integration (separate feature, billing-specific)
- Redis cache swap for server (infrastructure concern)

---

## Dependencies

- Existing Jest + Playwright test infrastructure
- GitHub Actions CI/CD pipeline
- pnpm workspace monorepo structure
- Biome linter configuration
- Docker-based Playwright (per project requirements)

---

## Assumptions

- Developers use pnpm as their package manager (enforced by monorepo config)
- Pre-commit hooks can run in under 30 seconds for typical changes
- E2E tests can run against the built extension in headless Firefox via Playwright
- Coverage thresholds will be ramped up gradually (60% initial, increasing over time)
- The server already has testcontainers configured for PostgreSQL-backed contract tests
- Biome is the sole linter (no ESLint migration needed)

---

## Key Entities

| Entity | Description |
|--------|-------------|
| Test Suite | Collection of tests organized by type (unit, contract, integration, e2e, security) |
| Coverage Report | Per-package breakdown of statement, branch, function, and line coverage |
| Quality Gate | Automated check that must pass before code can be merged |
| Validation Schema | Zod schema defining the shape and constraints of data at a boundary |
| User Journey | End-to-end test simulating a complete user workflow through the extension |
| Contract Test | Test verifying an adapter correctly implements its port interface |
| Wiring Test | Integration test verifying composition root connects components correctly |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pre-commit hooks slow developer workflow | Medium | Medium | Only run checks on staged files; skip hooks with `--no-verify` for WIP commits |
| E2E tests are flaky in CI | High | Medium | Retry logic, Docker-based browser, deterministic test data |
| Coverage thresholds block urgent hotfixes | Low | High | Override mechanism for maintainers; hotfix branch exempt |
| Zod schema additions increase bundle size | Low | Low | Tree-shaking removes unused schemas; monitor bundle size in CI |
