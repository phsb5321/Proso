/**
 * Default configuration values
 * These match the values in shared/config/defaults.js and shared/config/logging-defaults.js
 */

import type { VoxPageSettings, LoggingConfig, UISettings, QueueSettings } from './types';

export const settingsDefaults: VoxPageSettings = {
  provider: 'browser',
  speed: 1.0,
  mode: 'article',
  voice: null,
  showCostEstimate: true,
  cacheEnabled: true,
  maxCacheSize: 50,
  wordSyncEnabled: true,
};

export const loggingDefaults: LoggingConfig = {
  enabled: false,
  endpoint: null,
  authType: 'none',
  logLevel: 'warn',
  batchIntervalMs: 10000,
  maxBatchSize: 100,
  maxBufferBytes: 1048576, // 1MB
};

export const uiDefaults: UISettings = {
  highlightEnabled: true,
  autoScroll: true,
};

export const queueDefaults: QueueSettings = {
  autoPlayNext: true,
  autoArchiveCompleted: false,
  archiveAfterDays: 30,
  maxQueueSize: 300,
};
