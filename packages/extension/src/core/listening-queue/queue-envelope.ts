import type { Checkpoint, ReadableDocument, Result, SourceRef } from '@proso/shared';

/** Extension-only queue-envelope v1; never extend the four shared source contracts. */
export interface QueueSettings {
  readonly ordering: 'oldest-first' | 'newest-first' | 'manual';
  readonly continuousPlayback: boolean;
  readonly markReadOnCompletion: boolean;
  /** Outstanding expanded speculative UTF-16 units, not a session cost cap. */
  readonly prefetchBudget: number;
}

export interface SourceRange {
  readonly blockId: string;
  readonly start: number;
  readonly end: number;
}

export interface EvidenceBinding {
  readonly source: SourceRef;
  readonly documentRevision: string;
  readonly spokenPlanKey: string;
  readonly sessionId: string;
  readonly generation: number;
}

export interface QueueAudioBinding extends EvidenceBinding {
  readonly range: SourceRange;
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly synthesisOptions: Readonly<Record<string, string | number | boolean>>;
  readonly unitKey: string;
  readonly audioDigest: string;
  readonly segmentId: string;
  readonly durationMs: number;
}

export interface NaturalEndProof extends EvidenceBinding {
  readonly unitKey: string;
  readonly segmentId: string;
  readonly audioDigest: string;
  readonly range: SourceRange;
}

export interface ProducerManifest extends EvidenceBinding {
  readonly segments: readonly {
    readonly unitKey: string;
    readonly segmentId: string;
    readonly range: SourceRange;
    readonly audioDigest: string;
    readonly durationMs: number;
  }[];
  readonly naturalEnds: readonly NaturalEndProof[];
  readonly termination: 'pending' | 'succeeded' | 'failed';
}

export interface QueueAckIntent {
  readonly intentId: string;
  readonly source: Pick<SourceRef, 'provider' | 'connectionId' | 'itemId'>;
  readonly connectionEpoch: number;
  readonly completedRevision: string;
  readonly completionId: string;
  readonly state:
    | 'pending'
    | 'sending'
    | 'retry-wait'
    | 'sent'
    | 'held'
    | 'exhausted'
    | 'cancelled';
  readonly attemptCount: number;
  readonly retryCycle: number;
  readonly nextAttemptAt: number | null;
  /** Redacted taxonomy code, never the transport's error/body. */
  readonly lastError: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly lastTransmittedAttemptId: string | null;
}

export interface QueueItem {
  readonly source: SourceRef;
  readonly snapshot: ReadableDocument;
  readonly normalizationVersion: string;
  readonly publishedAt: number | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly checkpoint: Checkpoint | null;
  readonly audioBinding: QueueAudioBinding | null;
  readonly expansionVersion: string | null;
  readonly spokenPlanKey: string | null;
  readonly sessionId: string | null;
  readonly generation: number;
  readonly requiredRanges: readonly SourceRange[];
  readonly heardRanges: readonly SourceRange[];
  readonly producerManifest: ProducerManifest | null;
  readonly listeningState: 'queued' | 'paused' | 'playing' | 'changed' | 'failed' | 'listened';
  readonly completedRevision: string | null;
  readonly completionId: string | null;
  readonly advanceConsumed: boolean;
  readonly ackIntent: QueueAckIntent | null;
}

export type QueueOwner =
  | { readonly kind: 'page'; readonly tabId: number }
  | { readonly kind: 'queue'; readonly key: string };

export interface ConnectionEpoch {
  readonly connectionId: string;
  readonly epoch: number;
}

export interface QueueDeletionTombstone {
  readonly id: string;
  readonly scope:
    | { readonly kind: 'queue' }
    | { readonly kind: 'connection'; readonly connectionId: string }
    | { readonly kind: 'item'; readonly key: string };
  readonly createdAt: number;
}

export interface QueueEnvelope {
  readonly schemaVersion: number;
  readonly minReaderVersion: number;
  readonly commitSequence: number;
  readonly settings: QueueSettings;
  readonly items: readonly QueueItem[];
  /** Ordered sourceIdentity keys. URLs are metadata, never membership keys. */
  readonly order: readonly string[];
  readonly activeOwner: QueueOwner | null;
  /** Supplied by a coordinator's secure random 128-bit generator, not a clock/counter. */
  readonly sessionId: string | null;
  readonly generation: number;
  readonly connectionEpochs: readonly ConnectionEpoch[];
  readonly deletionTombstones: readonly QueueDeletionTombstone[];
  readonly migration: {
    readonly fromVersion: number;
    readonly toVersion: number;
    readonly startedAt: number;
  } | null;
}

export interface QueueFence {
  readonly commitSequence: number;
  readonly sessionId: string | null;
  readonly generation: number;
  readonly connectionEpochs: readonly ConnectionEpoch[];
}

export type QueueError = {
  readonly type:
    | 'INVALID_STATE'
    | 'INCOMPATIBLE_VERSION'
    | 'STALE_WRITE'
    | 'LIMIT'
    | 'PERSISTENCE_FAILED'
    | 'BLOCKED';
};

/** Synchronous pure transition; no network, audio, or independent checkpoint writes. */
export type QueueTransition = (queue: QueueEnvelope) => Result<QueueEnvelope, QueueError>;
