// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Configuration Migrations
 * Version-based migration logic for configuration changes
 *
 * @module utils/config/migrations
 * @description Handles default value changes across versions.
 * Migrations respect explicit user choices (FR-010a/b).
 */

import { defaults, languageDefaults } from './defaults';

/**
 * Current configuration version
 * Increment when adding new migrations
 * 049-tts-provider-consolidation: Bumped to 7 for OpenAI removal
 * v10: Remove Groq TTS provider
 */
export const CURRENT_CONFIG_VERSION = 10;

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
  themeMode?: string;
  highlightEnabled?: boolean;
  autoScroll?: boolean;
  // Language settings (048-multilingual-tts-pillar)
  languageAutoDetect?: boolean;
  languageDefault?: string;
  showLanguageBadge?: boolean;
  languagePreference?: {
    autoDetect?: boolean;
    currentOverride?: string | null;
    voicePreferences?: Record<string, string>;
  };
  // 049-tts-provider-consolidation: Legacy fields to remove
  openaiApiKey?: string;
  defaultVoices?: Record<string, string | null>;
  providerOverride?: string | null;
  // Legacy Groq settings (removed, kept for migration)
  groqModel?: string;
  groqVoice?: string | null;
  groqApiKey?: string;
  elevenlabsApiKey?: string;
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
      console.log('VoxPage: Migrated mode to article');
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
        console.log('VoxPage: Mode explicitly set by user, keeping:', stored.mode);
        return stored;
      }

      // If mode is 'full' and wasn't explicitly set, change to 'article'
      if (stored.mode === 'full') {
        const updated = {
          ...stored,
          mode: defaults.mode, // 'article'
        };
        await save({ mode: defaults.mode });
        console.log('VoxPage: Fixed stuck mode from full to article');
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
        console.log('VoxPage: Added settings-ux-overhaul fields:', Object.keys(updates));
        return { ...stored, ...updates };
      }

      return stored;
    },
  },
  {
    version: 6,
    key: 'languagePreference',
    description: 'Add language settings with voice preferences (048-multilingual-tts-pillar US5)',
    /**
     * Add language settings fields with sensible defaults
     * No data loss risk - only adds new fields if not present
     */
    migrate: async (stored, save) => {
      const updates: Record<string, unknown> = {};

      // Add languageAutoDetect if not present
      if (stored.languageAutoDetect === undefined) {
        updates.languageAutoDetect = languageDefaults.languageAutoDetect; // true
      }

      // Add languageDefault if not present
      if (stored.languageDefault === undefined) {
        updates.languageDefault = languageDefaults.languageDefault; // 'en'
      }

      // Add showLanguageBadge if not present
      if (stored.showLanguageBadge === undefined) {
        updates.showLanguageBadge = languageDefaults.showLanguageBadge; // true
      }

      // Add languagePreference object if not present
      if (stored.languagePreference === undefined) {
        updates.languagePreference = {
          autoDetect: languageDefaults.languageAutoDetect,
          currentOverride: null,
          voicePreferences: {},
        };
      }

      if (Object.keys(updates).length > 0) {
        await save(updates);
        console.log('VoxPage: Added language settings fields:', Object.keys(updates));
        return { ...stored, ...updates };
      }

      return stored;
    },
  },
  {
    version: 7,
    key: 'provider',
    description:
      'Remove OpenAI provider, migrate to ElevenLabs/Browser TTS (049-tts-provider-consolidation)',
    /**
     * 049-tts-provider-consolidation migration (T041-T044):
     * - T042: If user had OpenAI selected and has ElevenLabs key → elevenlabs, else → browser
     * - T043: Delete openaiApiKey from storage
     * - T044: Remove defaultVoices.openai
     *
     * This migration handles users who were using OpenAI as their provider.
     */
    migrate: async (stored, save) => {
      const updates: Record<string, unknown> = {};
      const keysToRemove: string[] = [];

      // T042: Migrate provider selection
      if (stored.provider === 'openai') {
        // Check if user has ElevenLabs API key configured
        // Note: We can't access browser.storage.local directly here,
        // so we rely on the elevenlabsApiKey being present in stored
        const hasElevenLabsKey = Boolean(stored.elevenlabsApiKey);

        if (hasElevenLabsKey) {
          updates.provider = 'elevenlabs';
          console.log('VoxPage: Migrated provider from openai to elevenlabs');
        } else {
          updates.provider = 'browser';
          console.log('VoxPage: Migrated provider from openai to browser (no ElevenLabs key)');
        }
      }

      // T043: Mark openaiApiKey for removal
      if (stored.openaiApiKey !== undefined) {
        keysToRemove.push('openaiApiKey');
        console.log('VoxPage: Marking openaiApiKey for removal');
      }

      // T044: Clean up defaultVoices if it has openai
      if (stored.defaultVoices && typeof stored.defaultVoices === 'object') {
        const cleanedVoices = { ...stored.defaultVoices };
        if ('openai' in cleanedVoices) {
          (cleanedVoices as Record<string, unknown>).openai = undefined;
          updates.defaultVoices = cleanedVoices;
          console.log('VoxPage: Removed openai from defaultVoices');
        }
      }

      // Add providerOverride field if not present (defaults to null = automatic)
      if (stored.providerOverride === undefined) {
        updates.providerOverride = null;
      }

      // Save updates
      if (Object.keys(updates).length > 0 || keysToRemove.length > 0) {
        await save(updates);

        // Note: Actual key removal happens via browser.storage.local.remove()
        // which should be called by the store after this migration
        if (keysToRemove.length > 0) {
          console.log('VoxPage: Keys to remove:', keysToRemove);
          // Store keys to remove for the store to handle
          (updates as Record<string, unknown>)._keysToRemove = keysToRemove;
        }

        console.log('VoxPage: Applied TTS provider consolidation migration');
        return { ...stored, ...updates };
      }

      return stored;
    },
  },
  {
    version: 8,
    key: 'groqSettings',
    description: 'Legacy: Add Groq TTS provider settings (no longer applies - Groq removed)',
    /**
     * Legacy migration - Groq has been removed.
     * Kept for version compatibility, but does nothing.
     */
    migrate: async (stored, _save) => {
      // No-op: Groq has been removed
      return stored;
    },
  },
  {
    version: 9,
    key: 'groqModel',
    description: 'Legacy: Fix invalid groqModel values (no longer applies - Groq removed)',
    /**
     * Legacy migration - Groq has been removed.
     * Kept for version compatibility, but does nothing.
     */
    migrate: async (stored, _save) => {
      // No-op: Groq has been removed
      return stored;
    },
  },
  {
    version: 10,
    key: 'removeGroq',
    description: 'Remove Groq TTS provider, migrate users to ElevenLabs',
    /**
     * Groq removal migration:
     * - T042: If user had Groq selected and has ElevenLabs key → elevenlabs, else → browser
     * - T043: Mark groqApiKey, groqModel, groqVoice for removal
     * - T044: Remove defaultVoices.groq
     *
     * This migration handles users who were using Groq as their provider.
     */
    migrate: async (stored, save) => {
      const updates: Record<string, unknown> = {};
      const keysToRemove: string[] = [];

      // Migrate provider selection
      if (stored.provider === 'groq') {
        // Check if user has ElevenLabs API key configured
        const hasElevenLabsKey = Boolean(stored.elevenlabsApiKey);

        if (hasElevenLabsKey) {
          updates.provider = 'elevenlabs';
          console.log('VoxPage: Migrated provider from groq to elevenlabs');
        } else {
          updates.provider = 'browser';
          console.log('VoxPage: Migrated provider from groq to browser (no ElevenLabs key)');
        }
      }

      // Migrate providerOverride if it was set to groq
      if (stored.providerOverride === 'groq') {
        const hasElevenLabsKey = Boolean(stored.elevenlabsApiKey);
        updates.providerOverride = hasElevenLabsKey ? 'elevenlabs' : null;
        console.log('VoxPage: Migrated providerOverride from groq to', updates.providerOverride);
      }

      // Mark Groq settings for removal
      if (stored.groqApiKey !== undefined) {
        keysToRemove.push('groqApiKey');
        console.log('VoxPage: Marking groqApiKey for removal');
      }
      if (stored.groqModel !== undefined) {
        keysToRemove.push('groqModel');
        console.log('VoxPage: Marking groqModel for removal');
      }
      if (stored.groqVoice !== undefined) {
        keysToRemove.push('groqVoice');
        console.log('VoxPage: Marking groqVoice for removal');
      }

      // Clean up defaultVoices if it has groq
      if (stored.defaultVoices && typeof stored.defaultVoices === 'object') {
        const cleanedVoices = { ...stored.defaultVoices };
        if ('groq' in cleanedVoices) {
          (cleanedVoices as Record<string, unknown>).groq = undefined;
          updates.defaultVoices = cleanedVoices;
          console.log('VoxPage: Removed groq from defaultVoices');
        }
      }

      // Save updates
      if (Object.keys(updates).length > 0 || keysToRemove.length > 0) {
        await save(updates);

        // Note: Actual key removal happens via browser.storage.local.remove()
        // which should be called by the store after this migration
        if (keysToRemove.length > 0) {
          console.log('VoxPage: Keys to remove:', keysToRemove);
          // Store keys to remove for the store to handle
          (updates as Record<string, unknown>)._keysToRemove = keysToRemove;
        }

        console.log('VoxPage: Applied Groq removal migration');
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
      console.log(`VoxPage: Applied migration v${migration.version}: ${migration.description}`);
    } catch (error) {
      console.error(`VoxPage: Migration v${migration.version} failed:`, error);
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
