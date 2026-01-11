/**
 * Usage Telemetry Types
 *
 * Type definitions for the usage tracking system that ships events to Loki.
 * This module defines all event types, configuration, and state interfaces.
 *
 * @module utils/telemetry/usage/types
 */

import { z } from 'zod';

// ============================================================================
// Enums and Constants
// ============================================================================

/**
 * Event categories for filtering and routing.
 * Used as Loki labels (low cardinality).
 */
export const EventGroup = {
  USER: 'user',
  SYSTEM: 'system',
  PLAYBACK: 'playback',
  PDF: 'pdf',
  NETWORK: 'network',
  SHIPPER: 'shipper',
  ERROR: 'error',
} as const;

export type EventGroup = (typeof EventGroup)[keyof typeof EventGroup];

/**
 * Log severity levels.
 * Used as Loki labels (low cardinality).
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Extension entry points.
 * Used as Loki labels (low cardinality).
 */
export const Entrypoint = {
  BACKGROUND: 'background',
  POPUP: 'popup',
  OPTIONS: 'options',
  CONTENT: 'content',
} as const;

export type Entrypoint = (typeof Entrypoint)[keyof typeof Entrypoint];

/**
 * TTS providers supported by VoxPage.
 * Used as Loki labels (low cardinality).
 */
