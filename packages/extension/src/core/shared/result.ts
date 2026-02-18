/**
 * Result Type Utilities for Hexagonal Architecture
 *
 * Provides explicit error handling without exceptions.
 * All fallible operations in the domain layer return Result<T, E>.
 *
 * @module core/shared/result
 */

/**
 * Result type for explicit error handling.
 * Either contains a success value or an error.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful Result containing a value.
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Create a failed Result containing an error.
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Type guard to check if a Result is successful.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Type guard to check if a Result is an error.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Unwrap a successful Result or throw an error.
 * Use sparingly - prefer pattern matching with isOk/isErr.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Attempted to unwrap an error result: ${JSON.stringify(result.error)}`);
}

/**
 * Unwrap a successful Result or return a default value.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Map a function over a successful Result.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? Ok(fn(result.value)) : result;
}

/**
 * Map a function over an error Result.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? Err(fn(result.error)) : result;
}

/**
 * Chain Results together (flatMap/bind).
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}
