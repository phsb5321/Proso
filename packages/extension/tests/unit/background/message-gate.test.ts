// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Message gate contract tests (PROSO-90).
 *
 * The gate is the seam that stops `background.ts`'s synchronous message
 * listener from mis-answering messages that arrive before hexagonal handler
 * registration settles. These tests pin its two properties:
 *   1. waitForMessageGate() blocks until the registered readiness promise
 *      settles (the queueing behaviour);
 *   2. a settled gate resolves on the next microtask (no serialization cost
 *      after warm-up).
 *
 * @module tests/unit/background/message-gate
 */

import { describe, it, expect } from '@jest/globals';
import { setMessageGate, waitForMessageGate } from '../../../src/background/message-gate';

describe('message gate (PROSO-90)', () => {
  it('blocks until the readiness promise settles, then resolves', async () => {
    let release!: () => void;
    const readiness = new Promise<void>((resolve) => {
      release = resolve;
    });
    setMessageGate(readiness);

    let unblocked = false;
    const waiter = waitForMessageGate().then(() => {
      unblocked = true;
    });

    // Give the microtask queue a chance to wrongly resolve the waiter.
    await Promise.resolve();
    await Promise.resolve();
    expect(unblocked).toBe(false);

    release();
    await waiter;
    expect(unblocked).toBe(true);
  });

  it('resolves immediately once the gate is settled (warm path)', async () => {
    setMessageGate(Promise.resolve());
    const started = Date.now();
    await waitForMessageGate();
    // A settled promise resolves on the microtask queue — far under any
    // message-roundtrip timeout, and effectively free after warm-up.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('resolves waiters when the readiness chain is .catch()-ed (caller shape)', async () => {
    // background.ts stores the .catch()-ed init chain, so the gate can never
    // reject — assert the resulting waiter resolves, not rejects.
    const readiness = Promise.reject(new Error('init failed'));
    setMessageGate(readiness.catch(() => undefined));

    await expect(waitForMessageGate()).resolves.toBeUndefined();
  });

  it('rejects waiters when a raw rejecting promise is stored (why the caller must .catch)', async () => {
    // The defensive boundary: if someone stores a raw rejecting promise, the
    // waiter surfaces the rejection instead of hanging silently.
    const readiness = Promise.reject(new Error('init failed'));
    readiness.catch(() => {}); // prevent the test env from flagging it
    setMessageGate(readiness);

    await expect(waitForMessageGate()).rejects.toThrow('init failed');
  });
});
