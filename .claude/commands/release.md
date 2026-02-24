# Release Command

Create a new release for Proso with proper versioning, tagging, and changelog.

## Outline

1. **Parse input**: Extract version type or specific version from `$ARGUMENTS`
   - If empty, show current version and ask what type of release (patch/minor/major)
   - If "patch", "minor", or "major": bump that component
   - If specific version (e.g., "1.2.0"): use that version

2. **Validate state**:
   - Ensure on `main` or `develop` branch
   - Ensure working directory is clean (no uncommitted changes)
   - Ensure all tests pass: `pnpm test`
   - Ensure quality checks pass: `pnpm run quality`

3. **Prepare release**:
   - If on develop, create release branch: `release/X.Y.Z`
   - Run version script: `./scripts/version.sh set X.Y.Z`
   - Commit version bump: `git commit -m "chore(release): bump version to X.Y.Z"`

4. **Generate changelog** (if CHANGELOG.md exists):
   - Get commits since last tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`
   - Categorize by conventional commit type (feat, fix, etc.)
   - Prepend to CHANGELOG.md

5. **Create release**:
   - Merge to main (if on release branch)
   - Create annotated tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`
   - Push tag: `git push origin vX.Y.Z`
   - Merge back to develop (if applicable)

6. **Verify release**:
   - Check GitHub Actions workflow triggered
   - Provide release URL: `gh release view vX.Y.Z --web`

## Example Usage

```
/release patch          # 1.0.0 → 1.0.1
/release minor          # 1.0.1 → 1.1.0
/release major          # 1.1.0 → 2.0.0
/release 2.0.0-beta.1   # Set specific version
/release                # Show current version, prompt for type
```

## Notes

- Protected branches require PR - guide user through PR creation if needed
- Pre-release versions (beta, rc) should be tagged but not merged to main
- Always run tests before releasing
- The GitHub Actions release workflow will build and publish artifacts
