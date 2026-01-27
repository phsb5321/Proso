# Branch Protection Configuration Guide

This document describes how to configure branch protection rules for VoxPage to enforce CI checks before merging.

## Prerequisites

- Repository administrator access
- CI workflow (`ci.yml`) must be working and running successfully

## Required Status Checks

Configure branch protection to require the **CI Success** job as the single required status check:

### GitHub Settings

1. Navigate to **Settings** → **Branches**
2. Click **Add branch protection rule** (or edit existing rule)
3. Set **Branch name pattern**: `main`
4. Enable the following options:

#### Required Settings

- [x] **Require a pull request before merging**
  - [x] Require approvals: `1` (or your team's preference)
  - [x] Dismiss stale pull request approvals when new commits are pushed

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Search and select: **`CI / CI Success`**

- [x] **Do not allow bypassing the above settings**

#### Optional Settings

- [ ] Require signed commits (recommended for production)
- [ ] Require linear history (prevents merge commits)
- [ ] Include administrators (recommended)

## Status Check Name

The single required status check is:

```
CI / CI Success
```

This aggregation job depends on all other CI jobs and will only pass if:
- Lint passes
- Type check passes
- Unit tests pass
- Contract tests pass
- Integration tests pass (or are skipped if no files)
- Security tests pass
- E2E tests pass (both Firefox and Chromium)
- Quality checks pass

Visual tests are non-blocking (continue-on-error) and won't fail the CI Success job.

## CI Workflow Architecture

```
                    Push/PR Trigger
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
      ┌────────┐    ┌──────────┐    ┌────────┐
      │  Lint  │    │Typecheck │    │  Build │
      │  30s   │    │   30s    │    │   60s  │
      └────┬───┘    └────┬─────┘    └────┬───┘
           │              │              │
           └──────────────┼──────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │   Unit Tests    │
                │  + Coverage     │
                │      60s        │
                └────────┬────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ▼             ▼             ▼
      ┌─────────┐  ┌──────────┐  ┌─────────┐
      │Contract │  │ Security │  │Quality  │
      │  30s    │  │   10s    │  │  30s    │
      └────┬────┘  └────┬─────┘  └────┬────┘
           │             │             │
           └─────────────┼─────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │    E2E Matrix      │
              │ Firefox │ Chromium │
              │   3m    │    3m    │
              └──────────┬─────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   CI Success       │
              │  (Aggregation)     │
              └────────────────────┘
```

**Total Time**: ~8 minutes (parallel execution)

## Bypass Procedures

In emergency situations where CI is broken but a fix needs to merge:

1. **Do NOT disable branch protection** - this affects all PRs
2. Use the "Bypass branch protections" permission (requires admin/maintainer role)
3. Document the bypass reason in the PR description
4. Create a follow-up issue to fix the CI problem

## Troubleshooting

### "CI Success" check not appearing

- Ensure the workflow has run at least once on the branch
- Check that the workflow name matches: `CI` and job name is `ci-success`
- Verify the workflow triggers include your branch

### Check is stuck in "pending"

- Check GitHub Actions page for queued/stuck jobs
- Verify concurrency settings aren't blocking the run
- Check for runner availability issues

### Visual tests failing but CI Success passing

This is expected behavior. Visual tests use `continue-on-error: true` and are non-blocking.
Review visual test failures manually to determine if changes are intentional.

## Release Workflow Test Gate

The release workflow (`.github/workflows/release.yml`) includes a mandatory test job that must pass before releases are published.

### Release Flow

```
Tag Push / workflow_dispatch
        │
        ▼
   ┌─────────┐
   │Validate │ ← Version format check
   └────┬────┘
        │
        ▼
   ┌─────────┐
   │  Test   │ ← Lint + Unit tests + Quality checks
   └────┬────┘
        │
        ▼
   ┌─────────┐
   │  Build  │ ← Builds for Firefox & Chrome
   └────┬────┘
        │
        ▼
   ┌─────────┐
   │ Release │ ← Creates GitHub Release + uploads artifacts
   └─────────┘
```

### Key Protections

1. **Test job must pass** - Build job has `needs: [validate, test]`
2. **No continue-on-error** - Test failures block the release
3. **Artifact validation** - `if-no-files-found: error` ensures build artifacts exist
4. **30-day retention** - Release artifacts are kept for 30 days

### Manual Release

To trigger a manual release:

```bash
gh workflow run release.yml -f version=1.2.3 -f prerelease=false
```

## Related Documentation

- [CI Workflow](.github/workflows/ci.yml)
- [Release Workflow](.github/workflows/release.yml)
- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
