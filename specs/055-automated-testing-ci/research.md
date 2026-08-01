# Research: Automated Testing Infrastructure & CI/CD Best Practices

**Feature**: 055-automated-testing-ci
**Date**: 2026-01-26
**Status**: Complete

## Research Questions

### RQ-001: Workflow Consolidation Strategy

**Question**: Should we consolidate `ci.yml` and `test.yml` or keep them separate?

**Research Findings**:

1. **Current State Analysis**:
   - `ci.yml` (275 lines): Runs on push/PR to develop/main. Contains: lint, unit tests, build, Firefox validation, visual tests, E2E tests
   - `test.yml` (325 lines): Runs on push/PR to main only. Contains: lint, unit tests, contract tests, integration, visual, security, E2E
   - **Overlap**: Both run lint, unit tests, visual tests, E2E tests
   - **Unique to ci.yml**: Firefox build validation, extension size check
   - **Unique to test.yml**: Contract tests, integration tests, security tests, Codecov upload

2. **GitHub Actions Best Practices** (from GitHub documentation):
   - "Consolidate workflows when they have similar triggers and jobs" ([GitHub Docs: Workflow optimization](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions))
   - Separate workflows when you need different permissions or different trigger conditions

3. **Decision**: Consolidate into single `ci.yml`

**Rationale**:
- Both workflows have the same trigger (push/PR to main/develop)
- Current setup runs duplicate jobs (lint, unit, E2E) wasting CI minutes
- Single workflow easier to maintain and debug
- Can use `needs` dependencies to create logical job ordering

**Alternatives Rejected**:
- Keep separate: Would continue wasting CI minutes on duplicates
- Create third "full" workflow: Adds complexity without benefit

---

### RQ-002: Coverage Platform Selection

**Question**: Which coverage platform to use: Codecov, Coveralls, or native GitHub?

**Research Findings**:

| Platform | Free Tier | PR Comments | Badges | Thresholds | Integration Effort |
|----------|-----------|-------------|--------|------------|-------------------|
| **Codecov** | Unlimited public, 5 users private | Yes | Yes | Yes | Low (action exists) |
| **Coveralls** | Unlimited public, limited private | Yes | Yes | Limited | Low (action exists) |
| **GitHub Native** | Unlimited | Manual | No | Manual | High (custom code) |

**Current State**: `test.yml` already has Codecov action configured but `fail_ci_if_error: false`

**Decision**: Use Codecov

**Rationale**:
- Already partially integrated (just needs threshold enforcement)
- Industry standard for open-source projects
- Excellent PR comment UX showing coverage diff
- Supports per-directory thresholds matching Constitution (core 85%, adapters 80%)

**Alternatives Rejected**:
- Coveralls: Similar features but Codecov already configured
- GitHub Native: Would require custom implementation effort

---

### RQ-003: E2E Browser Matrix Strategy

**Question**: How to structure E2E tests across Firefox and Chromium?

**Research Findings**:

1. **Current Configuration**:
   - `playwright.config.js` defines 3 projects: `firefox-visual`, `firefox-e2e`, `chromium-extension`
   - Firefox E2E requires headed mode (`headless: false`) for extension loading
   - Chromium extension tests use persistent context fixture

2. **Matrix Strategy Options**:
   - **fail-fast: true** (default): Cancel all jobs if one fails
   - **fail-fast: false**: Let all jobs complete regardless of failures

3. **Decision**: Use `fail-fast: false` with matrix strategy

**Rationale**:
- If Firefox tests fail, we still want to see if Chrome tests pass (helps identify browser-specific issues)
- Both results visible in single PR check summary
- Reduces overall CI time vs sequential execution

**Implementation**:
```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - browser: firefox
        project: firefox-e2e
        build-target: firefox
      - browser: chromium
        project: chromium-extension
        build-target: chrome
```

---

### RQ-004: Caching Strategy

**Question**: What should be cached to optimize CI time?

**Research Findings**:

1. **pnpm Store Cache**:
   - pnpm/action-setup@v4 handles store caching automatically when `cache: 'pnpm'` is set
   - Key: `pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}`
   - Saves ~30-60 seconds per job

2. **Playwright Browser Cache**:
   - Browsers are ~300MB each (Firefox, Chromium)
   - Cache key should include Playwright version to avoid incompatibility
   - Pattern: `playwright-${{ runner.os }}-${{ playwright-version }}`
   - Saves ~2-3 minutes per E2E job

3. **Build Artifact Sharing**:
   - Use `actions/upload-artifact` + `actions/download-artifact` to share build between jobs
   - More reliable than caching for job dependencies
   - Current workflows already do this

**Decision**: Implement both pnpm and Playwright caching

**Implementation**:
```yaml
# pnpm caching (via action)
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'pnpm'

# Playwright caching (manual)
- name: Get Playwright version
  id: pw-version
  run: echo "version=$(pnpm ls @playwright/test --json | jq -r '.[0].devDependencies["@playwright/test"].version')" >> $GITHUB_OUTPUT

- uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.pw-version.outputs.version }}

- if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps
```

