# Quickstart: Development Quality Automation

**Feature**: 073-dev-quality-automation | **Date**: 2026-03-03

---

## Prerequisites

- Node.js 20+, pnpm 9+
- Docker (for Playwright E2E tests)
- GitHub CLI (`gh`) authenticated

## Setup

```bash
# 1. Install dependencies (includes lefthook)
pnpm install

# 2. Lefthook auto-installs via postinstall hook
# Verify:
npx lefthook version

# 3. Verify pre-commit hooks work
git stash -u  # stash current changes
echo "// test" >> packages/shared/src/index.ts
git add -A && git commit -m "test: verify hooks" --dry-run
# Should see Biome + tsc checks run
git checkout -- .
git stash pop
```

## Development Workflow

### Commit Flow
```
edit code → git add → git commit
                        ↓
              lefthook pre-commit runs:
              ├── biome check --staged (1-3s)
              ├── tsc --build --noEmit (2-5s)
              └── (parallel execution)
                        ↓
              commit succeeds or fails with clear error
```

### Running Tests

```bash
# Extension unit tests
pnpm --filter @proso/extension test:unit

# Server unit tests
pnpm --filter @proso/server test

# Extension with coverage
pnpm --filter @proso/extension test:coverage

# Contract tests only
pnpm --filter @proso/extension test -- --testPathPattern=contract

# E2E tests (requires Docker)
pnpm --filter @proso/extension test:e2e
```

### Writing Contract Tests

```typescript
// tests/contract/my-port.contract.test.ts
import { describe, it, expect } from '@jest/globals';

// Test each adapter against the port interface
describe('IMyPort contract', () => {
  const adapters = [
    { name: 'ConcreteAdapter', factory: () => new ConcreteAdapter() },
  ];

  for (const { name, factory } of adapters) {
    describe(name, () => {
      it('should satisfy happy path', async () => {
        const adapter = factory();
        const result = await adapter.doSomething(validInput);
        expect(isOk(result)).toBe(true);
      });

      it('should handle error case', async () => {
        const adapter = factory();
        const result = await adapter.doSomething(invalidInput);
        expect(isErr(result)).toBe(true);
      });
    });
  }
});
```

### Adding Zod Validation to Server Endpoint

```typescript
// packages/shared/src/schemas/tts.ts
import { z } from 'zod';

export const SynthesizeRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  provider: z.enum(['openai', 'elevenlabs', 'browser']),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).default(1.0),
});

export type SynthesizeRequest = z.infer<typeof SynthesizeRequestSchema>;

// packages/server/src/infrastructure/controllers/tts.controller.ts
import { ZodValidationPipe } from 'nestjs-zod';
import { SynthesizeRequestSchema } from '@proso/shared';

@Post('synthesize')
async synthesize(
  @Body(new ZodValidationPipe(SynthesizeRequestSchema)) body: SynthesizeRequest,
) {
  return this.ttsService.synthesize(body);
}
```

## Verification

```bash
# Full quality check
pnpm --filter @proso/extension test:unit && \
pnpm --filter @proso/server test && \
pnpm --filter @proso/extension build:firefox

# Check coverage meets thresholds
pnpm --filter @proso/extension test:coverage

# Security audit
pnpm audit --audit-level=high
```
