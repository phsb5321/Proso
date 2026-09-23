import { Err, Ok, ReadableDocumentSchema, checkpointForDocumentSchema } from '@proso/shared';
import type { ReadableDocument, Result } from '@proso/shared';
import { validateDocumentIdentity } from '../reading-source/document-identity';
import type { SourceDigest } from '../reading-source/document-identity';
import { NORMALIZATION_VERSION } from '../reading-source/document-normalizer';
import { sourceIdentity } from '../reading-source/source-binding';
import type {
  QueueEnvelope,
  QueueError,
  QueueFence,
  QueueItem,
  QueueSettings,
} from './queue-envelope';

export const QUEUE_VERSION = 1;
export const QUEUE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_QUEUE_SETTINGS: QueueSettings = Object.freeze({
  ordering: 'oldest-first',
  continuousPlayback: false,
  markReadOnCompletion: false,
  prefetchBudget: 10_000,
});

/** Copy first: freezing must not mutate a caller's object or retain mutable aliases. */
export function immutableQueueValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value)
    ? value.map((entry) => immutableQueueValue(entry))
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, immutableQueueValue(entry)]),
      );
  return Object.freeze(copy) as T;
}

export function safeCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validSession(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

export function validQueueSettings(settings: QueueSettings): boolean {
  return (
    ['oldest-first', 'newest-first', 'manual'].includes(settings.ordering) &&
    typeof settings.continuousPlayback === 'boolean' &&
    typeof settings.markReadOnCompletion === 'boolean' &&
    safeCounter(settings.prefetchBudget) &&
    settings.prefetchBudget <= 50_000 &&
    Object.keys(settings).length === 4
  );
}

export function createQueueEnvelope(): QueueEnvelope {
  return immutableQueueValue({
    schemaVersion: QUEUE_VERSION,
    minReaderVersion: QUEUE_VERSION,
    commitSequence: 0,
    settings: DEFAULT_QUEUE_SETTINGS,
    items: [],
    order: [],
    activeOwner: null,
    sessionId: null,
    generation: 0,
    connectionEpochs: [],
    deletionTombstones: [],
    migration: null,
  });
}

export function queueFence(queue: QueueEnvelope): QueueFence {
  return immutableQueueValue({
    commitSequence: queue.commitSequence,
    sessionId: queue.sessionId,
    generation: queue.generation,
    connectionEpochs: queue.connectionEpochs,
  });
}

export function matchesQueueFence(queue: QueueEnvelope, expected: QueueFence): boolean {
  return (
    queue.commitSequence === expected.commitSequence &&
    queue.sessionId === expected.sessionId &&
    queue.generation === expected.generation &&
    queue.connectionEpochs.length === expected.connectionEpochs.length &&
    new Set(expected.connectionEpochs.map((entry) => entry.connectionId)).size ===
      expected.connectionEpochs.length &&
    queue.connectionEpochs.every((entry) =>
      expected.connectionEpochs.some(
        (other) => other.connectionId === entry.connectionId && other.epoch === entry.epoch,
      ),
    )
  );
}

export async function createQueueItem(
  snapshot: ReadableDocument,
  publishedAt: number | null,
  now: number,
  digest: SourceDigest,
): Promise<Result<QueueItem, QueueError>> {
  // Own the bytes before awaiting the digest boundary.
  const owned = immutableQueueValue(snapshot);
  if (
    !safeCounter(now) ||
    !safeCounter(now + QUEUE_RETENTION_MS) ||
    (publishedAt !== null && !safeCounter(publishedAt)) ||
    !(await validateDocumentIdentity(owned, digest)).ok
  ) {
    return Err({ type: 'INVALID_STATE' });
  }
  return Ok(
    immutableQueueValue({
      source: owned.source,
      snapshot: owned,
      normalizationVersion: NORMALIZATION_VERSION,
      publishedAt,
      createdAt: now,
      expiresAt: now + QUEUE_RETENTION_MS,
      checkpoint: null,
      audioBinding: null,
      expansionVersion: null,
      spokenPlanKey: null,
      sessionId: null,
      generation: 0,
      requiredRanges: [],
      heardRanges: [],
      producerManifest: null,
      listeningState: 'queued',
      completedRevision: null,
      completionId: null,
      advanceConsumed: false,
      ackIntent: null,
    }),
  );
}

function validItemStructure(item: QueueItem): boolean {
  return (
    ReadableDocumentSchema.safeParse(item.snapshot).success &&
    sourceIdentity(item.source) === sourceIdentity(item.snapshot.source) &&
    item.source.canonicalUrl === item.snapshot.source.canonicalUrl &&
    item.normalizationVersion === NORMALIZATION_VERSION &&
    (item.publishedAt === null || safeCounter(item.publishedAt)) &&
    safeCounter(item.createdAt) &&
    safeCounter(item.expiresAt) &&
    item.expiresAt > item.createdAt &&
    safeCounter(item.generation) &&
    (item.sessionId === null || validSession(item.sessionId)) &&
    ['queued', 'paused', 'playing', 'changed', 'failed', 'listened'].includes(
      item.listeningState,
    ) &&
    (item.checkpoint === null ||
      checkpointForDocumentSchema(item.snapshot).safeParse(item.checkpoint).success) &&
    (item.checkpoint?.audioOffsetMs === undefined ||
      item.checkpoint.audioOffsetMs === 0 ||
      item.audioBinding !== null) &&
    item.requiredRanges.length <= 100_000 &&
    item.heardRanges.length <= 100_000 &&
    (item.producerManifest === null || item.producerManifest.segments.length <= 100_000)
  );
}

/** T010 structural invariants, NOT T033's complete evidence/audio/migration boundary schema.
 * This module never certifies completion. Digest validation is awaited by the store adapter.
 */
export function validateQueueStructure(queue: QueueEnvelope): Result<void, QueueError> {
  if (queue.schemaVersion !== QUEUE_VERSION || queue.minReaderVersion !== QUEUE_VERSION) {
    return Err({ type: 'INCOMPATIBLE_VERSION' });
  }
  if (
    !safeCounter(queue.commitSequence) ||
    !safeCounter(queue.generation) ||
    (queue.sessionId !== null && !validSession(queue.sessionId)) ||
    !validQueueSettings(queue.settings) ||
    queue.items.some((item) => !validItemStructure(item))
  ) {
    return Err({ type: 'INVALID_STATE' });
  }
  const keys = queue.items.map((item) => sourceIdentity(item.source));
  if (
    new Set(keys).size !== keys.length ||
    new Set(queue.order).size !== keys.length ||
    queue.order.length !== keys.length ||
    queue.order.some((key) => !keys.includes(key)) ||
    new Set(queue.connectionEpochs.map((entry) => entry.connectionId)).size !==
      queue.connectionEpochs.length ||
    queue.connectionEpochs.some((entry) => !entry.connectionId || !safeCounter(entry.epoch)) ||
    queue.items.some(
      (item) =>
        !queue.connectionEpochs.some((entry) => entry.connectionId === item.source.connectionId),
    )
  ) {
    return Err({ type: 'INVALID_STATE' });
  }
  const owner = queue.activeOwner;
  const playing = queue.items.filter((item) => item.listeningState === 'playing');
  if (
    (owner !== null && (!['page', 'queue'].includes(owner.kind) || queue.sessionId === null)) ||
    (owner?.kind === 'queue' && !keys.includes(owner.key)) ||
    (owner?.kind === 'page' && !safeCounter(owner.tabId)) ||
    playing.length > 1 ||
    playing.some(
      (item) =>
        owner?.kind !== 'queue' ||
        owner.key !== sourceIdentity(item.source) ||
        item.sessionId !== queue.sessionId ||
        item.generation !== queue.generation,
    )
  ) {
    return Err({ type: 'INVALID_STATE' });
  }
  if (
    queue.items.length > 100 ||
    new TextEncoder().encode(JSON.stringify(queue)).byteLength > 5 * 1024 * 1024
  ) {
    return Err({ type: 'LIMIT' });
  }
  return Ok(undefined);
}

/** Conservative hold until T012/T036 implement per-record purge/migration recovery. */
export function writableQueue(queue: QueueEnvelope): Result<void, QueueError> {
  const valid = validateQueueStructure(queue);
  if (!valid.ok) return valid;
  return queue.migration !== null || queue.deletionTombstones.length > 0
    ? Err({ type: 'BLOCKED' })
    : valid;
}

export function finishQueueTransition(queue: QueueEnvelope): Result<QueueEnvelope, QueueError> {
  const valid = validateQueueStructure(queue);
  return valid.ok ? Ok(immutableQueueValue(queue)) : valid;
}
