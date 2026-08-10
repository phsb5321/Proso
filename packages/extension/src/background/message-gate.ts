// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Message gate — closes the MV3 first-message dispatch race (PROSO-90).
 *
 * `background.ts` registers the `runtime.onMessage` listener synchronously,
 * but hexagonal handler registration happens inside the fire-and-forget
 * `initHexagonalArchitecture()` promise. A message arriving in that window
 * used to fall through to the legacy handlers and be mis-answered with
 * `Unknown message type`. The gate queues such messages: the listener awaits
 * `waitForMessageGate()` before dispatching, and the gate resolves when
 * handler registration has settled. After warm-up the gate is an already
 * resolved promise, so the await is a microtask — no serialization cost.
 *
 * The init chain is `.catch()`-ed by the caller, so the gate never rejects;
 * the getter resolves to `undefined` either way.
 *
 * @module background/message-gate
 */

let gate: Promise<unknown> = Promise.resolve();
let gateSet = false;

/**
 * Point the gate at the readiness promise (handler registration settled).
 * Single-shot: the background entrypoint sets it exactly once, and no later
 * caller can swap in a rejecting promise after the fact.
 */
export function setMessageGate(promise: Promise<unknown>): void {
  if (!gateSet) {
    gate = promise;
    gateSet = true;
  }
}

/** Test seam: clear the single-shot latch between cases. */
export function resetMessageGate(): void {
  gate = Promise.resolve();
  gateSet = false;
}

/**
 * Resolve once handler registration has settled (immediately when warm).
 */
export function waitForMessageGate(): Promise<void> {
  return gate.then(() => undefined);
}
