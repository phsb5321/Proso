# Contributing to VoxPage

Thank you for your interest in contributing to VoxPage! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check the [existing issues](https://github.com/phsb5321/VoxPage/issues) to avoid duplicates
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
   gh repo fork phsb5321/VoxPage --clone
   ```

2. **Create a feature branch from `develop`**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Make your changes**

5. **Run quality checks**
   ```bash
   npm run lint
   npm test
   npm run quality
   ```

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

7. **Push and create a PR**
   ```bash
   git push origin feature/your-feature-name
   gh pr create --base develop
   ```

#### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation only
- `refactor/description` - Code refactoring
- `test/description` - Test additions or fixes

#### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Test additions or fixes
- `chore:` - Maintenance tasks

Examples:
```
feat: add word-level highlighting for ElevenLabs
fix: resolve audio playback issue on Wikipedia
docs: update installation instructions
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

### Development Guidelines

#### Code Style

- Use ES2022+ JavaScript features
- Follow existing code patterns
- Keep modules under 300 lines when possible
- Use JSDoc comments for public functions
- Prefer `const` over `let`, avoid `var`

#### Architecture

- **Background scripts**: ES modules in `background/`
- **Content scripts**: `window.VoxPage` namespace pattern
- **Popup**: ES modules in `popup/`
- **Shared utilities**: `shared/` directory

#### Testing

- Write tests for new functionality
- Ensure existing tests pass
- Use Jest for unit tests
- Follow existing test patterns

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
   git clone https://github.com/phsb5321/VoxPage.git
   cd VoxPage
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
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:coverage # With coverage report
```

### Quality Checks

```bash
npm run lint          # ESLint
npm run lint:fix      # Auto-fix issues
npm run quality       # Full quality suite
```

## Getting Help

- Open a [Discussion](https://github.com/phsb5321/VoxPage/discussions) for questions
- Check existing issues for similar problems
- Join our community channels (if available)

## Recognition

Contributors are recognized in our release notes and README. Thank you for helping make VoxPage better!
