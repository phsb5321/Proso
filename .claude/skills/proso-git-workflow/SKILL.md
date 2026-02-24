---
name: proso-git-workflow
description: Creates atomic commits and PRs following Proso project conventions. Use when committing changes, pushing to remote, creating pull requests, or when asked about git workflow, commit format, or PR conventions.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Read, Grep, Glob
---

# Proso Git Workflow

This skill guides Claude through Proso's git workflow conventions including atomic commits, push operations, and pull request creation.

## Proso Project Context

Proso is a Firefox WebExtension for text-to-speech. Key directories:

| Directory | Purpose |
|-----------|---------|
| `background/` | Service worker modules (message routing, playback, TTS providers) |
| `content/` | Content scripts (text extraction, highlighting, floating controller) |
| `popup/` | Popup UI components |
| `options/` | Extension settings page |
| `shared/` | Cross-context utilities and configuration |
| `styles/` | CSS files (content.css, tokens.css) |
| `tests/` | Jest unit tests and Playwright visual tests |

### Project Conventions

- **Branch naming**: `###-feature-name` (e.g., `017-git-workflow-automation`)
- **Feature specs**: Located in `specs/###-feature-name/`
- **npm scripts**: `npm test`, `npm run lint`, `npm run quality`

## Conventional Commits Format

All commits MUST follow Conventional Commits specification:

```
type(scope): description

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(background): Add Loki remote logging` |
| `fix` | Bug fix | `fix(content): Correct text extraction for infoboxes` |
| `refactor` | Code restructuring (no behavior change) | `refactor(popup): Extract state management` |
| `test` | Adding or updating tests | `test(popup): Add provider selection tests` |
| `docs` | Documentation only | `docs: Update CLAUDE.md architecture section` |
| `chore` | Maintenance tasks | `chore(deps): Upgrade jest to v30` |
| `perf` | Performance improvement | `perf(content): Optimize DOM element matching` |

### Commit Scopes (Proso-specific)

| Scope | When to use |
|-------|-------------|
| `background` | Changes to background/ service worker modules |
| `content` | Changes to content/ scripts |
| `popup` | Changes to popup/ UI |
| `options` | Changes to options/ page |
| `config` | Changes to shared/config/ |
| `styles` | Changes to CSS files |
| `deps` | Dependency updates |
| (none) | Cross-cutting changes or documentation |

### Commit Message Rules

1. **First line**: ≤72 characters, format: `type(scope): description`
2. **Description**: Imperative mood ("Add feature" not "Added feature")
3. **Body**: Explain "why" not "what" (code shows what)
4. **Footer**: Reference issues with `Closes #NNN` or `Relates to #NNN`

## Atomic Commit Guidelines

An atomic commit represents **one logical change**. Each commit should be:
- Self-contained (all files needed for that change)
- Independently reviewable
- Independently revertable
- Passing all tests

### When to Create a Single Commit

Create ONE commit when:
- All changed files serve the same purpose
- Changes are in the same directory/module
- Tests accompany the implementation they test

### When to Split Into Multiple Commits

Split into SEPARATE commits when:
- Changes affect multiple unrelated modules (e.g., background/ AND popup/ for different features)
- You're fixing a bug AND adding a new feature
- You're refactoring AND changing behavior
- Documentation changes are unrelated to code changes

### Atomic Commit Detection Heuristics

Before committing, analyze staged files:

```bash
git diff --staged --name-only
```

**Decision matrix:**

| Staged Files Pattern | Recommendation |
|---------------------|----------------|
| All in same directory (e.g., `background/*`) | Single commit |
| Implementation + its tests | Single commit |
| Multiple directories, same feature | Single commit |
| Multiple directories, different features | Split commits |
| Bug fix + unrelated refactoring | Split commits |
| Docs + unrelated code changes | Split commits |

### Commit Message Examples

**Good commits:**

```bash
# Clear scope, imperative mood, explains what
feat(background): Add Loki remote logging integration

# With body explaining why
fix(content): Correct text extraction for wiki infoboxes

Infobox elements were being included in extracted text due to
missing selector in UNWANTED_CONFIG. Added infobox patterns
for Wikipedia, Fextralife, and Fandom wikis.

Closes #234

# Scope-less for cross-cutting changes
docs: Update CLAUDE.md with feature 017 architecture
```

