# Proso Development Guidelines

Proso is a Firefox-first WebExtension for text-to-speech. Monorepo managed by pnpm.

## Project Structure

```text
packages/
  extension/     # Firefox WXT browser extension (primary package)
  server/        # NestJS backend (Hono HTTP, TTS adapters, credit system)
  shared/        # Domain types, Zod schemas, Result type, constants
  site/          # Landing page
services/
  proso-log-gateway/  # Standalone logging service
```

Extension follows hexagonal architecture:
```text
packages/extension/src/
  core/          # Pure domain logic — ZERO framework imports
  ports/         # Abstract interfaces (IReader, ICacheStore, IAudioGenerator)
  adapters/      # Concrete implementations of ports
  composition/   # Manual DI wiring (createContainer())
  handlers/      # Message handlers
  utils/         # Shared utilities
  entrypoints/   # UI entrypoints (popup, options, background, content)
```

## Commands

The tracked delivery contract is `docs/agent-delivery-harness.md`. Start with
`make help`; use `make verify` for the fast deterministic floor and
`GENERATOR_FAMILY=<openai|anthropic|zhipu> make gate` for the full cross-family
delivery gate.

### Agent-operated user gate

Invoke `$proso-user-gate` for every user-visible feature and for E2E, fuzz,
soak, anomaly, or browser-readiness work. The browser-operating agent is the
actor; deterministic assertions are the judge. A missing Firefox, geckodriver,
fixture, public selector, or observable state is `BLOCKED`, never skipped-green.

```bash
make fuzz       # seeded extension/server property tests
make user-gate-diagnostic  # fuzz + internal-dispatch Firefox diagnostic
make user-gate             # fail-closed until Feature 095 public acceptance exists
```

Record the seed and replay command for each failure. Playwright remains
Docker-only; `make smoke-reading` uses the retained raw geckodriver harness.
It invokes Firefox's internal command dispatcher and must never be promoted to
public-user acceptance. See `specs/095-reading-journey-contract/spec.md`.

### Build
```bash
pnpm -r build                         # Build all packages
pnpm --filter @proso/extension build   # Build extension (Firefox default)
pnpm --filter @proso/extension build:chrome
pnpm --filter @proso/server build      # Build server (nest build)
```

### Test
```bash
pnpm -r test                           # All packages (lint + tests)
pnpm --filter @proso/extension test    # Extension: lint then jest
pnpm --filter @proso/extension test:unit          # Jest unit tests only
pnpm --filter @proso/extension test:contract      # Contract tests only
pnpm --filter @proso/extension test:integration   # Integration tests
pnpm --filter @proso/extension test:security      # Security tests
pnpm --filter @proso/extension test:regression    # Regression tests
pnpm --filter @proso/extension test:coverage      # Jest with coverage
pnpm --filter @proso/server test                  # Server jest tests
```

**Run a single test file:**
```bash
# Extension (requires --experimental-vm-modules for ESM)
NODE_OPTIONS='--experimental-vm-modules' npx jest --selectProjects unit -- path/to/file.test.ts
# Server
npx jest -- path/to/file.spec.ts
```

**Run tests matching a pattern:**
```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest --selectProjects unit -t "test name pattern"
```

### Lint & Format
```bash
pnpm --filter @proso/extension lint       # biome lint .
pnpm --filter @proso/extension lint:fix   # biome lint --write .
pnpm --filter @proso/extension format     # biome format --write .
pnpm --filter @proso/extension check      # biome check . (lint + format)
pnpm --filter @proso/server lint          # biome check src/
pnpm -r lint                              # All packages
```

### E2E & Visual Tests (Playwright)
```bash
pnpm --filter @proso/extension test:e2e         # Firefox E2E
pnpm --filter @proso/extension test:e2e:ext     # Chromium extension E2E
pnpm --filter @proso/extension test:visual      # Firefox visual regression
```

### Quality
```bash
pnpm --filter @proso/extension quality    # Circular deps + duplication + manifest lint
pnpm --filter @proso/extension deps:check # Circular dependency check (madge)
```

## Code Style

