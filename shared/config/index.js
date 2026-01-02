/**
 * VoxPage Configuration Module
 * Central export for all configuration-related functionality
 *
 * @module shared/config
 * @description Import configuration from this module to ensure SSOT compliance.
 *
 * @example
 * // In any component:
 * import { defaults, settingsStore } from '../shared/config/index.js';
 *
 * // Get default mode
 * const defaultMode = defaults.mode;
 *
 * // Load current settings
 * const settings = await settingsStore.load();
 */

// Default values - THE single source of truth
export {
  defaults,
  defaultVoices,
  constraints,
  MODES,
  PROVIDERS,
} from './defaults.js';

// Validation functions (plain JavaScript, no Zod)
export {
  validateSettings,
  validateSetting,
  getDefaultForKey,
} from './schema.js';

// Migration system
export {
  migrations,
  applyMigrations,
  getPendingMigrationCount,
  CURRENT_CONFIG_VERSION,
} from './migrations.js';

// Settings store
export { settingsStore, SettingsStore } from './store.js';

// Re-export defaults as default export for convenience
export { defaults as default } from './defaults.js';
