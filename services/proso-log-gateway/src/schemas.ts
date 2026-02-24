/**
 * Zod Schemas for Gateway Validation
 *
 * These schemas match the client-side types in src/utils/telemetry/usage/types.ts
 * and are used to validate incoming events before pushing to Loki.
 */

import { z } from 'zod';

// ============================================================================
// Enum Schemas (Low Cardinality - used as Loki labels)
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

// ============================================================================
// Event Schema
// ============================================================================

export const UsageEventSchema = z.object({
  /** ISO 8601 timestamp with millisecond precision */
  ts: z.string().datetime(),

  /** Event name following dot-notation convention */
  event: z.string().min(1).max(100),

  /** Event category for filtering and routing */
  eventGroup: EventGroupSchema,

  /** Log severity level */
  level: LogLevelSchema,

  /** Human-readable message describing the event */
  msg: z.string().max(1000),

  /** Extension context where event originated */
  entrypoint: EntrypointSchema,

  /** Extension version from manifest */
  extVersion: z.string().regex(/^\d+\.\d+\.\d+/),

  /** Stable UUID generated on first installation */
  installId: z.string().uuid(),

  /** UUID generated per browser session */
  sessionId: z.string().uuid(),

  /** UUID for correlating events in a single user action/flow */
  actionId: z.string().uuid().optional(),

  /** Current TTS provider */
  provider: ProviderSchema.optional(),

  /** Migration feature flags snapshot */
  flags: z.record(z.boolean()).optional(),

  /** SHA-256 hash of current page URL (privacy-preserving) */
  urlHash: z.string().length(64).optional(),

  /** For PDF pages, the URL scheme */
  pdfScheme: z.enum(['http', 'https', 'file']).optional(),

  /** Event-specific structured data */
  data: z.record(z.unknown()).optional(),
});

export type UsageEvent = z.infer<typeof UsageEventSchema>;

// ============================================================================
// Request/Response Schemas
// ============================================================================

export const IngestRequestSchema = z.object({
  events: z.array(UsageEventSchema).min(1).max(1000),
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export interface IngestResponse {
  accepted: number;
}

export interface ValidationErrorResponse {
  error: 'validation_error';
  details: Array<{
    path: string;
    message: string;
  }>;
}

export interface RateLimitResponse {
  error: 'rate_limited';
  retryAfter: number;
}

export interface GatewayErrorResponse {
  error: 'loki_unavailable';
  message: string;
}

export type ErrorResponse = ValidationErrorResponse | RateLimitResponse | GatewayErrorResponse;
