import { Err } from '@proso/shared';
import type { Result } from '@proso/shared';
import { sourceIdentity } from '../reading-source/source-binding';
import type {
  QueueEnvelope,
  QueueError,
  QueueItem,
  QueueOwner,
  QueueSettings,
} from './queue-envelope';
import {
  finishQueueTransition,
  safeCounter,
  validQueueSettings,
  validSession,
  writableQueue,
} from './queue-state';

function compareItems(a: QueueItem, b: QueueItem, newest = false): number {
  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return newest ? b.publishedAt - a.publishedAt : a.publishedAt - b.publishedAt;
  }
  const left = sourceIdentity(a.source);
  const right = sourceIdentity(b.source);
  // Code-unit comparison is deterministic across locales/hosts (unlike localeCompare).
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedOrder(items: readonly QueueItem[], settings: QueueSettings): readonly string[] {
  return [...items]
    .sort((a, b) => compareItems(a, b, settings.ordering === 'newest-first'))
    .map((item) => sourceIdentity(item.source));
}

function isFreshItem(item: QueueItem): boolean {
  return (
    item.listeningState === 'queued' &&
    item.checkpoint === null &&
    item.audioBinding === null &&
    item.sessionId === null &&
    item.generation === 0 &&
    item.expansionVersion === null &&
    item.spokenPlanKey === null &&
    item.requiredRanges.length === 0 &&
    item.heardRanges.length === 0 &&
    item.producerManifest === null &&
    item.completedRevision === null &&
    item.completionId === null &&
    !item.advanceConsumed &&
    item.ackIntent === null
  );
}

/** Membership import only. Existing snapshots/evidence/expiry are pinned, even if absent
 * from the next unread page. Revision adoption requires T018's explicit restart flow.
 */
export function refreshQueue(
  queue: QueueEnvelope,
  incoming: readonly QueueItem[],
): Result<QueueEnvelope, QueueError> {
  const valid = writableQueue(queue);
  if (!valid.ok) return valid;
  const existing = new Set(queue.order);
  const additions = new Map<string, QueueItem>();
  for (const item of incoming) {
    const key = sourceIdentity(item.source);
    if (existing.has(key)) continue;
    if (!isFreshItem(item)) return Err({ type: 'INVALID_STATE' });
    const duplicate = additions.get(key);
    if (duplicate) {
      if (
        duplicate.publishedAt !== item.publishedAt ||
        duplicate.snapshot.revision !== item.snapshot.revision
      ) {
        return Err({ type: 'INVALID_STATE' });
      }
    } else additions.set(key, item);
  }
  const added = [...additions.values()].sort((a, b) => compareItems(a, b));
  const items = [...queue.items, ...added];
  const epochs = new Map(queue.connectionEpochs.map((entry) => [entry.connectionId, entry.epoch]));
  for (const item of added) {
    if (!epochs.has(item.source.connectionId)) epochs.set(item.source.connectionId, 0);
  }
  return finishQueueTransition({
    ...queue,
    items,
    order:
      queue.settings.ordering === 'manual'
        ? [...queue.order, ...added.map((item) => sourceIdentity(item.source))]
        : sortedOrder(items, queue.settings),
    connectionEpochs: [...epochs].map(([connectionId, epoch]) => ({ connectionId, epoch })),
  });
}

export function setQueueSettings(
  queue: QueueEnvelope,
  patch: Partial<QueueSettings>,
): Result<QueueEnvelope, QueueError> {
  const valid = writableQueue(queue);
  if (!valid.ok) return valid;
  const settings = { ...queue.settings, ...patch };
  if (!validQueueSettings(settings)) return Err({ type: 'INVALID_STATE' });
  return finishQueueTransition({
    ...queue,
    settings,
    order: settings.ordering === 'manual' ? queue.order : sortedOrder(queue.items, settings),
    // Opt-in is never retroactive. A sent acknowledgement is a historical fact.
    items: settings.markReadOnCompletion
      ? queue.items
      : queue.items.map((item) => ({
          ...item,
          ackIntent:
            item.ackIntent !== null && item.ackIntent.state !== 'sent'
              ? { ...item.ackIntent, state: 'cancelled' as const }
              : item.ackIntent,
        })),
  });
}

export function reorderQueue(
  queue: QueueEnvelope,
  order: readonly string[],
): Result<QueueEnvelope, QueueError> {
  const valid = writableQueue(queue);
  if (!valid.ok) return valid;
  if (
    queue.settings.ordering !== 'manual' ||
    (queue.activeOwner?.kind === 'queue' &&
      queue.order.indexOf(queue.activeOwner.key) !== order.indexOf(queue.activeOwner.key)) ||
    queue.items.some(
      (item) =>
        item.listeningState === 'listened' &&
        queue.order.indexOf(sourceIdentity(item.source)) !==
          order.indexOf(sourceIdentity(item.source)),
    )
  )
    return Err({ type: 'INVALID_STATE' });
  return finishQueueTransition({ ...queue, order });
}

function pausePlaying(items: readonly QueueItem[]): readonly QueueItem[] {
  return items.map((item) =>
    item.listeningState === 'playing' ? { ...item, listeningState: 'paused' as const } : item,
  );
}

function ownerTransitionReady(queue: QueueEnvelope): Result<void, QueueError> {
  const valid = writableQueue(queue);
  if (!valid.ok) return valid;
  return safeCounter(queue.generation + 1) ? valid : Err({ type: 'LIMIT' });
}

/** No audio side effect. The coordinator must await store.transact before playback. */
export function replaceQueueOwner(
  queue: QueueEnvelope,
  owner: QueueOwner,
): Result<QueueEnvelope, QueueError> {
  const valid = ownerTransitionReady(queue);
  if (!valid.ok) return valid;
  if (queue.sessionId === null) return Err({ type: 'INVALID_STATE' });
  const generation = queue.generation + 1;
  const selected =
    owner.kind === 'queue'
      ? queue.items.find((item) => sourceIdentity(item.source) === owner.key)
      : null;
  if (
    owner.kind === 'queue' &&
    (!selected || ['changed', 'listened'].includes(selected.listeningState))
  ) {
    return Err({ type: 'INVALID_STATE' });
  }
  return finishQueueTransition({
    ...queue,
    activeOwner: owner,
    generation,
    items: pausePlaying(queue.items).map((item) =>
      owner.kind === 'queue' && sourceIdentity(item.source) === owner.key
        ? { ...item, listeningState: 'playing', sessionId: queue.sessionId, generation }
        : item,
    ),
  });
}

export function stopQueue(queue: QueueEnvelope): Result<QueueEnvelope, QueueError> {
  const valid = ownerTransitionReady(queue);
  if (!valid.ok) return valid;
  return finishQueueTransition({
    ...queue,
    activeOwner: null,
    generation: queue.generation + 1,
    items: pausePlaying(queue.items),
  });
}

/** Restores selection but never autoplay. Old sessions cannot submit media observations. */
export function recoverQueueSession(
  queue: QueueEnvelope,
  sessionId: string,
): Result<QueueEnvelope, QueueError> {
  const valid = ownerTransitionReady(queue);
  if (!valid.ok) return valid;
  if (!validSession(sessionId) || sessionId === queue.sessionId)
    return Err({ type: 'INVALID_STATE' });
  return finishQueueTransition({
    ...queue,
    sessionId,
    generation: queue.generation + 1,
    activeOwner: queue.activeOwner?.kind === 'queue' ? queue.activeOwner : null,
    items: pausePlaying(queue.items),
  });
}
