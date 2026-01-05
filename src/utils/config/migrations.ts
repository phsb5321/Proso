/**
 * VoxPage Configuration Migrations
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
export const CURRENT_CONFIG_VERSION = 4;

/**
 * Valid Groq Orpheus voice IDs (as of Jan 2025)
 * PlayAI voices are deprecated
 */
const VALID_GROQ_VOICES = ['hannah', 'diana', 'autumn', 'troy', 'austin', 'daniel'] as const;

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
    version: 4,
    key: 'voice',
    description: 'Clear deprecated Groq PlayAI voices, use Orpheus voices',
    /**
     * Clear Groq voice if it's a deprecated PlayAI voice
     * PlayAI was deprecated Dec 2025, replaced by Orpheus
     */
    migrate: async (stored, save) => {
      // Only check if current provider is Groq
      if (stored.provider !== 'groq') {
        return stored;
      }

      const currentVoice = stored.voice;

      // If no voice set, nothing to migrate
      if (!currentVoice) {
        return stored;
      }

      // Check if voice is a valid Orpheus voice
      if (VALID_GROQ_VOICES.includes(currentVoice as typeof VALID_GROQ_VOICES[number])) {
        return stored;
      }

      // Check if it's an old PlayAI voice or any invalid voice
      const isPlayAI = currentVoice.includes('-PlayAI') || currentVoice.includes('PlayAI');
      const reason = isPlayAI ? 'deprecated PlayAI voice' : 'invalid voice';

      console.log(`VoxPage: Clearing ${reason} "${currentVoice}", will use default`);

      // Clear the voice to use provider default
      const updated = {
        ...stored,
        voice: null,
      };
      await save({ voice: null });
      return updated;
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
  save: SaveFunction
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
