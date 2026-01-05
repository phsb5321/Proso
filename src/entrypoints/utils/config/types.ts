/**
 * Configuration type definitions
 */

export interface VoxPageSettings {
  provider: string;
  speed: number;
  mode: string;
  voice: string | null;
  showCostEstimate: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
  wordSyncEnabled: boolean;
}

export interface ApiKeys {
  openaiApiKey?: string;
  elevenlabsApiKey?: string;
  cartesiaApiKey?: string;
  groqApiKey?: string;
}

export interface UISettings {
  highlightEnabled: boolean;
  autoScroll: boolean;
}

export interface LoggingConfig {
  enabled: boolean;
  endpoint: string | null;
  authType: 'none' | 'basic' | 'bearer' | 'cloudflare';
  username?: string | null;
  password?: string | null;
  bearerToken?: string | null;
  cfAccessClientId?: string | null;
  cfAccessClientSecret?: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  batchIntervalMs: number;
  maxBatchSize: number;
  maxBufferBytes: number;
}

export interface LogEntry {
  date: string;
  level: string;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogViewerResponse {
  logs: LogEntry[];
  status: {
    bufferBytes: number;
  };
}

export interface EndpointValidation {
  valid: boolean;
  error?: string;
}

export interface QueueSettings {
  autoPlayNext: boolean;
  autoArchiveCompleted: boolean;
  archiveAfterDays: number;
  maxQueueSize: number;
}
