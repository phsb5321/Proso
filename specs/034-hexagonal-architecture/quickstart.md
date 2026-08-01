# Quickstart: Hexagonal Architecture Implementation

**Feature**: 034-hexagonal-architecture
**Date**: 2026-01-06

## Overview

This guide covers the key patterns and conventions for implementing the hexagonal architecture refactoring.

## Directory Structure

After implementation, the src/ directory will have these new folders:

```
src/
├── core/                   # Domain layer (pure business logic)
├── ports/                  # Port interfaces (contracts)
├── adapters/               # Infrastructure adapters
├── composition/            # Dependency injection
└── handlers/               # Message handler delegation
```

## Creating a New Port Interface

Ports define what the domain needs, not how it's provided.

```typescript
// ports/example.port.ts

import type { Result } from '../core/shared/result';

/**
 * Port interface for [purpose]
 *
 * Implementations:
 * - [Adapter1] - [technology]
 * - [Adapter2] - [technology]
 */
export interface IExamplePort {
  /**
   * Method description
   * @param param - Parameter description
   * @returns Result with value or typed error
   */
  doSomething(param: string): Promise<Result<OutputType, ErrorType>>;
}

// Define typed errors
export type ErrorType =
  | { type: 'not_found'; id: string }
  | { type: 'validation_failed'; field: string };
```

**Rules**:
- Prefix interface name with `I`
- Use `Result<T, E>` for operations that can fail
- Define typed error unions, not generic `Error`
- No implementation details in interface
- Document which adapters implement this port

## Creating a New Adapter

Adapters implement port interfaces with specific technologies.

```typescript
// adapters/example/concrete.adapter.ts

import type { IExamplePort, ErrorType } from '../../ports/example.port';
import type { Result } from '../../core/shared/result';
import { Ok, Err } from '../../core/shared/result';

export class ConcreteAdapter implements IExamplePort {
  constructor(private readonly config: AdapterConfig) {}

  async doSomething(param: string): Promise<Result<OutputType, ErrorType>> {
    try {
      // Infrastructure-specific implementation
      const result = await externalService.call(param);
      return Ok(result);
    } catch (error) {
      return Err({ type: 'not_found', id: param });
    }
  }
}
```

**Rules**:
- Name adapter with technology suffix: `IndexedDBCacheAdapter`, `OpenAIAudioAdapter`
- Implement exactly one port interface
- Handle all infrastructure errors and convert to typed errors
- Receive dependencies via constructor

## Creating a Domain Service

Domain services contain pure business logic.

```typescript
// core/example/example-service.ts

import type { IExamplePort } from '../../ports/example.port';
import type { IOtherPort } from '../../ports/other.port';
import type { Result } from '../shared/result';
import { Ok, Err, isErr } from '../shared/result';

export interface ExampleServiceDependencies {
  examplePort: IExamplePort;
  otherPort: IOtherPort;
}

export class ExampleService {
  constructor(private readonly deps: ExampleServiceDependencies) {}

  async performAction(input: Input): Promise<Result<Output, DomainError>> {
    // Use port interface, not concrete implementation
    const result = await this.deps.examplePort.doSomething(input.id);

    if (isErr(result)) {
      return Err({ type: 'action_failed', reason: result.error });
    }

    // Business logic here
    return Ok({ processed: result.value });
  }
}
```

**Rules**:
- Services depend only on port interfaces (via dependencies object)
- Services never import from adapters/
- Services never use browser APIs directly
- All operations return `Result<T, E>`
- Services are stateless (state in PlaybackState entity)

## Wiring in Composition Root

The composition root creates adapters and wires them to services.

```typescript
// composition/container.ts

import { PlaybackService } from '../core/playback/playback-service';
import { OpenAIAudioAdapter } from '../adapters/audio/openai-audio.adapter';
import { IndexedDBCacheAdapter } from '../adapters/cache/indexeddb-cache.adapter';
import { HighlightSyncAdapter } from '../adapters/messaging/highlight-sync.adapter';

export interface AppConfig {
  provider: ProviderId;
  apiKeys: Record<ProviderId, string>;
}

export function createContainer(config: AppConfig) {
  // Create adapters
  const audioGenerator = createAudioGeneratorAdapter(config.provider, config.apiKeys);
  const cacheStore = new IndexedDBCacheAdapter();
  const highlightSync = new HighlightSyncAdapter();
  const settingsStore = new BrowserSettingsAdapter();

  // Create services with injected dependencies
  const playbackService = new PlaybackService({
    audioGenerator,
    cacheStore,
    highlightSync,
    settingsStore,
  });

  return {
    playbackService,
    cacheStore,
    audioGenerator,
  };
}

function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKeys: Record<ProviderId, string>
): IAudioGenerator {
  switch (provider) {
    case 'openai':
      return new OpenAIAudioAdapter(apiKeys.openai);
    case 'elevenlabs':
      return new ElevenLabsAudioAdapter(apiKeys.elevenlabs);
    // ... other providers
    default:
      return new BrowserAudioAdapter();
  }
}
```

## Message Handler Delegation

Handlers delegate to domain services.

