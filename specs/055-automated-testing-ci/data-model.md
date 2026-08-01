# Data Model: CI Workflow Structure

**Feature**: 055-automated-testing-ci
**Date**: 2026-01-26

## Overview

This document defines the structure of CI workflow components, their relationships, and data flow. Unlike typical data models for application features, this describes GitHub Actions workflow entities.

## Workflow Entities

### Workflow Run

A single execution of the CI pipeline.

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | number | GitHub-assigned run ID |
| `workflow_id` | string | Workflow file name (e.g., `ci.yml`) |
| `head_sha` | string | Git commit SHA that triggered the run |
| `head_branch` | string | Branch name (e.g., `055-automated-testing-ci`) |
| `event` | enum | `push`, `pull_request`, `workflow_dispatch` |
| `status` | enum | `queued`, `in_progress`, `completed` |
| `conclusion` | enum | `success`, `failure`, `cancelled`, `skipped` |
| `created_at` | datetime | Run creation timestamp |
| `updated_at` | datetime | Last status update timestamp |

**Relationships**:
- Contains 0..n Jobs
- Produces 0..n Artifacts

### Job

A unit of work within a workflow run.

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | number | GitHub-assigned job ID |
| `name` | string | Display name (e.g., "Unit Tests") |
| `status` | enum | `queued`, `in_progress`, `completed` |
| `conclusion` | enum | `success`, `failure`, `cancelled`, `skipped` |
| `started_at` | datetime | Job start timestamp |
| `completed_at` | datetime | Job completion timestamp |
| `runner_name` | string | GitHub runner that executed the job |

**Relationships**:
- Belongs to 1 Workflow Run
- Has 0..n dependencies on other Jobs (`needs`)
- Contains 1..n Steps
- Produces 0..n Artifacts

### Job Dependency Graph

```text
┌─────────────────────────────────────────────────────────────────┐
│                         ci.yml Jobs                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [lint] ─────────┐                                              │
│                  ├──► [unit-tests] ──┬──► [contract]            │
│  [typecheck] ────┘        │          │                          │
│                           │          ├──► [integration]         │
│  [build] ────────────────┬┘          │                          │
│         │                │           └──► [security]            │
│         │                │                    │                 │
│         │                │                    │                 │
│         └──► [e2e-tests] ◄────────────────────┘                 │
│                   │                                              │
│                   │      ┌──────────────────────────┐           │
│                   │      │  e2e-tests (matrix)      │           │
│                   │      │  ├─ firefox-e2e          │           │
│                   │      │  └─ chromium-extension   │           │
│                   │      └──────────────────────────┘           │
│                   │                                              │
│                   └────────────────────┐                        │
│                                        │                        │
│  [visual-tests] ──────────────────────►├──► [ci-success]        │
│                                        │                        │
│  [lint, typecheck, unit-tests,         │                        │
│   contract, integration, security] ────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Step

An individual command or action within a job.

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Display name (e.g., "Install dependencies") |
| `uses` | string | Action reference (e.g., `actions/checkout@v4`) |
| `run` | string | Shell command to execute |
| `if` | string | Conditional execution expression |
| `env` | object | Environment variables |
| `with` | object | Action input parameters |

### Artifact

A file or directory produced by a job.

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Artifact identifier (e.g., `coverage-report`) |
| `path` | string | Source path(s) to upload |
| `retention_days` | number | Days before automatic deletion |
| `if_no_files_found` | enum | `warn`, `error`, `ignore` |

**Artifact Naming Convention**:
```
{type}-{context}-{identifier}
```

Examples:
- `coverage-report` - Coverage data
- `playwright-report-firefox` - E2E test report for Firefox
- `test-results-chromium` - Test artifacts for Chromium
- `extension-firefox-abc123` - Built extension with commit SHA

### Check

A status indicator displayed on GitHub PRs.

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Check name from workflow job |
| `status` | enum | `queued`, `in_progress`, `completed` |
| `conclusion` | enum | `success`, `failure`, `neutral`, `cancelled`, `skipped` |
| `required` | boolean | Whether check blocks PR merge |

**Required Checks** (for branch protection):
- `CI / CI Success` - Single aggregation check

## State Transitions

### Workflow Run Lifecycle

```text
     ┌─────────┐
     │ queued  │
     └────┬────┘
          │ runner available
          ▼
   ┌─────────────┐
   │ in_progress │
   └──────┬──────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌─────────┐ ┌──────────┐
│ success │ │ failure  │
└─────────┘ └──────────┘
```

### Job State Machine

```text
                    ┌─────────────────────────┐
                    │                         │
                    ▼                         │
              ┌─────────┐                     │
              │ queued  │                     │
              └────┬────┘                     │
                   │ dependencies met         │
                   │ + runner available       │
                   ▼                          │
            ┌─────────────┐                   │
            │ in_progress │                   │
            └──────┬──────┘                   │
                   │                          │
     ┌─────────────┼─────────────┐            │
     │             │             │            │
     ▼             ▼             ▼            │
┌─────────┐  ┌──────────┐  ┌───────────┐     │
│ success │  │ failure  │  │ cancelled │◄────┘
└─────────┘  └──────────┘  └───────────┘
                              (concurrency cancel)
```

## Coverage Report Structure

Coverage data uploaded to Codecov follows this structure:

```json
{
  "coverage": {
    "src/core/playback/playback-service.ts": {
      "1": 1,    // line 1: covered (1 hit)
      "2": 0,    // line 2: not covered
      "3": null  // line 3: not executable
    }
  },
  "totals": {
    "lines": { "percent": 75.5, "covered": 755, "total": 1000 },
    "branches": { "percent": 62.3, "covered": 312, "total": 500 },
    "functions": { "percent": 80.2, "covered": 401, "total": 500 }
  }
}
```

### Coverage Thresholds

| Scope | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| Global | 70% | 60% | 70% |
| `src/core/**` | 85% | 75% | 85% |
| `src/adapters/**` | 80% | 70% | 80% |

## Environment Variables

### Workflow-Level

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_VERSION` | Node.js version for all jobs | `20` |
| `CI` | Indicates CI environment | `true` |

### Job-Level Secrets

| Secret | Jobs | Purpose |
|--------|------|---------|
| `GITHUB_TOKEN` | All | Repository access (auto-provided) |
| `CODECOV_TOKEN` | unit-tests | Coverage upload (optional for public repos) |
| `LOKI_URL` | e2e-tests | Telemetry testing (optional) |
| `LOKI_USER` | e2e-tests | Telemetry testing (optional) |
| `LOKI_PASSWORD` | e2e-tests | Telemetry testing (optional) |

## Validation Rules

### Workflow Validation

1. All job names must be unique within workflow
2. `needs` references must point to existing jobs
3. No circular dependencies in job graph
4. Concurrency group must be unique per branch

### Artifact Validation

1. Artifact names must be unique per workflow run
2. Paths must not include sensitive files (`.env`, credentials)
3. Retention days must be between 1 and 90

### Coverage Validation

1. Coverage report must be valid LCOV format
2. Global threshold failures must block CI
3. Per-directory thresholds are advisory (logged but don't fail)
