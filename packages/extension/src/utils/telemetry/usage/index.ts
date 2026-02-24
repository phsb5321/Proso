/**
 * Usage Telemetry Module
 *
 * Exports for the usage tracking system that ships events to Loki.
 *
 * Usage:
 * ```typescript
 * import { usageTracker } from './utils/telemetry/usage';
 *
 * await usageTracker.initialize({
 *   gatewayUrl: 'https://telemetry.proso.com/ingest',
 *   gatewayToken: process.env.TELEMETRY_TOKEN,
 * });
 *
 * usageTracker.track('playback.start_requested', { paragraphs: 10 });
 * ```
 *
 * @module utils/telemetry/usage
 */

// Main tracker
export { UsageTracker, usageTracker } from './tracker';

// Context provider
export { ContextProvider, type UsageContext } from './context';

// Buffer
export { UsageBuffer } from './buffer';

// Shipper
export { UsageShipper } from './shipper';

// Error capture
export {
  installErrorCapture,
  generateErrorFingerprint,
  withErrorCapture,
  trackError,
  type ErrorCaptureOptions,
} from './error-capture';

// Console capture
export {
  installConsoleCapture,
  createInternalLogger,
  type ConsoleCaptureOptions,
} from './console-capture';

// Redaction
export {
  redactSensitiveData,
  redactError,
  redactStackTrace,
  hashUrl,
  hashUrlSync,
  sanitizeEventData,
} from './redaction';

// Types
export type {
  UsageEvent,
  EventGroup,
  LogLevel,
  Entrypoint,
  Provider,
  Environment,
  UsageEventType,
  BufferStats,
  BufferConfig,
  StoredEvent,
  ShipperState,
  ShipperConfig,
  UsageTrackerConfig,
  UsageTrackerInitConfig,
  TrackerStats,
  TrackOptions,
  LokiLabels,
  LokiPushRequest,
  LokiStream,
  LokiEntry,
  IngestRequest,
  ValidationErrorResponse,
  RateLimitResponse,
  GatewayErrorResponse,
} from './types';

// Constants and utilities
export {
  EventGroup as EventGroupEnum,
  LogLevel as LogLevelEnum,
  Entrypoint as EntrypointEnum,
  Provider as ProviderEnum,
  Environment as EnvironmentEnum,
  UsageEventTypes,
  UsageEventSchema,
  EventGroupSchema,
  LogLevelSchema,
  EntrypointSchema,
  ProviderSchema,
  EnvironmentSchema,
  DEFAULT_BUFFER_CONFIG,
  DEFAULT_SHIPPER_CONFIG,
  DEFAULT_TRACKER_CONFIG,
  getEventGroup,
  getDefaultLogLevel,
} from './types';