**Bad commits (avoid these):**

```bash
# Too vague
fix: Fixed stuff

# Wrong tense
feat(popup): Added new button

# Missing scope when one applies
feat: Add provider selection dropdown  # Should be feat(popup):

# Too long first line (>72 chars)
feat(background): Add comprehensive logging system with batching and retry logic for Loki integration

# Multiple unrelated changes in one commit
feat: Add logging, fix tests, update docs, refactor utils
```

## Push Workflow

After committing, push changes to the remote repository.

### Basic Push

```bash
# Push to current branch
git push

# If upstream not set, use -u to set tracking
git push -u origin branch-name
```

### Upstream Tracking Setup

When pushing a new branch for the first time:

```bash
# Check if upstream is configured
git status  # Shows "Your branch is up to date with..." if tracking is set

# Set upstream tracking
git push -u origin $(git rev-parse --abbrev-ref HEAD)
```

### Protected Branch Detection

**CRITICAL**: Before pushing, check if you're on a protected branch:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "WARNING: You're on protected branch '$BRANCH'"
  echo "Create a feature branch instead: git checkout -b NNN-feature-name"
fi
```

**Protected branches in Proso:**
- `main` - Production branch, never push directly
- `master` - Legacy name, same protection as main

### Branch Naming Convention

Proso uses numbered feature branches:

```
###-feature-name
```

- `###` = 3-digit feature number (e.g., 017)
- `feature-name` = lowercase with hyphens

**Examples:**
- `017-git-workflow-automation`
- `018-voice-selection-ui`
- `019-fix-highlight-sync`

### Handling Diverged Branches

When push fails due to remote changes:

```bash
# Option 1: Pull and merge (creates merge commit)
git pull origin branch-name
git push

# Option 2: Rebase (cleaner history, preferred for feature branches)
git pull --rebase origin branch-name
git push

# Option 3: Force push (CAUTION - only for your own feature branch)
git push --force-with-lease origin branch-name
```

**Force push guidelines:**
- NEVER force push to `main` or `master`
- Only force push to YOUR OWN feature branch
- Use `--force-with-lease` instead of `--force` for safety
- Communicate with team if others might have pulled your branch

## Pull Request Creation

### PR Creation Workflow

Before creating a PR, verify:

1. **All commits are pushed** to the remote branch
2. **Branch is up-to-date** with main (rebase if needed)
3. **Tests pass** locally (`npm test`)
4. **Lint passes** locally (`npm run lint`)

### Check for Existing PR

Before creating a new PR, check if one already exists for the branch:

```bash
# Check if PR exists for current branch
gh pr view --json number,title,url 2>/dev/null && echo "PR already exists" || echo "No PR found"

# List all open PRs
gh pr list --state open
```

### PR Title Format

Format: `type: description`

Use the same type as your commits:

| Type | Example PR Title |
|------|------------------|
| `feat` | `feat: Add git workflow automation hooks and skills` |
| `fix` | `fix: Correct paragraph highlighting sync drift` |
| `docs` | `docs: Update architecture documentation` |
| `refactor` | `refactor: Extract message handlers into registry pattern` |
| `test` | `test: Add visual regression tests for floating controller` |
| `chore` | `chore: Upgrade dependencies to latest versions` |

### PR Body Template

Use the template from [pr-template.md](./pr-template.md). The PR body should include:

1. **Summary**: 1-3 bullet points describing major changes
2. **Test Plan**: Checklist of testing performed
3. **Related Issues**: Links using proper format

### Issue Linking

Use these formats to link issues in PR body:

| Format | When to Use |
|--------|-------------|
| `Closes #NNN` | PR fully resolves the issue (auto-closes on merge) |
| `Fixes #NNN` | Same as Closes (alternative syntax) |
| `Relates to #NNN` | PR is related but doesn't fully close the issue |
| `Part of #NNN` | PR is incremental work toward an issue |

### Creating the PR