### TypeScript Strict Mode
- `strict: true`, `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`
- Never use `any` — use `unknown` and narrow with type guards
- Use `readonly` on interface properties and `as const` for constant objects

### Formatting (Biome 1.9.4)
- 2-space indentation, 100-char line width, single quotes
- `useConst: error` — always use `const` over `let` when possible
- Organize imports automatically (Biome handles this)

### Import Conventions
- **Order**: external packages, then `@proso/shared`, then internal by layer depth
- **Type-only imports**: always use separate `import type` statements
- **Extensions**: `.js` in shared/server (Node ESM); omit in extension (bundled by WXT)
- **Path aliases**: `@/*` maps to `src/utils/*`, `@proso/shared` maps to `../shared/src`

```typescript
// Correct — separate value and type imports
import { ErrorCode } from '@proso/shared';
import type { Result } from '@proso/shared';
import { Err, Ok } from '@proso/shared';
import type { CreditRepositoryPort } from '../../ports/credit-repository.port.js';
import { creditError } from '../shared/domain-errors.js';
```

### Naming Conventions
| Category | Convention | Example |
|---|---|---|
| Files | `kebab-case.suffix.ts` | `credit.service.ts`, `highlight.entity.ts` |
| File suffixes | Role-based | `.port.ts`, `.adapter.ts`, `.service.ts`, `.spec.ts`, `.test.ts` |
| Port interfaces | `I` prefix (extension) | `IReader`, `ICacheStore`, `IAudioGenerator` |
| Port abstracts | `Port` suffix (server) | `TTSProviderPort`, `CreditRepositoryPort` |
| Types/Interfaces | `PascalCase` | `PlaybackState`, `CreditAllocation` |
| Enums | `PascalCase` members | `ErrorCode.InsufficientCredits` |
| Constants | `SCREAMING_SNAKE` | `PROVIDER_COSTS`, `TIER_CREDITS` |
| Functions | `camelCase` | `deductCredits()`, `selectProvider()` |
| Factory functions | `create*` prefix | `createContainer()`, `createHighlight()` |
| Zod schemas | `PascalCase` + `Schema` | `TTSSynthesizeRequestSchema` |
| Inferred Zod types | `PascalCase` + `Parsed` | `TTSSynthesizeRequestParsed` |
| Unused params | `_` prefix | `_language`, `_removed` |

### Exports
- **Named exports only** — no `export default` anywhere
- Barrel exports via `index.ts` at each directory level

### Error Handling
- **`Result<T, E>` pattern** for all fallible operations — no thrown exceptions in domain logic
- Discriminated union error types with `type` (extension) or `code` (server) discriminant
- Error factory helpers per domain: `cacheError.storageFull()`, `ttsError(code, msg)`
- `try/catch` only at adapter boundaries, converting to `Err()`
- Extract error messages from `unknown`: `error instanceof Error ? error.message : String(error)`

```typescript
// Domain: returns Result, never throws
async function deductCredits(...): Promise<Result<CreditTransactionRecord, CreditError>> {
  if (!allocation) return Err(creditError(ErrorCode.NoActiveAllocation, 'No active allocation'));
  return Ok(transaction);
}

// Adapter boundary: catches and converts
try {
  const response = await fetch(url, opts);
  if (!response.ok) return Err(ttsError(ErrorCode.ProviderUnavailable, `API error: ${response.status}`));
  return Ok({ audio: Buffer.from(arrayBuffer) });
} catch (error: unknown) {
  return Err(ttsError(ErrorCode.ProviderUnavailable, error instanceof Error ? error.message : String(error)));
}
```

### Test Conventions
- Extension tests: `*.test.ts` in `tests/unit/`, `tests/contract/`, `tests/integration/`, etc.
- Server tests: `*.spec.ts` mirroring source structure
- Top-level `describe` named after function/module, nested `describe` per scenario
- Factory helpers: `makeMock*()` for test data, `MockX implements IX` for mock ports
- Assert Results with type narrowing: `expect(isOk(result)).toBe(true); if (!isOk(result)) return;`
- Reference business invariants in test names: `'returns Err when period expired (INV-004)'`

