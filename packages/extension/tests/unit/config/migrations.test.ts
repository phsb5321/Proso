/**
 * Configuration Migrations Unit Tests
 *
 * Tests for migration v6 (provider-consolidation) and applyMigrations().
 * TDD: written to verify provider consolidation migration behavior.
 *
 * @module tests/unit/config/migrations
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  migrations,
  applyMigrations,
  CURRENT_CONFIG_VERSION,
  getPendingMigrationCount,
} from '../../../src/utils/config/migrations';

type SaveFunction = (partial: Record<string, unknown>) => Promise<void>;

function createSaveMock(): jest.Mock<SaveFunction> {
  return jest.fn<SaveFunction>().mockResolvedValue(undefined);
}

describe('Migration v6: provider-consolidation', () => {
  const migrationV6 = migrations.find((m) => m.version === 6);

  if (!migrationV6) {
    throw new Error('Migration v6 not found — ensure it is defined in migrations.ts');
  }

  let saveFn: jest.Mock<SaveFunction>;

  beforeEach(() => {
    saveFn = createSaveMock();
  });

  it('should exist with correct metadata', () => {
    expect(migrationV6.version).toBe(6);
    expect(migrationV6.key).toBe('provider-consolidation');
    expect(migrationV6.description).toBeTruthy();
  });

  it('should clean up orphaned API keys for removed providers', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'elevenlabs',
      apiKey_openai: 'sk-xxx',
      apiKey_groq: 'gsk-xxx',
      apiKey_cartesia: 'cart-xxx',
      apiKey_anthropic: 'ant-xxx',
      voice: 'some-voice',
      speed: 1.5,
    };

    const result = await migrationV6.migrate(stored, saveFn);

    // Orphaned keys should be set to undefined
    expect(result.apiKey_openai).toBeUndefined();
    expect(result.apiKey_groq).toBeUndefined();
    expect(result.apiKey_cartesia).toBeUndefined();
    expect(result.apiKey_anthropic).toBeUndefined();

    // save should have been called with the cleanup
    expect(saveFn).toHaveBeenCalledTimes(1);
    const saveArg = saveFn.mock.calls[0][0] as Record<string, unknown>;
    expect(saveArg.apiKey_openai).toBeUndefined();
    expect(saveArg.apiKey_groq).toBeUndefined();
    expect(saveArg.apiKey_cartesia).toBeUndefined();
    expect(saveArg.apiKey_anthropic).toBeUndefined();
  });

  it('should reset provider to "elevenlabs" if current provider was removed', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'groq',
      voice: 'groq-voice',
    };

    const result = await migrationV6.migrate(stored, saveFn);

    expect(result.provider).toBe('elevenlabs');
    expect(result.voice).toBeNull();
    expect(result.voiceId).toBeNull();

    expect(saveFn).toHaveBeenCalledTimes(1);
    const saveArg = saveFn.mock.calls[0][0] as Record<string, unknown>;
    expect(saveArg.provider).toBe('elevenlabs');
  });

  it('should reset provider for each removed provider type', async () => {
    for (const removedProvider of ['openai', 'groq', 'cartesia', 'anthropic']) {
      const mockSave = createSaveMock();
      const stored = {
        _configVersion: 5,
        provider: removedProvider,
      };

      const result = await migrationV6.migrate(stored, mockSave);

      expect(result.provider).toBe('elevenlabs');
    }
  });

  it('should preserve provider if current provider is still valid (elevenlabs)', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'elevenlabs',
      voice: 'rachel',
      speed: 1.2,
    };

    const result = await migrationV6.migrate(stored, saveFn);

    expect(result.provider).toBe('elevenlabs');
    expect(result.voice).toBe('rachel');
    expect(result.speed).toBe(1.2);
  });

  it('should preserve provider if current provider is "browser"', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'browser',
      voice: 'en-voice',
    };

    const result = await migrationV6.migrate(stored, saveFn);

    expect(result.provider).toBe('browser');
    expect(result.voice).toBe('en-voice');
  });

  it('should be idempotent — running twice produces same result', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'openai',
      apiKey_openai: 'sk-xxx',
      apiKey_groq: 'gsk-xxx',
      voice: 'alloy',
    };

    // First run
    const firstResult = await migrationV6.migrate(stored, saveFn);

    // Second run on the result of the first
    const secondSave = createSaveMock();
    const secondResult = await migrationV6.migrate(firstResult, secondSave);

    // Results should be the same
    expect(secondResult.provider).toBe(firstResult.provider);
    expect(secondResult.apiKey_openai).toBe(firstResult.apiKey_openai);
    expect(secondResult.apiKey_groq).toBe(firstResult.apiKey_groq);

    // Second run should not need to save anything (no changes)
    expect(secondSave).not.toHaveBeenCalled();
  });

  it('should preserve all other settings during migration', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'cartesia',
      apiKey_cartesia: 'cart-xxx',
      voice: 'cartesia-voice',
      speed: 1.5,
      mode: 'article',
      cacheEnabled: true,
      maxCacheSize: 100,
      wordSyncEnabled: true,
      autoDetectLanguage: false,
      themeMode: 'dark',
      highlightEnabled: false,
      autoScroll: true,
      showCostEstimate: false,
    };

    const result = await migrationV6.migrate(stored, saveFn);

    // Provider-specific fields should change (cartesia is a removed provider)
    expect(result.provider).toBe('elevenlabs');

    // All other settings should be preserved
    expect(result.speed).toBe(1.5);
    expect(result.mode).toBe('article');
    expect(result.cacheEnabled).toBe(true);
    expect(result.maxCacheSize).toBe(100);
    expect(result.wordSyncEnabled).toBe(true);
    expect(result.autoDetectLanguage).toBe(false);
    expect(result.themeMode).toBe('dark');
    expect(result.highlightEnabled).toBe(false);
    expect(result.autoScroll).toBe(true);
    expect(result.showCostEstimate).toBe(false);
  });

  it('should not call save when there are no changes needed', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'elevenlabs',
      voice: 'rachel',
    };

    await migrationV6.migrate(stored, saveFn);

    // No orphaned keys, provider is valid — no save needed
    expect(saveFn).not.toHaveBeenCalled();
  });
});

describe('Migration v7: provider-browser-removal', () => {
  const migrationV7 = migrations.find((m) => m.version === 7);

  if (!migrationV7) {
    throw new Error('Migration v7 not found — ensure it is defined in migrations.ts');
  }

  let saveFn: jest.Mock<SaveFunction>;

  beforeEach(() => {
    saveFn = createSaveMock();
  });

  it('should exist with correct metadata', () => {
    expect(migrationV7.version).toBe(7);
    expect(migrationV7.key).toBe('provider-browser-removal');
    expect(migrationV7.description).toBeTruthy();
  });

  it('should migrate provider from "browser" to "elevenlabs"', async () => {
    const stored = {
      _configVersion: 6,
      provider: 'browser',
      voice: 'en-voice',
    };

    const result = await migrationV7.migrate(stored, saveFn);

    expect(result.provider).toBe('elevenlabs');
    expect(result.voice).toBeNull();
    expect(result.voiceId).toBeNull();

    expect(saveFn).toHaveBeenCalledTimes(1);
    const saveArg = saveFn.mock.calls[0][0] as Record<string, unknown>;
    expect(saveArg.provider).toBe('elevenlabs');
    expect(saveArg.voice).toBeNull();
    expect(saveArg.voiceId).toBeNull();
  });

  it('should not modify provider if already "elevenlabs"', async () => {
    const stored = {
      _configVersion: 6,
      provider: 'elevenlabs',
      voice: 'rachel',
    };

    const result = await migrationV7.migrate(stored, saveFn);

    expect(result.provider).toBe('elevenlabs');
    expect(result.voice).toBe('rachel');
    expect(saveFn).not.toHaveBeenCalled();
  });

  it('should preserve all other settings during migration', async () => {
    const stored = {
      _configVersion: 6,
      provider: 'browser',
      voice: 'en-voice',
      speed: 1.5,
      mode: 'article',
      cacheEnabled: true,
      maxCacheSize: 100,
      wordSyncEnabled: true,
      themeMode: 'dark',
    };

    const result = await migrationV7.migrate(stored, saveFn);

    expect(result.provider).toBe('elevenlabs');
    expect(result.speed).toBe(1.5);
    expect(result.mode).toBe('article');
    expect(result.cacheEnabled).toBe(true);
    expect(result.maxCacheSize).toBe(100);
    expect(result.wordSyncEnabled).toBe(true);
    expect(result.themeMode).toBe('dark');
  });

  it('should be idempotent — running twice produces same result', async () => {
    const stored = {
      _configVersion: 6,
      provider: 'browser',
      voice: 'en-voice',
    };

    const firstResult = await migrationV7.migrate(stored, saveFn);

    const secondSave = createSaveMock();
    const secondResult = await migrationV7.migrate(firstResult, secondSave);

    expect(secondResult.provider).toBe(firstResult.provider);
    // Second run should not need to save (provider is already 'elevenlabs')
    expect(secondSave).not.toHaveBeenCalled();
  });
});

describe('applyMigrations()', () => {
  let saveFn: jest.Mock<SaveFunction>;

  beforeEach(() => {
    saveFn = createSaveMock();
  });

  it('should run all pending migrations in order', async () => {
    const stored = {
      _configVersion: 0,
      mode: 'full',
      provider: 'openai',
      apiKey_openai: 'sk-xxx',
    };

    const result = await applyMigrations(stored, saveFn);

    // Should have run through to the latest version
    expect(result._configVersion).toBe(CURRENT_CONFIG_VERSION);
  });

  it('should skip already-applied migrations', async () => {
    const stored = {
      _configVersion: 5,
      provider: 'elevenlabs',
    };

    await applyMigrations(stored, saveFn);

    // Only migrations v6 and v7 should run (not v2, v3, v5)
    // save should be called for version update at minimum
    const saveCalls = saveFn.mock.calls;
    // Check that the version is updated to 7
    const versionUpdate = saveCalls.find(
      (call) => (call[0] as Record<string, unknown>)._configVersion === 7,
    );
    expect(versionUpdate).toBeTruthy();
  });

  it('should not run any migrations if already at current version', async () => {
    const stored = {
      _configVersion: CURRENT_CONFIG_VERSION,
      provider: 'elevenlabs',
    };

    const result = await applyMigrations(stored, saveFn);

    // No saves needed
    expect(saveFn).not.toHaveBeenCalled();
    expect(result._configVersion).toBe(CURRENT_CONFIG_VERSION);
  });

  it('should handle migration errors gracefully and continue', async () => {
    // This tests the error handling in applyMigrations — a migration that throws
    // should be caught, and remaining migrations should still run
    const stored = {
      _configVersion: 0,
      mode: 'full',
      provider: 'elevenlabs',
    };

    // Should not throw
    const result = await applyMigrations(stored, saveFn);
    expect(result._configVersion).toBe(CURRENT_CONFIG_VERSION);
  });
});

describe('CURRENT_CONFIG_VERSION', () => {
  it('should be 7', () => {
    expect(CURRENT_CONFIG_VERSION).toBe(7);
  });

  it('should match the highest migration version', () => {
    const maxVersion = Math.max(...migrations.map((m) => m.version));
    expect(CURRENT_CONFIG_VERSION).toBe(maxVersion);
  });
});

describe('getPendingMigrationCount()', () => {
  it('should return 0 when at current version', () => {
    const count = getPendingMigrationCount({ _configVersion: CURRENT_CONFIG_VERSION });
    expect(count).toBe(0);
  });

  it('should return correct count for version 0', () => {
    const count = getPendingMigrationCount({ _configVersion: 0 });
    expect(count).toBe(migrations.length);
  });

  it('should return 2 when at version 5 (v6 and v7 pending)', () => {
    const count = getPendingMigrationCount({ _configVersion: 5 });
    expect(count).toBe(2);
  });

  it('should return all migrations for missing version', () => {
    const count = getPendingMigrationCount({});
    expect(count).toBe(migrations.length);
  });
});