export const Provider = {
  BROWSER: 'browser',
  ELEVENLABS: 'elevenlabs',
  OPENAI: 'openai',
  GROQ: 'groq',
  CARTESIA: 'cartesia',
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

/**
 * Deployment environments.
 */
export const Environment = {
  DEV: 'dev',
  STAGING: 'staging',
  PROD: 'prod',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];

// ============================================================================
// Event Types Taxonomy
// ============================================================================

/**
 * All tracked event types organized by category.
 * Event names follow dot-notation convention: category.action_detail
 */
export const UsageEventTypes = {
  // System lifecycle events
  'background.started': true,
  'background.suspended': true,
  'background.woken': true,
  'popup.opened': true,
  'popup.closed': true,
  'content.injected': true,
  'content.cleanup': true,
  'settings.opened': true,
  'settings.closed': true,

  // User interaction events
  'playback.play_clicked': true,
  'playback.pause_clicked': true,
  'playback.stop_clicked': true,
  'playback.skip_clicked': true,
  'playback.speed_changed': true,
  'paragraph.clicked': true,
  'paragraph.hover_preview': true,
  'selection.read_requested': true,

  // Settings events
  'settings.provider_changed': true,
  'settings.voice_changed': true,
  'settings.api_key_changed': true,
  'settings.api_key_test_clicked': true,
  'settings.api_key_test_result': true,
  'settings.speed_changed': true,
  'settings.pitch_changed': true,
  'settings.reset_clicked': true,

  // Playback pipeline events
  'playback.start_requested': true,
  'playback.state_changed': true,
  'playback.paragraph_started': true,
  'playback.paragraph_completed': true,
  'playback.completed': true,
  'playback.cancelled': true,

  // TTS generation events
  'tts.request_started': true,
  'tts.request_completed': true,
  'tts.request_failed': true,
  'tts.cache_hit': true,
  'tts.cache_miss': true,

  // Audio events
  'audio.load_started': true,
  'audio.load_completed': true,
  'audio.load_failed': true,
  'audio.playback_started': true,
  'audio.playback_ended': true,
  'audio.playback_error': true,

  // Cache events
  'cache.store_started': true,
  'cache.store_completed': true,
  'cache.store_failed': true,
  'cache.eviction_started': true,
  'cache.eviction_completed': true,
  'cache.cleanup_started': true,
  'cache.cleanup_completed': true,

  // PDF events
  'pdf.detected': true,
  'pdf.load_started': true,
  'pdf.load_completed': true,
  'pdf.load_failed': true,
  'pdf.text_extracted': true,
  'pdf.text_extraction_failed': true,
  'pdf.page_changed': true,

  // Highlight sync events
  'highlight.sync_started': true,
  'highlight.sync_completed': true,
  'highlight.sync_failed': true,
  'highlight.word_updated': true,

  // Network/API events
  'api.request_started': true,
  'api.request_completed': true,
  'api.request_failed': true,
  'api.rate_limited': true,
  'api.auth_failed': true,

  // Shipper health events
  'shipper.flush_started': true,
  'shipper.flush_completed': true,
  'shipper.flush_failed': true,
  'shipper.circuit_opened': true,
  'shipper.circuit_closed': true,
  'shipper.retry_scheduled': true,
  'shipper.buffer_overflow': true,

  // Error events
  'error.uncaught_exception': true,
  'error.unhandled_rejection': true,
  'error.handler_exception': true,
  'error.tts_generation': true,
  'error.audio_playback': true,
  'error.pdf_processing': true,
  'error.cache_operation': true,
  'error.network': true,
} as const;

export type UsageEventType = keyof typeof UsageEventTypes;

// ============================================================================
// Core Event Interface
// ============================================================================

/**
 * Base usage event structure.
 * All events follow this schema.
 */
export interface UsageEvent {
  /** ISO 8601 timestamp with millisecond precision */
  ts: string;

  /** Event name following dot-notation convention */
  event: string;

  /** Event category for filtering and routing */
  eventGroup: EventGroup;

  /** Log severity level */
  level: LogLevel;

  /** Human-readable message describing the event */
  msg: string;

  /** Extension context where event originated */
  entrypoint: Entrypoint;

  /** Extension version from manifest */
  extVersion: string;

  /** Stable UUID generated on first installation */
  installId: string;

  /** UUID generated per browser session */
  sessionId: string;

  /** UUID for correlating events in a single user action/flow */
  actionId?: string;

  /** Current TTS provider */
  provider?: Provider;

  /** Migration feature flags snapshot */
  flags?: Record<string, boolean>;

  /** SHA-256 hash of current page URL (privacy-preserving) */
  urlHash?: string;

  /** For PDF pages, the URL scheme */
  pdfScheme?: 'http' | 'https' | 'file';

  /** Event-specific structured data */
  data?: Record<string, unknown>;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const EventGroupSchema = z.enum([
  'user',
  'system',
  'playback',
  'pdf',
  'network',
  'shipper',
  'error',
]);

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const EntrypointSchema = z.enum(['background', 'popup', 'options', 'content']);

export const ProviderSchema = z.enum(['browser', 'elevenlabs', 'openai', 'groq', 'cartesia']);

export const EnvironmentSchema = z.enum(['dev', 'staging', 'prod']);

export const UsageEventSchema = z.object({
  ts: z.string().datetime(),
  event: z.string().min(1),
  eventGroup: EventGroupSchema,
  level: LogLevelSchema,
  msg: z.string(),
  entrypoint: EntrypointSchema,
  extVersion: z.string(),
  installId: z.string().uuid(),
  sessionId: z.string().uuid(),
  actionId: z.string().uuid().optional(),
  provider: ProviderSchema.optional(),
  flags: z.record(z.boolean()).optional(),
  urlHash: z.string().optional(),
  pdfScheme: z.enum(['http', 'https', 'file']).optional(),
  data: z.record(z.unknown()).optional(),
});

// ============================================================================
// Buffer Types
// ============================================================================

/**
 * Statistics about the event buffer.
 */
export interface BufferStats {
  /** Number of events in buffer */
  eventCount: number;

  /** Total size of buffered events in bytes */
  totalBytes: number;

  /** Buffer capacity in bytes */
  maxBytes: number;

  /** Percentage of buffer used (0-100) */
  percentFull: number;

  /** Age of oldest event in milliseconds */
  oldestEventAgeMs: number;

  /** Number of events dropped due to overflow */
  droppedCount: number;
}

/**
 * Configuration for the IndexedDB event buffer.
 */
export interface BufferConfig {
  /** Maximum buffer size in bytes (default: 10MB) */
  maxBytes: number;

  /** Maximum age of events before cleanup in ms (default: 14 days) */
  maxAgeMs: number;

  /** IndexedDB database name */
  dbName: string;

  /** IndexedDB object store name */
  storeName: string;
}

/**
 * Stored event in IndexedDB with metadata.
 */
export interface StoredEvent {
  /** Auto-incrementing key */
  id?: number;

  /** Event data */
  event: UsageEvent;

  /** Serialized size in bytes */
  sizeBytes: number;

  /** Storage timestamp for TTL */
  storedAt: number;
}

// ============================================================================
// Shipper Types
// ============================================================================

/**
 * Current state of the HTTP shipper.
 */
export interface ShipperState {
  /** Whether the circuit breaker is open */
  circuitOpen: boolean;

  /** Number of consecutive failures */
  consecutiveFailures: number;

  /** Timestamp when circuit was opened (null if closed) */
  circuitOpenedAt: number | null;

  /** Total events sent successfully */
  totalEventsSent: number;

  /** Total events that failed to send */
  totalEventsFailed: number;

  /** Last successful send timestamp */
  lastSuccessAt: number | null;

  /** Last failure timestamp */
  lastFailureAt: number | null;

  /** Last error message */
  lastError: string | null;
}

/**
 * Configuration for the HTTP shipper.
 */
export interface ShipperConfig {
  /** Gateway URL for event ingestion */
  gatewayUrl: string;

  /** Bearer token for authentication */
  gatewayToken: string;

  /** Maximum retry attempts (default: 3) */
  maxRetries: number;

  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelayMs: number;

  /** Maximum delay between retries in ms (default: 30000) */
  retryMaxDelayMs: number;

  /** Failures before circuit opens (default: 5) */
  maxConsecutiveFailures: number;

  /** Time before circuit auto-closes in ms (default: 60000) */
  circuitResetMs: number;

  /** Enable gzip compression (default: true) */
  enableGzip: boolean;

  /** Minimum batch size for gzip in bytes (default: 1024) */
  gzipThresholdBytes: number;
}

// ============================================================================
// Tracker Configuration
// ============================================================================

/**
 * Full configuration for the UsageTracker.
 */
export interface UsageTrackerConfig {
  /** Master enable switch */
  enabled: boolean;

  /** Gateway URL for event ingestion */
  gatewayUrl: string;

  /** Bearer token for gateway auth */
  gatewayToken: string;

  /** Deployment environment */
  environment: Environment;

  /** Extension entry point context */
  entrypoint: Entrypoint;

  // Buffer settings
  /** Maximum buffer size in bytes (default: 10MB) */
  maxBufferBytes: number;

  /** Maximum event age in ms (default: 14 days) */
  maxBufferAgeMs: number;

  // Flush triggers
  /** Periodic flush interval in ms (default: 30000) */
  flushIntervalMs: number;

  /** Batch size threshold for flush (default: 100) */
  flushBatchSize: number;

  /** Immediate flush on error events (default: true) */
  flushOnError: boolean;

  // Circuit breaker
  /** Failures before opening circuit (default: 5) */
  maxConsecutiveFailures: number;

  /** Auto-close delay in ms (default: 60000) */
  circuitResetMs: number;

  // Retry
  /** Max retry attempts (default: 3) */
  maxRetries: number;

  /** Base retry delay in ms (default: 1000) */
  retryBaseDelayMs: number;

  /** Max retry delay in ms (default: 30000) */
  retryMaxDelayMs: number;

  // Debug
  /** Log events to console (dev only) */
  debugMode: boolean;
}

/**
 * Partial config for initialization (most fields have defaults).
 */
export type UsageTrackerInitConfig = Partial<UsageTrackerConfig> &
  Pick<UsageTrackerConfig, 'gatewayUrl' | 'gatewayToken'>;

// ============================================================================
// Tracker Stats
// ============================================================================

/**
 * Runtime statistics for the tracker.
 */
export interface TrackerStats {
  /** Whether tracking is enabled */
  enabled: boolean;

  /** Whether tracker is initialized */
  initialized: boolean;

  /** Buffer statistics */
  buffer: BufferStats;

  /** Shipper state */
  shipper: ShipperState;

  /** Current context info */
  context: {
    installId: string;
    sessionId: string;
    entrypoint: Entrypoint;
    provider?: Provider;
  };
}

// ============================================================================
// Track Options
// ============================================================================

/**
 * Options for tracking an event.
 */
export interface TrackOptions {
  /** Correlation ID for related events */
  actionId?: string;

  /** Skip immediate flush even for error events */
  skipFlush?: boolean;
}

// ============================================================================
// Loki Types (for gateway)
// ============================================================================

/**
 * Labels attached to Loki log streams.
 * All values must be low-cardinality.
 */
export interface LokiLabels {
  /** Application identifier */
  app: 'voxpage';

  /** Deployment environment */
  env: Environment;

  /** Extension context */
  entrypoint: Entrypoint;

  /** Log severity */
  level: LogLevel;

  /** Event category */
  event_group: EventGroup;

  /** Extension version */
  ext_version: string;

  /** TTS provider */
  provider?: Provider;
}

/**
 * Loki push request format.
 */
export interface LokiPushRequest {
  streams: LokiStream[];
}

export interface LokiStream {
  /** Low-cardinality labels */
  stream: LokiLabels;

  /** Array of log entries: [timestamp_ns, json_line, structured_metadata?] */
  values: LokiEntry[];
}

/** [timestamp_ns, json_line, structured_metadata?] */
export type LokiEntry = [string, string, Record<string, string>?];

// ============================================================================
// Gateway Types
// ============================================================================

/**
 * Ingest request to gateway.
 */
export interface IngestRequest {
  events: UsageEvent[];
}

/**
 * Validation error response from gateway.
 */
export interface ValidationErrorResponse {
  error: 'validation_error';
  details: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Rate limit response from gateway.
 */
export interface RateLimitResponse {
  error: 'rate_limited';
  retryAfter: number;
}

/**
 * Gateway error response.
 */
export interface GatewayErrorResponse {
  error: 'loki_unavailable';
  message: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxBytes: 10 * 1024 * 1024, // 10MB
  maxAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  dbName: 'voxpage_usage',
  storeName: 'events',
};

export const DEFAULT_SHIPPER_CONFIG: Omit<ShipperConfig, 'gatewayUrl' | 'gatewayToken'> = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30000,
  maxConsecutiveFailures: 5,
  circuitResetMs: 60000,
  enableGzip: true,
  gzipThresholdBytes: 1024,
};

export const DEFAULT_TRACKER_CONFIG: Omit<
  UsageTrackerConfig,
  'gatewayUrl' | 'gatewayToken' | 'entrypoint'
> = {
  enabled: true,
  environment: 'prod',
  maxBufferBytes: DEFAULT_BUFFER_CONFIG.maxBytes,
  maxBufferAgeMs: DEFAULT_BUFFER_CONFIG.maxAgeMs,
  flushIntervalMs: 30000,
  flushBatchSize: 100,
  flushOnError: true,
  maxConsecutiveFailures: DEFAULT_SHIPPER_CONFIG.maxConsecutiveFailures,
  circuitResetMs: DEFAULT_SHIPPER_CONFIG.circuitResetMs,
  maxRetries: DEFAULT_SHIPPER_CONFIG.maxRetries,
  retryBaseDelayMs: DEFAULT_SHIPPER_CONFIG.retryBaseDelayMs,
  retryMaxDelayMs: DEFAULT_SHIPPER_CONFIG.retryMaxDelayMs,
  debugMode: false,
};

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Maps event types to their expected event groups.
 */
export function getEventGroup(eventType: string): EventGroup {
  const prefix = eventType.split('.')[0];

  switch (prefix) {
    case 'background':
    case 'popup':
    case 'content':
    case 'settings':
      return EventGroup.SYSTEM;
    case 'playback':
    case 'paragraph':
    case 'selection':
      return EventGroup.USER;
    case 'tts':
    case 'audio':
    case 'cache':
    case 'highlight':
      return EventGroup.PLAYBACK;
    case 'pdf':
      return EventGroup.PDF;
    case 'api':
      return EventGroup.NETWORK;
    case 'shipper':
      return EventGroup.SHIPPER;
    case 'error':
      return EventGroup.ERROR;
    default:
      return EventGroup.SYSTEM;
  }
}

/**
 * Maps event types to default log levels.
 */
export function getDefaultLogLevel(eventType: string): LogLevel {
  if (eventType.startsWith('error.')) {
    return LogLevel.ERROR;
  }
  if (eventType.includes('_failed') || eventType.includes('_error')) {
    return LogLevel.ERROR;
  }
  if (eventType.includes('_started') || eventType.includes('_requested')) {
    return LogLevel.DEBUG;
  }
  return LogLevel.INFO;
}
