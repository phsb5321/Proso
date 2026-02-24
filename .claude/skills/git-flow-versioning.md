---
name: git-flow-versioning
description: Manages Git Flow branching strategy, semantic versioning, releases, and tags. Use when creating releases, bumping versions, managing branches, or asking about release process.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(./scripts/*), Read, Grep, Glob
---

# Git Flow & Versioning Guide

This skill provides guidance for Proso's Git Flow branching strategy, semantic versioning, and release process.

## Branch Strategy

Proso uses a modified Git Flow with protected branches:

```
main (protected)
  │
  ├── Protected: requires PR, 1 approval, status checks
  ├── Production-ready code only
  ├── Tagged releases (v1.0.0, v1.1.0, etc.)
  │
  └─── develop (protected)
         │
         ├── Protected: requires status checks
         ├── Integration branch for features
         │
         └─── feature/NNN-description
                │
                ├── Feature development
                └── Merges to develop via PR
```

### Branch Types

| Branch | Purpose | Protection | Merge Target |
|--------|---------|------------|--------------|
| `main` | Production releases | PR required, 1 approval, tests pass | - |
| `develop` | Integration branch | Tests must pass | `main` (releases only) |
| `NNN-feature-name` | Feature development | None | `develop` |
| `hotfix/NNN-desc` | Emergency fixes | None | `main` AND `develop` |
| `release/X.Y.Z` | Release preparation | None | `main` AND `develop` |

### Branch Naming Convention

```
# Feature branches (most common)
NNN-feature-name
039-audio-caching
040-settings-redesign

# Hotfix branches (emergency fixes for production)
hotfix/NNN-description
hotfix/041-fix-playback-crash

# Release branches (version preparation)
release/X.Y.Z
release/1.2.0
```

## Semantic Versioning

Proso follows [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH[-PRERELEASE]

1.0.0       # Initial release
1.0.1       # Patch: bug fixes
1.1.0       # Minor: new features, backwards compatible
2.0.0       # Major: breaking changes
2.0.0-beta.1  # Pre-release
```

### When to Bump Each Component

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix, no API change | PATCH | 1.0.0 → 1.0.1 |
| New feature, backwards compatible | MINOR | 1.0.1 → 1.1.0 |
| Breaking change, API incompatibility | MAJOR | 1.1.0 → 2.0.0 |
| Pre-release testing | PRERELEASE | 2.0.0-beta.1 |

### Version Management Commands

```bash
# Show current version
./scripts/version.sh

# Bump patch version (1.0.0 → 1.0.1)
./scripts/version.sh patch

# Bump minor version (1.0.0 → 1.1.0)
./scripts/version.sh minor

# Bump major version (1.0.0 → 2.0.0)
./scripts/version.sh major

# Set specific version
./scripts/version.sh set 2.0.0-beta.1
```

### Files Updated by Version Script

- `package.json` - npm version
- `manifest.json` - WebExtension version

## Release Process

### Standard Release (from develop to main)

1. **Prepare release branch**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/1.2.0
   ```

2. **Bump version**:
   ```bash
   ./scripts/version.sh set 1.2.0
   git add package.json manifest.json
   git commit -m "chore(release): bump version to 1.2.0"
   ```

3. **Final testing and fixes**:
   ```bash
   pnpm test
   pnpm run quality
   # Fix any issues, commit fixes
   ```

4. **Merge to main**:
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff release/1.2.0 -m "chore(release): merge release/1.2.0"
   ```

5. **Tag the release**:
   ```bash
   git tag -a v1.2.0 -m "Release 1.2.0"
   git push origin main --tags
   ```

6. **Merge back to develop**:
   ```bash
   git checkout develop
   git merge --no-ff release/1.2.0 -m "chore: merge release/1.2.0 back to develop"
   git push origin develop
   ```

7. **Delete release branch**:
   ```bash
   git branch -d release/1.2.0
   git push origin --delete release/1.2.0
   ```

### Automated Release (via GitHub Actions)

Trigger release automatically by pushing a tag:

```bash
# Create and push tag
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0
```

Or use workflow_dispatch:
```bash
# Trigger release workflow manually
gh workflow run release.yml -f version=1.2.0
```

### Hotfix Process

For critical production bugs:

1. **Create hotfix branch from main**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/042-fix-critical-bug
   ```

2. **Fix the issue**:
   ```bash
   # Make fixes
   git add .
   git commit -m "fix: resolve critical playback crash"
   ```

3. **Bump patch version**:
   ```bash
   ./scripts/version.sh patch  # 1.2.0 → 1.2.1
   git add package.json manifest.json
   git commit -m "chore(release): bump version to 1.2.1"
   ```

4. **Merge to main and tag**:
   ```bash
   git checkout main
   git merge --no-ff hotfix/042-fix-critical-bug -m "hotfix: merge hotfix/042-fix-critical-bug"
   git tag -a v1.2.1 -m "Hotfix 1.2.1"
   git push origin main --tags
   ```

5. **Merge to develop**:
   ```bash
   git checkout develop
   git merge --no-ff hotfix/042-fix-critical-bug -m "chore: merge hotfix to develop"
   git push origin develop
   ```

6. **Cleanup**:
   ```bash
   git branch -d hotfix/042-fix-critical-bug
   ```

## Tagging Conventions

### Tag Format

```
v{MAJOR}.{MINOR}.{PATCH}[-{PRERELEASE}]

v1.0.0        # Release
v1.0.1        # Patch release
v2.0.0-beta.1 # Pre-release
v2.0.0-rc.1   # Release candidate
```

### Creating Tags

```bash
# Annotated tag (preferred for releases)
git tag -a v1.2.0 -m "Release 1.2.0

Features:
- Audio caching for offline playback
- Improved language detection

Fixes:
- Fixed highlight sync drift
- Resolved memory leak in blob URLs"

# Push single tag
git push origin v1.2.0

# Push all tags
git push origin --tags
```

### Listing Tags

```bash
# List all tags
git tag -l

# List tags matching pattern
git tag -l "v1.*"

# Show tag details
git show v1.2.0
```

### Deleting Tags (if needed)

```bash
# Delete local tag
git tag -d v1.2.0

# Delete remote tag
git push origin --delete v1.2.0
```

## Branch Protection Rules

### main Branch

| Rule | Setting |
|------|---------|
| Require PR | Yes |
| Required approvals | 1 |
| Dismiss stale reviews | Yes |
| Require status checks | Yes (test) |
| Require linear history | Yes |
| Allow force push | No |
| Allow deletion | No |
| Require conversation resolution | Yes |

### develop Branch

| Rule | Setting |
|------|---------|
| Require status checks | Yes (test) |
| Allow force push | No |
| Allow deletion | No |

## Common Workflows

### Starting a New Feature

```bash
# Ensure develop is up to date
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b 043-new-feature

# Work on feature...
git add .
git commit -m "feat(background): implement new feature"

# Push and create PR
git push -u origin 043-new-feature
gh pr create --base develop --title "feat: implement new feature"
```

### Completing a Feature

```bash
# Ensure feature is up to date with develop
git checkout 043-new-feature
git fetch origin
git rebase origin/develop

# Push (may need force if rebased)
git push --force-with-lease

# Merge PR via GitHub (after approval)
# Or merge locally:
git checkout develop
git merge --no-ff 043-new-feature -m "feat: implement new feature (#43)"
git push origin develop

# Cleanup
git branch -d 043-new-feature
git push origin --delete 043-new-feature
```

### Checking Current State

```bash
# What branch am I on?
git branch --show-current

# What's the current version?
./scripts/version.sh

# What tags exist?
git tag -l | sort -V | tail -5

# What's the latest release?
gh release list --limit 5

# What PRs are open?
gh pr list
```

## Troubleshooting

### "Cannot push to protected branch"

You're trying to push directly to main or develop:
```bash
# Create a feature branch instead
git checkout -b NNN-feature-name
git push -u origin NNN-feature-name
gh pr create
```

### "Version mismatch between files"

Ensure both package.json and manifest.json have the same version:
```bash
./scripts/version.sh set 1.2.0
```

### "Tag already exists"

Delete and recreate if needed:
```bash
git tag -d v1.2.0
git push origin --delete v1.2.0
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0
```

### "Release workflow failed"

Check the GitHub Actions logs:
```bash
gh run list --workflow=release.yml
gh run view <run-id> --log
```

## When to Use This Skill

Use this skill when:
- Creating a new release
- Bumping version numbers
- Creating or managing tags
- Working with release/hotfix branches
- Asking about the branching strategy
- Troubleshooting release issues

### Example Prompts

- "Create a new release for version 1.2.0"
- "Bump the patch version"
- "How do I create a hotfix?"
- "What's the current version?"
- "Tag this commit as a release"
- "What's the branching strategy?"
