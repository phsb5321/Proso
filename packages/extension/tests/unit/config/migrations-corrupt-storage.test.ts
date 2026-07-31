import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  CURRENT_CONFIG_VERSION,
  applyMigrations,
  getPendingMigrationCount,
  migrations,
} from '../../../src/utils/config/migrations';

const migrationV2 = migrations.find((migration) => migration.version === 2);
if (!migrationV2) throw new Error('Migration v2 is required by the corruption regression test');
const originalMigrationV2 = migrationV2.migrate;

afterEach(() => {
  migrationV2.migrate = originalMigrationV2;
});

describe('configuration migration corruption handling', () => {
  it('treats a corrupt stored version as an unmigrated configuration', async () => {
    const corrupted = {
      _configVersion: 'not-a-version' as unknown as number,
      provider: 'browser',
    };
    const save = jest.fn(async () => undefined);

    expect(getPendingMigrationCount(corrupted)).toBe(migrations.length);
    const migrated = await applyMigrations(corrupted, save);

    expect(migrated._configVersion).toBe(CURRENT_CONFIG_VERSION);
    expect(migrated.provider).toBe('elevenlabs');
  });

  it('does not mark dependent migrations complete after an earlier migration fails', async () => {
    migrationV2.migrate = jest.fn(async () => {
      throw new Error('corrupt storage write');
    });
    const save = jest.fn(async () => undefined);

    const migrated = await applyMigrations({ _configVersion: 0, mode: 'full' }, save);

    expect(migrated._configVersion).toBe(0);
    expect(save).not.toHaveBeenCalledWith(
      expect.objectContaining({ _configVersion: expect.any(Number) }),
    );
  });
});
