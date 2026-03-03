// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Configuration Migrations
 * Version-based migration logic for configuration changes
 *
 * @module utils/config/migrations
 * @description Handles default value changes across versions.
 * Migrations respect explicit user choices (FR-010a/b).
 */

import { defaults } from './defaults';

/**
 * Current configuration version
 * Increment when adding new migrations
 */
export const CURRENT_CONFIG_VERSION = 7;

/**
 * Storage object with migration flags
 */
interface StoredSettings extends Record<string, unknown> {
  _configVersion?: number;
  _modeExplicit?: boolean;
  _modeV2Migrated?: boolean;
  mode?: string;
  provider?: string;
  voice?: string | null;
  voiceId?: string | null;
  themeMode?: string;
  highlightEnabled?: boolean;
  autoScroll?: boolean;
}

/**
 * Save function type for partial updates
 */
type SaveFunction = (partial: Record<string, unknown>) => Promise<void>;

/**
 * Migration function type
 */
type MigrationFunction = (stored: StoredSettings, save: SaveFunction) => Promise<StoredSettings>;

/**
 * Migration definition
 */
interface Migration {
  version: number;
  key: string;
  description: string;
  migrate: MigrationFunction;
}

/**
 * Migration definitions
 * Each migration has:
 * - version: Unique monotonically increasing version number
 * - key: Setting key being migrated
 * - description: Human-readable description
 * - migrate: Async function that performs the migration
 */
export const migrations: Migration[] = [
  {
    version: 2,
    key: 'mode',
    description: 'Change default mode from full to article',
    /**
     * Migrate mode default from 'full' to 'article'
     * Only applies if user never explicitly changed mode
     */
    migrate: async (stored, save) => {
      // Check if already migrated
      if (stored._modeV2Migrated) {
        return stored;
      }

      // Check if user explicitly set mode
      if (stored._modeExplicit) {
        // User chose their mode, don't override
        await save({ _modeV2Migrated: true });
        return { ...stored, _modeV2Migrated: true };
      }

      // Apply new default
      const updated = {
        ...stored,
        mode: defaults.mode, // 'article'
        _modeV2Migrated: true,
      };
      await save({ mode: defaults.mode, _modeV2Migrated: true });
      console.log('Proso: Migrated mode to article');
      return updated;
    },
  },
  {
    version: 3,
    key: 'mode',
    description: 'Fix stuck full mode - force article mode if not explicitly set',
    /**
     * Fix users stuck with mode='full' after incomplete migration
     * This handles the bug where v2 migration ran but mode stayed 'full'
     */
    migrate: async (stored, save) => {
      // If user explicitly chose their mode, don't touch it
      if (stored._modeExplicit) {
        console.log('Proso: Mode explicitly set by user, keeping:', stored.mode);
        return stored;
      }

      // If mode is 'full' and wasn't explicitly set, change to 'article'
      if (stored.mode === 'full') {
        const updated = {
          ...stored,
          mode: defaults.mode, // 'article'
        };
        await save({ mode: defaults.mode });
        console.log('Proso: Fixed stuck mode from full to article');
        return updated;
      }

      // Mode is already article or selection, no change needed
      return stored;
    },
  },
  {
    version: 5,
    key: 'themeMode',
    description:
      'Add themeMode, highlightEnabled, and autoScroll settings (027-settings-ux-overhaul)',
    /**
     * Add new settings fields with sensible defaults
     * No data loss risk - only adds new fields
     */
    migrate: async (stored, save) => {
      const updates: Record<string, unknown> = {};

      // Add themeMode if not present
      if (stored.themeMode === undefined) {
        updates.themeMode = defaults.themeMode; // 'system'
      }

      // Add highlightEnabled if not present
      if (stored.highlightEnabled === undefined) {
        updates.highlightEnabled = defaults.highlightEnabled; // true
      }

      // Add autoScroll if not present
      if (stored.autoScroll === undefined) {
        updates.autoScroll = defaults.autoScroll; // true
      }

      if (Object.keys(updates).length > 0) {
        await save(updates);
        console.log('Proso: Added settings-ux-overhaul fields:', Object.keys(updates));
        return { ...stored, ...updates };
      }

      return stored;
    },
  },
  {
    version: 6,
    key: 'provider-consolidation',
    description:
      'Remove orphaned provider data from removed providers (OpenAI, Groq, Cartesia, Anthropic)',
    /**
     * Clean up orphaned API keys from removed providers and reset
     * provider to 'elevenlabs' if user had a removed provider configured.
     */
    migrate: async (stored, save) => {
      const removedProviders = ['openai', 'groq', 'cartesia', 'anthropic'];
      const updates: Record<string, unknown> = {};

      // Clean up orphaned API keys
      for (const provider of removedProviders) {
        if (stored[`apiKey_${provider}`]) {
          updates[`apiKey_${provider}`] = undefined;
        }
      }

      // Reset provider to 'elevenlabs' if it was a removed provider
      if (removedProviders.includes(stored.provider as string)) {
        updates.provider = 'elevenlabs';
        updates.voice = null;
        updates.voiceId = null;
      }

      if (Object.keys(updates).length > 0) {
        await save(updates);
        console.log('Proso: Cleaned up orphaned provider data:', Object.keys(updates));
        return { ...stored, ...updates };
      }

      return stored;
    },
  },
  {
    version: 7,
    key: 'provider-browser-removal',
    description: 'Remove browser TTS provider — migrate users to ElevenLabs',
    /**
     * Browser TTS has been removed due to poor quality.
     * Migrate any user with provider='browser' to 'elevenlabs'.
     */
    migrate: async (stored, save) => {
      if (stored.provider === 'browser') {
        const updates: Record<string, unknown> = {
          provider: 'elevenlabs',
          voice: null,
          voiceId: null,
        };
        await save(updates);
        console.log('Proso: Migrated from browser TTS to ElevenLabs');
        return { ...stored, ...updates };
      }
      return stored;
    },
  },
];

/**
 * Apply all pending migrations to stored settings
 * @param stored - Current stored settings from browser.storage.local
 * @param save - Function to save settings (receives partial object)
 * @returns Settings after all migrations applied
 */
export async function applyMigrations(
  stored: StoredSettings,
  save: SaveFunction,
): Promise<StoredSettings> {
  let current = { ...stored };
  const currentVersion = stored._configVersion || 0;

  // Get migrations that need to run (version > current)
  const pendingMigrations = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length === 0) {
    return current;
  }

  // Run each migration in order
  for (const migration of pendingMigrations) {
    try {
      current = await migration.migrate(current, save);
      console.log(`Proso: Applied migration v${migration.version}: ${migration.description}`);
    } catch (error) {
      console.error(`Proso: Migration v${migration.version} failed:`, error);
      // Continue with other migrations
    }
  }

  // Update config version
  const maxVersion = Math.max(...pendingMigrations.map((m) => m.version));
  if (maxVersion > currentVersion) {
    await save({ _configVersion: maxVersion });
    current._configVersion = maxVersion;
  }

  return current;
}

/**
 * Get pending migration count
 * @param stored - Current stored settings
 * @returns Number of pending migrations
 */
export function getPendingMigrationCount(stored: StoredSettings): number {
  const currentVersion = stored._configVersion || 0;
  return migrations.filter((m) => m.version > currentVersion).length;
}

export default migrations;
