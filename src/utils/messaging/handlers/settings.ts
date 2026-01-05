/**
 * Settings Message Handlers
 * Handles settings management messages
 *
 * @module utils/messaging/handlers/settings
 */

import type { VoxPageProtocol } from '../protocol';
import type { SettingsUpdateParams, SettingsMigrateParams } from '../types';
import { settingsUpdateParamsSchema, settingsMigrateParamsSchema } from '../schemas';

/**
 * Get settings handler
 */
export async function handleSettingsGet(): Promise<VoxPageProtocol['settings.get']['response']> {
  // TODO Phase 4: Delegate to SettingsStore.load()

  return {
    mode: 'article',
    provider: 'browser',
    voice: null,
    speed: 1.0,
    showCostEstimate: true,
    cacheEnabled: true,
    maxCacheSize: 50,
    wordSyncEnabled: true,
  };
}

/**
 * Update settings handler
 */
export async function handleSettingsUpdate(
  params: SettingsUpdateParams
): Promise<VoxPageProtocol['settings.update']['response']> {
  const validated = settingsUpdateParamsSchema.parse(params);

  // TODO Phase 4: Delegate to SettingsStore.save()

  return {
    success: true,
    settings: {
      mode: validated.mode ?? 'article',
      provider: validated.provider ?? 'browser',
      voice: validated.voice ?? null,
      speed: validated.speed ?? 1.0,
      showCostEstimate: validated.showCostEstimate ?? true,
      cacheEnabled: validated.cacheEnabled ?? true,
      maxCacheSize: validated.maxCacheSize ?? 50,
      wordSyncEnabled: validated.wordSyncEnabled ?? true,
    },
  };
}

/**
 * Migrate settings handler
 */
export async function handleSettingsMigrate(
  params: SettingsMigrateParams
): Promise<VoxPageProtocol['settings.migrate']['response']> {
  const validated = settingsMigrateParamsSchema.parse(params);

  // TODO Phase 4: Delegate to SettingsStore.migrate()

  return {
    success: true,
    migratedKeys: [],
  };
}