```typescript
// handlers/playback.handlers.ts

import type { PlaybackService } from '../core/playback/playback-service';
import type { HandlerRegistry } from './registry';

export function registerPlaybackHandlers(
  registry: HandlerRegistry,
  playbackService: PlaybackService
) {
  registry.register('playback.start', async (params) => {
    const result = await playbackService.start(params.mode, params.provider);
    if (result.ok) {
      return { success: true, status: result.value.status };
    }
    return { success: false, error: result.error.type };
  });

  registry.register('playback.pause', async () => {
    const result = await playbackService.pause();
    return { success: result.ok };
  });

  // ... other handlers
}
```

## Testing Patterns

### Unit Testing Domain Services

```typescript
// tests/unit/core/playback-service.test.ts

import { PlaybackService } from '../../../src/core/playback/playback-service';
import { Ok } from '../../../src/core/shared/result';

describe('PlaybackService', () => {
  // Create mock ports
  const mockAudioGenerator = {
    generateAudio: jest.fn(),
    getVoices: jest.fn(),
    validateCredentials: jest.fn(),
    providerId: 'mock' as const,
    supportsWordTiming: false,
    supportedLanguages: [],
  };

  const mockCacheStore = {
    get: jest.fn(),
    set: jest.fn(),
    // ... other methods
  };

  let service: PlaybackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlaybackService({
      audioGenerator: mockAudioGenerator,
      cacheStore: mockCacheStore,
      highlightSync: mockHighlightSync,
      settingsStore: mockSettingsStore,
    });
  });

  it('generates audio through port', async () => {
    mockAudioGenerator.generateAudio.mockResolvedValue(
      Ok({ audioBlob: new Blob(), durationMs: 1000, wordTimings: null })
    );

    const result = await service.start('article');

    expect(mockAudioGenerator.generateAudio).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
```

### Adapter Contract Tests

```typescript
// tests/contract/cache-adapter.contract.test.ts

import { IndexedDBCacheAdapter } from '../../src/adapters/cache/indexeddb-cache.adapter';
import { InMemoryCacheAdapter } from '../../src/adapters/cache/memory-cache.adapter';
import type { ICacheStore } from '../../src/ports/cache-store.port';

describe.each([
  ['IndexedDBCacheAdapter', () => new IndexedDBCacheAdapter()],
  ['InMemoryCacheAdapter', () => new InMemoryCacheAdapter()],
])('%s implements ICacheStore contract', (name, createAdapter) => {
  let adapter: ICacheStore;

  beforeEach(async () => {
    adapter = createAdapter();
    await adapter.clear();
  });

  it('stores and retrieves entries', async () => {
    const key = { urlHash: 'abc', paragraphIndex: 0, provider: 'test', voice: 'v1', contentHash: 'xyz' };
    const entry = createTestEntry();

    const setResult = await adapter.set(key, entry);
    expect(setResult.ok).toBe(true);

    const getResult = await adapter.get(key);
    expect(getResult.ok).toBe(true);
    expect(getResult.value?.durationMs).toBe(entry.durationMs);
  });

  it('returns null for missing entries', async () => {
    const key = { urlHash: 'missing', paragraphIndex: 0, provider: 'test', voice: 'v1', contentHash: 'xyz' };
    const result = await adapter.get(key);
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });

  // ... more contract tests
});
```

## Common Patterns

### Result Type Usage

```typescript
import { Ok, Err, isOk, isErr } from '../shared/result';

// Creating results
const success = Ok({ data: 'value' });
const failure = Err({ type: 'not_found', id: '123' });

// Checking results
if (isOk(result)) {
  console.log(result.value);  // TypeScript knows value exists
}

if (isErr(result)) {
  console.log(result.error);  // TypeScript knows error exists
}

// Chaining results
const result1 = await service.step1();
if (isErr(result1)) return result1;  // Early return

const result2 = await service.step2(result1.value);
if (isErr(result2)) return result2;

return Ok(result2.value);
```

### Adapter Error Conversion

```typescript
// Convert external errors to typed domain errors
async function fetchData(): Promise<Result<Data, FetchError>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 429) {
        return Err({ type: 'rate_limit', retryAfterMs: 60000 });
      }
      return Err({ type: 'network', message: `HTTP ${response.status}` });
    }
    return Ok(await response.json());
  } catch (error) {
    return Err({ type: 'network', message: String(error) });
  }
}
```

## Migration Checklist

When migrating existing code to hexagonal architecture:

1. [ ] Identify the external dependency being abstracted
2. [ ] Create port interface in `ports/`
3. [ ] Create adapter in `adapters/` implementing the port
4. [ ] Update service to depend on port interface
5. [ ] Wire adapter in composition root
6. [ ] Add adapter contract tests
7. [ ] Update unit tests to use mock ports
8. [ ] Remove direct infrastructure imports from domain

## Key Principles

1. **Dependency Rule**: Domain → Ports ← Adapters (never Domain → Adapters)
2. **Port Purity**: Ports define WHAT, never HOW
3. **Adapter Isolation**: Each adapter knows one technology
4. **Result Everywhere**: No thrown exceptions for expected failures
5. **Constructor Injection**: Dependencies passed at construction time
6. **Stateless Services**: State lives in entities, not services
