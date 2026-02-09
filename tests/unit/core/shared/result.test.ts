/**
 * Unit tests for Result type utilities
 * @module tests/unit/core/shared/result
 */

import { describe, it, expect } from '@jest/globals';
import { Ok, Err, isOk, isErr, unwrap, unwrapOr, map, mapErr, andThen } from '../../../../src/core/shared/result';
import type { Result } from '../../../../src/core/shared/result';

describe('Result type utilities', () => {
  describe('Ok', () => {
    it('creates a successful result', () => {
      const result = Ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('creates Ok with string value', () => {
      const result = Ok('hello');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('hello');
    });

    it('creates Ok with null value', () => {
      const result = Ok(null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('creates Ok with undefined value', () => {
      const result = Ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeUndefined();
    });

    it('creates Ok with object value', () => {
      const obj = { name: 'test', count: 5 };
      const result = Ok(obj);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(obj);
    });

    it('creates Ok with array value', () => {
      const arr = [1, 2, 3];
      const result = Ok(arr);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(arr);
    });
  });

  describe('Err', () => {
    it('creates a failed result', () => {
      const result = Err('error message');
      expect(result).toEqual({ ok: false, error: 'error message' });
    });

    it('creates Err with error object', () => {
      const error = { type: 'NOT_FOUND', message: 'not found' };
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    });

    it('creates Err with Error instance', () => {
      const error = new Error('something broke');
      const result = Err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    });
  });

  describe('isOk', () => {
    it('returns true for Ok result', () => {
      expect(isOk(Ok(42))).toBe(true);
    });

    it('returns false for Err result', () => {
      expect(isOk(Err('error'))).toBe(false);
    });

    it('narrows type for Ok', () => {
      const result: Result<number, string> = Ok(42);
      if (isOk(result)) {
        // TypeScript should know result.value is number
        expect(result.value).toBe(42);
      }
    });
  });

  describe('isErr', () => {
    it('returns true for Err result', () => {
      expect(isErr(Err('error'))).toBe(true);
    });

    it('returns false for Ok result', () => {
      expect(isErr(Ok(42))).toBe(false);
    });

    it('narrows type for Err', () => {
      const result: Result<number, string> = Err('oops');
      if (isErr(result)) {
        expect(result.error).toBe('oops');
      }
    });
  });

  describe('unwrap', () => {
    it('returns value for Ok result', () => {
      expect(unwrap(Ok(42))).toBe(42);
    });

    it('returns complex value for Ok result', () => {
      const data = { items: [1, 2, 3] };
      expect(unwrap(Ok(data))).toBe(data);
    });

    it('throws for Err result', () => {
      expect(() => unwrap(Err('error'))).toThrow('Attempted to unwrap an error result');
    });

    it('includes error details in thrown message', () => {
      const error = { type: 'VALIDATION', message: 'invalid input' };
      expect(() => unwrap(Err(error))).toThrow(JSON.stringify(error));
    });
  });

  describe('unwrapOr', () => {
    it('returns value for Ok result', () => {
      expect(unwrapOr(Ok(42), 0)).toBe(42);
    });

    it('returns default for Err result', () => {
      expect(unwrapOr(Err('error'), 0)).toBe(0);
    });

    it('returns default string for Err result', () => {
      expect(unwrapOr(Err('error'), 'fallback')).toBe('fallback');
    });

    it('returns Ok value even when default is provided', () => {
      expect(unwrapOr(Ok('actual'), 'default')).toBe('actual');
    });
  });

  describe('map', () => {
    it('transforms Ok value', () => {
      const result = map(Ok(5), (n) => n * 2);
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it('passes through Err', () => {
      const result = map(Err('error') as Result<number, string>, (n) => n * 2);
      expect(result).toEqual({ ok: false, error: 'error' });
    });

    it('transforms value type', () => {
      const result = map(Ok(42), (n) => String(n));
      expect(result).toEqual({ ok: true, value: '42' });
    });

    it('chains multiple maps', () => {
      const result = map(map(Ok(2), (n) => n + 3), (n) => n * 10);
      expect(result).toEqual({ ok: true, value: 50 });
    });
  });

  describe('mapErr', () => {
    it('transforms Err error', () => {
      const result = mapErr(Err('raw error'), (e) => ({ message: e }));
      expect(result).toEqual({ ok: false, error: { message: 'raw error' } });
    });

    it('passes through Ok', () => {
      const result = mapErr(Ok(42) as Result<number, string>, (e) => ({ message: e }));
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('transforms error type', () => {
      const result = mapErr(Err(404), (code) => `HTTP ${code}`);
      expect(result).toEqual({ ok: false, error: 'HTTP 404' });
    });
  });

  describe('andThen', () => {
    it('chains successful operations', () => {
      const double = (n: number): Result<number, string> => Ok(n * 2);
      const result = andThen(Ok(5), double);
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it('short-circuits on Err', () => {
      const double = (n: number): Result<number, string> => Ok(n * 2);
      const result = andThen(Err('error') as Result<number, string>, double);
      expect(result).toEqual({ ok: false, error: 'error' });
    });

    it('propagates Err from chained function', () => {
      const safeDivide = (n: number): Result<number, string> =>
        n === 0 ? Err('division by zero') : Ok(100 / n);
      const result = andThen(Ok(0), safeDivide);
      expect(result).toEqual({ ok: false, error: 'division by zero' });
    });

    it('chains multiple andThen operations', () => {
      const addOne = (n: number): Result<number, string> => Ok(n + 1);
      const double = (n: number): Result<number, string> => Ok(n * 2);
      const result = andThen(andThen(Ok(3), addOne), double);
      expect(result).toEqual({ ok: true, value: 8 });
    });

    it('stops chain at first Err', () => {
      const fail = (_n: number): Result<number, string> => Err('fail');
      const double = (n: number): Result<number, string> => Ok(n * 2);
      const result = andThen(andThen(Ok(5), fail), double);
      expect(result).toEqual({ ok: false, error: 'fail' });
    });
  });
});
