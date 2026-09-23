import { Err, Ok } from '@proso/shared';
import type { Result } from '@proso/shared';
import type {
  QueueEnvelope,
  QueueError,
  QueueFence,
  QueueTransition,
} from '../../core/listening-queue/queue-envelope';
import {
  createQueueEnvelope,
  immutableQueueValue,
  matchesQueueFence,
  safeCounter,
  validateQueueStructure,
  writableQueue,
} from '../../core/listening-queue/queue-state';
import { validateDocumentIdentity } from '../../core/reading-source/document-identity';
import type { SourceDigest } from '../../core/reading-source/document-identity';
import type { IListeningQueueStore } from '../../ports/listening-queue-store.port';

/** Synthetic/test-only store. NEVER a runtime persistence failure fallback.
 * T011 supplies IndexedDB durability; T033 supplies full evidence/audio boundary validation.
 */
export class InMemoryListeningQueueStoreAdapter implements IListeningQueueStore {
  private queue: QueueEnvelope;
  private tail: Promise<void> = Promise.resolve();
  private fault: QueueError | undefined;

  constructor(
    private readonly digest: SourceDigest,
    initial = createQueueEnvelope(),
  ) {
    // Preserve invalid/future seed data; load must fail instead of overwriting with defaults.
    this.queue = immutableQueueValue(initial);
  }

  /** Inject failure after the next valid transition, before the all-or-nothing publication. */
  failNext(error: QueueError): void {
    this.fault = immutableQueueValue(error);
  }

  private async validate(queue: QueueEnvelope): Promise<Result<void, QueueError>> {
    const valid = validateQueueStructure(queue);
    if (!valid.ok) return valid;
    for (const item of queue.items) {
      if (!(await validateDocumentIdentity(item.snapshot, this.digest)).ok) {
        return Err({ type: 'INVALID_STATE' });
      }
    }
    return Ok(undefined);
  }

  async load(): Promise<Result<QueueEnvelope, QueueError>> {
    await this.tail;
    try {
      const snapshot = this.queue;
      const valid = await this.validate(snapshot);
      return valid.ok ? Ok(snapshot) : valid;
    } catch {
      return Err({ type: 'PERSISTENCE_FAILED' });
    }
  }

  async transact(
    expected: QueueFence,
    transition: QueueTransition,
  ): Promise<Result<QueueEnvelope, QueueError>> {
    const fence = immutableQueueValue(expected);
    const operation = this.tail.then(async (): Promise<Result<QueueEnvelope, QueueError>> => {
      try {
        const current = this.queue;
        const valid = await this.validate(current);
        if (!valid.ok) return valid;
        const writable = writableQueue(current);
        if (!writable.ok) return writable;
        if (!matchesQueueFence(current, fence)) return Err({ type: 'STALE_WRITE' });
        if (!safeCounter(current.commitSequence + 1)) return Err({ type: 'LIMIT' });
        const result = transition(current);
        // A JS/unsafe caller must not smuggle an async callback past the commit boundary.
        if (!result || typeof result.ok !== 'boolean') return Err({ type: 'INVALID_STATE' });
        if (!result.ok) return result;
        // Detach callback-owned bytes before awaiting validation.
        const candidate = immutableQueueValue(result.value);
        if (
          candidate.commitSequence !== current.commitSequence ||
          candidate.generation < current.generation ||
          ((candidate.sessionId !== current.sessionId ||
            JSON.stringify(candidate.activeOwner) !== JSON.stringify(current.activeOwner)) &&
            candidate.generation <= current.generation) ||
          current.connectionEpochs.some(
            (entry) =>
              !candidate.connectionEpochs.some(
                (next) => next.connectionId === entry.connectionId && next.epoch >= entry.epoch,
              ),
          )
        )
          return Err({ type: 'INVALID_STATE' });
        const candidateValid = await this.validate(candidate);
        if (!candidateValid.ok) return candidateValid;
        if (this.fault) {
          const error = this.fault;
          this.fault = undefined;
          return Err(error);
        }
        const next = immutableQueueValue({
          ...candidate,
          commitSequence: current.commitSequence + 1,
        });
        const finalValid = validateQueueStructure(next);
        if (!finalValid.ok) return finalValid;
        this.queue = next;
        return Ok(next);
      } catch {
        // Never echo a callback/digest exception (it could contain source text or a token).
        return Err({ type: 'PERSISTENCE_FAILED' });
      }
    });
    this.tail = operation.then(() => undefined);
    return operation;
  }
}