Use `gh pr create` with a HEREDOC for the body to ensure proper formatting:

```bash
# Basic PR creation
gh pr create --title "feat: Add git workflow automation" --body "$(cat <<'EOF'
## Summary

- Add atomic commit guidance skill
- Implement push workflow with protected branch detection
- Create PR creation workflow with templates

## Test Plan

- [ ] Manual testing: Created commits, pushed, verified PR format
- [ ] Unit tests pass: `npm test`
- [ ] Lint passes: `npm run lint`

## Related Issues

Closes #17

---
Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# With specific base branch
gh pr create --base main --title "fix: Correct sync drift" --body "..."

# Draft PR (for work in progress)
gh pr create --draft --title "feat: WIP new feature" --body "..."
```

### PR Creation Checklist

Before running `gh pr create`:

- [ ] All commits follow conventional format
- [ ] Branch pushed to remote with upstream tracking
- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] No unintended file changes (`git status`)
- [ ] PR title follows `type: description` format
- [ ] PR body includes Summary, Test Plan, and Related Issues

## Pre-Commit Validation

Before creating a commit, run validation checks to catch issues early.

### Validation Order

Run checks in this order (fail fast):

1. **Lint** - Catches syntax and style issues
2. **Tests** - Ensures code works correctly
3. **Secrets Detection** - Prevents credential leaks

### Lint Check

```bash
# Run ESLint (includes import validation)
npm run lint

# Auto-fix issues where possible
npm run lint:fix
```

**Common lint errors:**
- Unused imports/variables
- Missing semicolons or formatting
- Import order violations
- Circular dependencies

### Test Check

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern="config"
```

**If tests fail:**
1. Read the error message carefully
2. Fix the failing test or the code it tests
3. Re-run tests until green
4. Only then proceed to commit

### Secrets Detection

**CRITICAL**: Never commit secrets, API keys, or credentials.

Before committing, scan for common secret patterns:

```bash
# Check staged files for potential secrets
git diff --staged | grep -iE "(api[_-]?key|password|secret|token|credential|auth)" && echo "WARNING: Potential secrets detected!"

# Common patterns to avoid committing:
# - API_KEY=xxx
# - password: "..."
# - token: "..."
# - secret_key = "..."
# - Authorization: Bearer xxx
```

**If secrets are detected:**
1. Remove the secret from the file
2. Use environment variables instead
3. Add the file to `.gitignore` if it contains secrets
4. If accidentally committed, rotate the credential immediately

### Files to Never Commit

| Pattern | Reason |
|---------|--------|
| `.env` | Environment variables with secrets |
| `*.pem`, `*.key` | Private keys |
| `credentials.json` | Service account credentials |
| `*_secret*` | Any file with "secret" in name |
| `node_modules/` | Dependencies (use package.json) |

### Full Pre-Commit Workflow

```bash
# 1. Run lint
npm run lint
if [ $? -ne 0 ]; then
  echo "Fix lint errors before committing"
  exit 1
fi

# 2. Run tests
npm test
if [ $? -ne 0 ]; then
  echo "Fix failing tests before committing"
  exit 1
fi

# 3. Check for secrets in staged changes
if git diff --staged | grep -qiE "(api[_-]?key|password|secret|token)"; then
  echo "WARNING: Possible secrets in staged changes - review before committing"
fi

# 4. Review staged changes
git diff --staged