---

### RQ-005: Branch Protection Configuration

**Question**: How to enforce CI checks before merge?

**Research Findings**:

1. **GitHub Branch Protection Rules** (cannot be set via code, must be configured in UI):
   - Settings → Branches → Add rule
   - Require status checks: Select specific job names
   - Require branches to be up to date: Forces rebase/merge before PR merge

2. **Aggregation Job Pattern**:
   - Create a final "ci-success" job that depends on all others
   - Single check to add to branch protection
   - Simplifies configuration and provides clear pass/fail

3. **Required Checks Selection**:
   - Option A: Add each job individually (lint, typecheck, unit, contract, e2e-firefox, e2e-chrome)
   - Option B: Add single aggregation job (ci-success)
   - **Decision**: Option B (simpler, single source of truth)

**Implementation**:
```yaml
ci-success:
  name: CI Success
  runs-on: ubuntu-latest
  needs: [lint, typecheck, unit-tests, contract, integration, security, e2e-tests]
  if: always()
  steps:
    - name: Check all jobs passed
      run: |
        if [[ "${{ needs.lint.result }}" != "success" ]] || \
           [[ "${{ needs.typecheck.result }}" != "success" ]] || \
           [[ "${{ needs.unit-tests.result }}" != "success" ]] || \
           [[ "${{ needs.contract.result }}" != "success" ]] || \
           [[ "${{ needs.integration.result }}" != "success" ]] || \
           [[ "${{ needs.security.result }}" != "success" ]] || \
           [[ "${{ needs.e2e-tests.result }}" != "success" ]]; then
          echo "One or more jobs failed"
          exit 1
        fi
```

---

### RQ-006: Flaky Test Handling

**Question**: How to handle intermittently failing tests?

**Research Findings**:

1. **Playwright Retries**:
   - Built-in retry mechanism: `retries: 2` in playwright.config.js
   - Current config: `retries: process.env.CI ? 2 : 1`
   - Already properly configured

2. **Jest Retries**:
   - Use `jest-circus` (default in Jest 27+) with `--runInBand` for flaky tests
   - Or use `jest.retryTimes(2)` in individual tests
   - Not recommended for unit tests (should be deterministic)

3. **Detection Strategies**:
   - Track test pass rate over time (requires external tooling)
   - Manual quarantine via `test.skip` with comment
   - GitHub Actions test analytics (limited to public beta)

**Decision**: Keep current Playwright retry configuration; don't add Jest retries

**Rationale**:
- E2E tests are inherently more prone to flakiness (network, timing)
- Unit tests should be deterministic; retries mask underlying issues
- Current config already handles E2E flakiness

---

### RQ-007: Artifact Retention Policy

**Question**: How long to retain CI artifacts?

**Research Findings**:

1. **GitHub Actions Limits**:
   - Default retention: 90 days
   - Minimum: 1 day
   - Maximum: 400 days (enterprise) or 90 days (public)
   - Storage counts against plan limits

2. **Artifact Categories**:
   - **Debug artifacts** (screenshots, traces, logs): Needed for debugging recent failures
   - **Build artifacts** (extension zips): Needed for release verification
   - **Coverage reports**: Useful for trend analysis

3. **Decision**: Tiered retention policy

| Artifact Type | Retention | Rationale |
|---------------|-----------|-----------|
| Failure screenshots/traces | 7 days | Short-term debugging |
| Build artifacts | 7 days | Can rebuild from commit |
| Coverage reports | 7 days | Codecov stores history externally |
| Release artifacts | 30 days | Longer for release verification |

---

### RQ-008: Concurrency Control

**Question**: How to handle multiple workflow runs on same branch?

**Research Findings**:

1. **Problem**: If developer pushes multiple commits, multiple workflows start
2. **Solutions**:
   - `concurrency` setting with `cancel-in-progress: true`
   - Group by branch + workflow name

**Decision**: Implement concurrency control

**Implementation**:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Rationale**:
- Saves CI minutes by canceling outdated runs
- Latest commit is what matters for PR validation
- Standard practice for most GitHub Actions workflows

---

## Summary of Decisions

| Decision | Choice | Key Rationale |
|----------|--------|---------------|
| Workflow structure | Single consolidated `ci.yml` | Reduces duplication, easier maintenance |
| Coverage platform | Codecov | Already integrated, excellent PR UX |
| E2E strategy | Matrix with `fail-fast: false` | See both browser results |
| Caching | pnpm store + Playwright browsers | Saves ~3-4 minutes per run |
| Branch protection | Single aggregation job | Simpler configuration |
| Flaky test handling | Playwright retries only | E2E flakiness expected, unit tests should be stable |
| Artifact retention | 7 days (failures), 30 days (releases) | Balance storage vs debugging needs |
| Concurrency | Cancel in-progress on new push | Save CI minutes |

## Open Items

None - all research questions resolved.
