/**
 * Dispatch Telemetry Types
 *
 * Types for tracking hexagonal architecture dispatch statistics.
 * Used to verify migration progress (legacy vs hex handler usage).
 *
 * @module utils/telemetry/types
 */

/**
 * Statistics for a single message type.
 */
export interface MessageStats {
  /** Message type (e.g., 'playback.start', 'startPlayback') */
  type: string;
  /** Number of times dispatched to hexagonal handler */
  hexCount: number;
  /** Number of times dispatched to legacy handler */
  legacyCount: number;
  /** Timestamp of last dispatch */
  lastDispatch: number;
}

/**
 * Overall dispatch statistics.
 */
export interface DispatchStats {
  /** Total messages dispatched to hexagonal handlers */
  hexTotal: number;
  /** Total messages dispatched to legacy handlers */
  legacyTotal: number;
  /** Total unknown messages (not handled by hex or legacy) */
  unknownTotal: number;
  /** Percentage of messages going to hexagonal (0-100) */
  hexPercentage: number;
  /** Stats by message type */
  byType: Record<string, MessageStats>;
  /** Unknown message types received */
  unknownTypes: Record<string, { count: number; lastSeen: number }>;
  /** When stats collection started */
  startTime: number;
  /** When stats were last reset */
  lastReset: number;
}

/**
 * Dispatch event for logging.
 */
export interface DispatchEvent {
  /** Message type being dispatched */
  type: string;
  /** Which path handled the message */
  path: 'hex' | 'legacy' | 'unknown';
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the dispatch succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Timestamp of dispatch */
  timestamp: number;
}

/**
 * Dispatch summary for debugging.
 */
export interface DispatchSummary {
  /** Current stats snapshot */
  stats: DispatchStats;
  /** Registered hex handlers */
  hexHandlers: string[];
  /** Legacy handlers with no hex equivalent */
  legacyOnlyHandlers: string[];
  /** Messages that have both hex and legacy handlers */
  migratedHandlers: string[];
}
