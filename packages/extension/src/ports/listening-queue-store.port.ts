import type { Result } from '@proso/shared';
import type {
  QueueEnvelope,
  QueueError,
  QueueFence,
  QueueTransition,
} from '../core/listening-queue/queue-envelope';

/** The whole envelope is the only commit boundary; there is no checkpoint-only write.
 * Production implementations must await strict-durable transaction completion before Ok.
 * A failed write preserves the previous envelope and cannot fall back to volatile storage.
 */
export interface IListeningQueueStore {
  /** Read-only snapshot, not a Play command. Coordinator recovery is a separate transaction. */
  load(): Promise<Result<QueueEnvelope, QueueError>>;
  /** Serialize, compare every fence field in-transaction, apply, validate, commit once.
   * Transitions keep commitSequence unchanged; the store alone increments it on success.
   * The callback is synchronous and side-effect-free; never perform HTTP/audio inside it.
   */
  transact(
    expected: QueueFence,
    transition: QueueTransition,
  ): Promise<Result<QueueEnvelope, QueueError>>;
}