# 5. Create commit
git commit -m "type(scope): description"
```

### Handling Validation Failures

| Issue | Solution |
|-------|----------|
| Lint errors | Run `npm run lint:fix`, then fix remaining manually |
| Test failures | Debug the test, fix code or test, re-run |
| Secrets detected | Remove secrets, use env vars, check `.gitignore` |
| Type errors | Fix type annotations or add proper types |

## When to Use This Skill

This skill provides guidance for Proso git workflow operations. Use it when:

- **Committing changes**: Creating atomic commits with conventional format
- **Pushing code**: Pushing to feature branches with proper tracking
- **Creating PRs**: Opening pull requests with proper formatting
- **Questions about conventions**: Asking about commit format, branch naming, or PR structure
- **Troubleshooting**: Resolving git workflow issues

### Example Prompts That Trigger This Skill

- "Commit these changes"
- "Push to the remote"
- "Create a PR for this feature"
- "What's the commit format for Proso?"
- "How should I name my branch?"

## Frequently Asked Questions

### Commit Format

**Q: What commit type should I use for a new feature?**
A: Use `feat(scope): description`. Example: `feat(background): Add Loki remote logging`

**Q: What's the difference between `fix` and `refactor`?**
A: `fix` is for bug fixes that change behavior. `refactor` is for code restructuring that doesn't change behavior.

**Q: When should I omit the scope?**
A: Omit scope for cross-cutting changes that affect multiple modules, or for documentation-only changes. Example: `docs: Update CLAUDE.md`

**Q: How long should my commit message be?**
A: First line ≤72 characters. Use a body for longer explanations (separated by blank line).

### Branch Naming

**Q: What's the branch naming pattern?**
A: `###-feature-name` where `###` is a 3-digit feature number. Example: `017-git-workflow-automation`

**Q: Where do I get the feature number?**
A: Check existing branches or ask the project maintainer. Numbers are sequential.

### Pull Requests

**Q: Should I create a draft PR?**
A: Use draft PRs for work-in-progress that you want feedback on before it's ready for review.

**Q: How do I link issues in my PR?**
A: Use `Closes #NNN` in the PR body to auto-close on merge, or `Relates to #NNN` for related issues.

**Q: What goes in the Test Plan section?**
A: Describe how you tested the changes: manual tests performed, commands run, edge cases verified.

## Troubleshooting

### Common Issues

**`gh: command not found`**

GitHub CLI is not installed. Install it:

```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt install gh

# Then authenticate
gh auth login
```

**`fatal: not a git repository`**

You're not in a git repository. Either:
- Navigate to the project root: `cd /path/to/Proso`
- Initialize a new repo: `git init` (only for new projects)

**Tests Failing Before Commit**

1. Read the test error output
2. Check if it's a test issue or code issue
3. Fix the code or update the test
4. Re-run: `npm test`

**Lint Errors Before Commit**

1. Try auto-fix first: `npm run lint:fix`
2. For remaining errors, fix manually
3. Common issues: unused imports, missing semicolons
4. Re-run: `npm run lint`

**Push Rejected: Updates Were Rejected**

Your branch is behind the remote. Options:

```bash
# Option 1: Pull and merge
git pull origin branch-name
git push

# Option 2: Rebase (cleaner history)
git pull --rebase origin branch-name
git push

# Option 3: Force push (your own branch only)
git push --force-with-lease
```

**PR Creation Fails: Branch Not Found**

Ensure your branch is pushed first:

```bash
git push -u origin $(git rev-parse --abbrev-ref HEAD)
gh pr create
```

### Proso-Specific Examples

**Example: Adding a new TTS provider**

```bash
# Branch
git checkout -b 020-add-azure-provider

# After implementation
git add background/providers/azure-provider.js tests/unit/azure-provider.test.js
git commit -m "feat(background): Add Azure TTS provider

Implements Azure Cognitive Services TTS with word timing support.
Uses streaming audio with WebSocket for low latency.

Closes #42"

git push -u origin 020-add-azure-provider
gh pr create --title "feat: Add Azure TTS provider" --body "$(cat <<'EOF'
## Summary

- Add Azure Cognitive Services TTS provider
- Support word-level timing for sync highlighting
- Implement streaming audio via WebSocket

## Test Plan

- [ ] Manual testing: Verified playback with Azure voices
- [ ] Unit tests pass: `npm test`
- [ ] Lint passes: `npm run lint`

## Related Issues

Closes #42

---
Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Example: Fixing a content extraction bug**

```bash
# Already on feature branch
git add content/content-extractor.js tests/unit/content-extractor.test.js

git commit -m "fix(content): Exclude infobox elements from extraction

Infobox elements were being included in extracted text for wiki pages.
Added patterns to UNWANTED_CONFIG for Wikipedia, Fextralife, and Fandom.

Closes #234"

git push
gh pr create --title "fix: Exclude infobox elements from extraction" --body "..."
```

