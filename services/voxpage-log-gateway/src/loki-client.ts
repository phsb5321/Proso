/**
 * Loki Push Client
 *
 * Transforms UsageEvents into Loki push format and sends them to the Loki API.
 *
 * Loki Push Format:
 * {
 *   "streams": [
 *     {
 *       "stream": { "label1": "value1", ... },
 *       "values": [
 *         ["<nanosecond timestamp>", "<log line>"],
 *         ...
 *       ]
 *     }
 *   ]
 * }
 */

import type { UsageEvent } from './schemas.js';

// ============================================================================
// Types
// ============================================================================

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPushPayload {
  streams: LokiStream[];
}

interface LokiClientConfig {
  lokiUrl: string;
  lokiUser?: string;
  lokiPassword?: string;
  timeoutMs?: number;
  /** Deployment environment (dev/staging/prod) - used as Loki label */
  environment?: 'dev' | 'staging' | 'prod';
}

export interface LokiPushResult {
  success: boolean;
  eventsAccepted: number;
  error?: string;
}

// ============================================================================
// Loki Client
// ============================================================================

export class LokiClient {
  private readonly config: Required<
    Omit<LokiClientConfig, 'lokiUser' | 'lokiPassword' | 'environment'>
  > &
    Pick<LokiClientConfig, 'lokiUser' | 'lokiPassword' | 'environment'>;

  constructor(config: LokiClientConfig) {
    this.config = {
      timeoutMs: 10000,
      ...config,
    };
  }

  /**
   * Push events to Loki.
   * Events are grouped by label set for efficient batching.
   */
  async push(events: UsageEvent[]): Promise<LokiPushResult> {
    if (events.length === 0) {
      return { success: true, eventsAccepted: 0 };
    }

    const payload = this.transformToLokiPayload(events);

    try {
      const response = await fetch(`${this.config.lokiUrl}/loki/api/v1/push`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (response.status === 204 || response.status === 200) {
        return { success: true, eventsAccepted: events.length };
      }

      // Handle Loki errors
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        eventsAccepted: 0,
        error: `Loki returned ${response.status}: ${errorText}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        eventsAccepted: 0,
        error: `Loki push failed: ${message}`,
      };
    }
  }

  /**
   * Check if Loki is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.lokiUrl}/ready`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Transform events into Loki push format.
   * Groups events by their label set for efficient batching.
   */
  private transformToLokiPayload(events: UsageEvent[]): LokiPushPayload {
    // Group events by label set
    const streamMap = new Map<string, LokiStream>();

    for (const event of events) {
      const labels = this.extractLabels(event);
      const labelKey = this.labelSetKey(labels);

      let stream = streamMap.get(labelKey);
      if (!stream) {
        stream = { stream: labels, values: [] };
        streamMap.set(labelKey, stream);
      }

      // Convert ISO timestamp to nanoseconds
      const nanoTs = this.isoToNanos(event.ts);

      // Create log line as JSON (excluding label fields)
      const logLine = this.createLogLine(event);

      stream.values.push([nanoTs, logLine]);
    }

    return { streams: Array.from(streamMap.values()) };
  }

  /**
   * Extract low-cardinality labels from event.
   * These become Loki stream labels for efficient querying.
   */
  private extractLabels(event: UsageEvent): Record<string, string> {
    const labels: Record<string, string> = {
      app: 'voxpage',
      entrypoint: event.entrypoint,
      event_group: event.eventGroup,
      level: event.level,
    };

    // Add environment if configured
    if (this.config.environment) {
      labels.env = this.config.environment;
    }

    // Add provider if present (also low cardinality)
    if (event.provider) {
      labels.provider = event.provider;
    }

    return labels;
  }

  /**
   * Create a deterministic key for a label set.
   */
  private labelSetKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  /**
   * Create the log line JSON, excluding fields already in labels.
   */
  private createLogLine(event: UsageEvent): string {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { eventGroup, level, entrypoint, provider, ...rest } = event;

    return JSON.stringify(rest);
  }

  /**
   * Convert ISO 8601 timestamp to nanoseconds string.
   */
  private isoToNanos(isoTs: string): string {
    const ms = new Date(isoTs).getTime();
    // Convert ms to nanoseconds (multiply by 1,000,000)
    return `${ms}000000`;
  }

  /**
   * Build headers for Loki requests.
   */
  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add basic auth if credentials provided
    if (this.config.lokiUser && this.config.lokiPassword) {
      const credentials = Buffer.from(
        `${this.config.lokiUser}:${this.config.lokiPassword}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }
}
