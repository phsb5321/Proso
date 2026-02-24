# Contributing to Proso

Thank you for your interest in contributing to Proso! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Contributor License Agreement (CLA)

By submitting a pull request, you agree to the following terms:

1. **License Grant**: You grant Proso a perpetual, worldwide, non-exclusive,
   royalty-free license to use, reproduce, modify, and distribute your contribution.

2. **Relicensing Rights**: You grant Proso the right to relicense your contribution
   under commercial license terms for enterprise customers.

3. **Original Work**: You represent that your contribution is your original work
   and you have the right to grant these permissions.

4. **Open Source Commitment**: The open source version of Proso will always
   remain available under AGPL-3.0.

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check the [existing issues](https://github.com/phsb5321/Proso/issues) to avoid duplicates
2. Ensure you're using the latest version
3. Collect relevant information (Firefox version, error messages, steps to reproduce)

When submitting a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots if applicable
- Browser and extension version

### Suggesting Features

Feature requests are welcome! Please:

1. Check existing issues and discussions first
2. Clearly describe the feature and its use case
3. Explain why this would benefit users

### Pull Requests

#### Getting Started

1. **Fork the repository**
   ```bash
   gh repo fork phsb5321/Proso --clone
   ```

2. **Create a feature branch from `develop`**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b NNN-your-feature-name
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Make your changes**

5. **Run quality checks**
   ```bash
   pnpm run lint
   pnpm test
   pnpm run quality
   ```

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat(scope): add your feature description"
   ```

7. **Push and create a PR**
   ```bash
   git push -u origin NNN-your-feature-name
   gh pr create --base develop
   ```

#### Branch Naming

Proso uses numbered feature branches for traceability:

| Pattern | Use Case | Example |
|---------|----------|---------|
| `NNN-description` | Feature branches | `042-audio-caching` |
| `hotfix/NNN-description` | Emergency production fixes | `hotfix/043-playback-crash` |
| `release/X.Y.Z` | Release preparation | `release/1.2.0` |

**Protected Branches:**
- `main` - Production releases, requires PR with 1 approval
- `develop` - Integration branch, requires passing tests

#### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) with optional scope:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**

| Type | Use For |
|------|---------|
| `feat` | New features |
| `fix` | Bug fixes |
| `docs` | Documentation only |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Test additions or fixes |
| `chore` | Maintenance, dependencies |
| `perf` | Performance improvements |

**Scopes (Proso-specific):**

| Scope | Directory/Area |
|-------|----------------|
| `background` | `src/background/`, `src/entrypoints/background.ts` |
| `content` | `src/entrypoints/content.ts`, content scripts |
| `popup` | `src/entrypoints/popup/` |
| `options` | `src/entrypoints/options/` |
| `config` | `src/utils/config/` |
| `cache` | `src/utils/cache/` |
| `test` | Test infrastructure |
| (none) | Cross-cutting changes |

**Examples:**
```bash
feat(background): add Loki remote logging integration
fix(content): correct text extraction for wiki infoboxes
docs: update CONTRIBUTING.md with Git Flow
chore(deps): upgrade playwright to v1.40
```

#### Pull Request Guidelines

1. **Target the `develop` branch** (not `main`)
2. **Fill out the PR template** completely
3. **Ensure all checks pass**:
   - Linting (`npm run lint`)
   - Tests (`npm test`)
   - Quality checks (`npm run quality`)
4. **Keep PRs focused** - one feature/fix per PR
5. **Update documentation** if needed
6. **Respond to review feedback** promptly

## Git Flow & Versioning

Proso uses a modified Git Flow branching strategy with semantic versioning.

### Branch Strategy

```
main (protected)
  │
  ├── Production-ready releases
  ├── Tagged versions (v1.0.0, v1.1.0)
  │
  └─── develop (protected)
         │
         ├── Integration branch
         │
         └─── NNN-feature-name (feature branches)
```

### Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix | PATCH | 1.0.0 → 1.0.1 |
| New feature (backwards compatible) | MINOR | 1.0.1 → 1.1.0 |
| Breaking change | MAJOR | 1.1.0 → 2.0.0 |

### Version Management

```bash
# Show current version
./scripts/version.sh

# Bump version
./scripts/version.sh patch    # 1.0.0 → 1.0.1
./scripts/version.sh minor    # 1.0.1 → 1.1.0
./scripts/version.sh major    # 1.1.0 → 2.0.0
./scripts/version.sh set 2.0.0-beta.1  # Set specific version
```

### Creating a Release

1. **Automated (recommended)**: Push a version tag to trigger the release workflow:
   ```bash
   git tag -a v1.2.0 -m "Release 1.2.0"
   git push origin v1.2.0
   ```

2. **Manual**: Use the workflow dispatch in GitHub Actions

### Hotfix Process

For critical production bugs:

```bash
git checkout main
git checkout -b hotfix/NNN-fix-description
# Make fixes
./scripts/version.sh patch
git commit -m "fix: description of fix"
# Create PR to main, then merge back to develop
```

### Development Guidelines

#### Code Style

- Use ES2022+ JavaScript features
- Follow existing code patterns
- Keep modules under 300 lines when possible
- Use JSDoc comments for public functions
- Prefer `const` over `let`, avoid `var`

#### Architecture

- **Background scripts**: ES modules in `background/`
- **Content scripts**: `window.Proso` namespace pattern
- **Popup**: ES modules in `popup/`
- **Shared utilities**: `shared/` directory

#### Testing

Proso uses multiple test types to ensure quality:

##### Test Types

| Type | Tool | Command | Purpose |
|------|------|---------|---------|
| Unit | Jest | `pnpm run test:unit` | Individual module logic |
| Integration | Jest | `pnpm run test:integration` | Cross-module flows |
| Visual | Playwright | `pnpm run test:visual` | UI appearance regression |
| E2E | Playwright | `pnpm run test:e2e` | Full extension behavior |
| Security | Jest | `pnpm run test:security` | CSP compliance, build artifacts |

##### Running Tests

```bash
# Run all tests
pnpm run test:all

# Run specific test types
pnpm run test:unit          # Unit tests only
pnpm run test:integration   # Integration tests only
pnpm run test:visual        # Visual regression tests
pnpm run test:e2e           # End-to-end tests
pnpm run test:security      # Security tests

# Update visual baselines (after intentional UI changes)
pnpm run test:visual:update

# Run with coverage
pnpm run test:coverage
```

##### Testing on NixOS

Playwright requires Firefox to be available via `FIREFOX_PATH`:

```bash
# Set Firefox path
export FIREFOX_PATH=$(which firefox)

# Or use the setup script
./scripts/nixos-playwright-setup.sh

# Run visual/E2E tests in headed mode (for debugging)
pnpm run test:visual -- --headed
pnpm run test:e2e -- --headed
```

Visual and E2E tests require a built extension. Run `pnpm run build:firefox` first.

##### Test Conventions

- **File naming**: `*.test.ts` for unit/integration, `*.e2e.test.ts` for E2E, `*.test.js` for visual
- **Location**: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/visual/`, `tests/security/`
- **Data attributes**: Use `data-testid` for element targeting in tests
- **Mocking**: Use Jest mocks for browser APIs and network requests
- **Assertions**: Prefer explicit assertions over snapshot tests where possible
- **Isolation**: Tests should not depend on each other or external state

##### Writing Visual Tests

```javascript
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

test('component appearance', async ({ page }) => {
  await page.goto('...');
  await disableAnimations(page);
  await waitForLayoutStable(page, '[data-testid="component"]', 100);

  await expect(page).toHaveScreenshot('component.png', {
    maxDiffPixelRatio: 0.02,
  });
});
```

#### Security

- Never commit API keys or secrets
- Validate all external input
- Follow OWASP guidelines
- Report security issues privately

## Development Setup

### Prerequisites

- Firefox 109+
- Node.js 20.x
- npm

### Local Development

1. Clone and install:
   ```bash
   git clone https://github.com/phsb5321/Proso.git
   cd Proso
   npm install
   ```

2. Load in Firefox:
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `manifest.json`

3. Reload after changes:
   - Click "Reload" in `about:debugging`
   - Or use `web-ext run` for auto-reload

### Running Tests

```bash
pnpm run test:all       # Run all tests
pnpm run test:unit      # Unit tests only
pnpm run test:coverage  # With coverage report
pnpm run test:visual    # Visual regression tests
pnpm run test:e2e       # End-to-end tests
```

### Quality Checks

```bash
pnpm run lint          # ESLint
pnpm run lint:fix      # Auto-fix issues
pnpm run quality       # Full quality suite (deps + duplication + manifest lint)
```

## Getting Help

- Open a [Discussion](https://github.com/phsb5321/Proso/discussions) for questions
- Check existing issues for similar problems
- Join our community channels (if available)

## Recognition

Contributors are recognized in our release notes and README. Thank you for helping make Proso better!