## Architecture Rules
- **Core layer**: ZERO framework imports — pure TypeScript domain logic only
- **Ports**: Abstract interfaces/classes defining contracts
- **Adapters**: Implement ports; every adapter has a NoOp/InMemory fallback
- **Validation**: Zod schemas at boundaries, domain types internally
- **State**: Immutable state + pure transition functions

## Firefox-First Guidelines
1. Background scripts use **event pages** (not service workers) — DOM access available
2. Native **`Audio` API** in background — no offscreen documents needed
3. TTS synthesis routes through the Proso server. The intended account-free
   reading journey is currently blocked: Free managed requests return 402 and
   browser TTS is absent. BYOK remains available without an account.
4. Browser `speechSynthesis` was deliberately removed; do not reintroduce it without a new decision
5. **Minimum Firefox version**: 109.0 (see manifest.json gecko settings)

## Spec-Driven Development

**`specs/` and `.specify/` are tracked in git.** This is a deliberate decision,
recorded here because it was previously the opposite and the reversal cost real
work: with `specs/` ignored, PR #73 was dispatched with a binding instruction to
produce `specs/088-reading-outcome-spine/`, merged, and left no spec behind —
and nothing could have caught it.

The rule: **a feature's spec, plan, and tasks belong in the diff that implements
it.** A spec that lives only on one machine cannot be reviewed alongside its
code, does not survive `git worktree remove`, and cannot tell a future reader
why the code looks the way it does.

| Path | Tracked? | Why |
|---|---|---|
| `specs/NNN-slug/` | Yes | The reviewable artifact — `spec.md`, `plan.md`, `tasks.md` |
| `.specify/` | Yes | Constitution + templates. Also mechanical: an ignored `.specify/` is **absent from every fresh worktree**, so `/speckit.plan` cannot run there |
| `specs/_archive/` | No | 4.4M of pre-monorepo history no reviewer reads |
| `CLAUDE.md`, `.claude/`, `.mcp.json`, `.opencode/` | No | Agent runtime config, machine-specific |

Conventions:

- Feature directory is `specs/NNN-slug/`, `NNN` matching the branch name.
- Numbering resumes honestly from the present. Features that merged before this
  change have no spec directory and none will be invented for them — a
  retroactive spec is a fabricated record.
- `.specify/memory/constitution.md` is the governance document every
  `/speckit.plan` Constitution Check gates against. Amending it requires a SYNC
  IMPACT REPORT and a semantic version bump; see its own Governance section.

## Git Workflow

- **Never open a PR by pushing `HEAD:refs/heads/<name>` from the main worktree.**
  That creates the remote branch but no local one, so the next `git commit` lands on
  **main** — it happened on 21/09/2026, and the branch had to be rebuilt from the two
  commits. Create the worktree first (`git worktree add ../<repo>-NNN-slug -b NNN-slug
  origin/main`), or pin a local branch before pushing (`git branch <name> <sha>`).
- **Branch naming**: `NNN-feature-name` (e.g., `017-git-workflow-automation`), `hotfix/NNN-desc`, `release/X.Y.Z`
- **Protected branches**: `main`, `develop` — never push directly
- **Conventional Commits**: `type(scope): description` — imperative mood, first line ≤72 chars
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
- **Scopes**: `background`, `content`, `popup`, `options`, `config`, `styles`, `deps`
- **Atomic commits**: one logical change per commit, tests accompany implementation
- **Pre-commit hooks** (lefthook): `biome check` + `tsc --noEmit` for extension/server/shared
- **PR title format**: `type: description`

## Active Technologies
- TypeScript 5.9.3, ES2020 build target + WXT ^0.20.13, Vite ^5.4.21, UnoCSS (to be added), Biome 1.9.4 (075-unocss-integration)
- N/A (build-time tooling only — no runtime storage changes) (075-unocss-integration)

## Recent Changes
- 075-unocss-integration: Added TypeScript 5.9.3, ES2020 build target + WXT ^0.20.13, Vite ^5.4.21, UnoCSS (to be added), Biome 1.9.4
