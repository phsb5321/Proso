/**
 * View-unload policy.
 *
 * A view going away must end playback when the reader chose that, and must only
 * detach the view when they chose background playback. Two identities keep the
 * decision honest: the unloader's document (a tab id cannot tell successive
 * documents apart) and the session owner revalidated after the preference read
 * (storage may answer late, after a newer session started).
 *
 * @module tests/unit/background/view-unload-policy
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  type SessionOwner,
  applyViewUnloadPolicy,
} from '../../../src/background/view-unload-policy';

interface FakeOptions {
  /** Owner reported by the second (post-await) read, when it differs. */
  readonly ownerAfter?: SessionOwner | null;
}

function createFakeService(owner: SessionOwner | null, options: FakeOptions = {}) {
  const stop = jest.fn(async () => undefined);
  const detachVisualAttachment = jest.fn();
  let reads = 0;
  const getSessionOwner = jest.fn((): SessionOwner | null => {
    reads += 1;
    if (reads > 1 && options.ownerAfter !== undefined) return options.ownerAfter;
    return owner;
  });
  return {
    stop,
    detachVisualAttachment,
    getSessionOwner,
    getState: () => ({ activeTabId: owner?.tabId ?? null }),
  };
}

const SESSION: SessionOwner = { tabId: 7, documentId: 'doc-a' };

interface Case {
  readonly name: string;
  readonly owner: SessionOwner | null;
  readonly unload: { tabId?: number; documentId?: string | null };
  readonly enabled: boolean;
  readonly ownerAfter?: SessionOwner | null;
  readonly expected: { detached: boolean; stopped: boolean };
  readonly detachCalls: number;
  readonly stopCalls: number;
}

const CASES: readonly Case[] = [
  {
    name: 'detaches the view and keeps audio when background playback is enabled',
    owner: SESSION,
    unload: { tabId: 7, documentId: 'doc-a' },
    enabled: true,
    expected: { detached: true, stopped: false },
    detachCalls: 1,
    stopCalls: 0,
  },
  {
    name: 'stops playback when background playback is disabled',
    owner: SESSION,
    unload: { tabId: 7, documentId: 'doc-a' },
    enabled: false,
    expected: { detached: false, stopped: true },
    detachCalls: 0,
    stopCalls: 1,
  },
  {
    name: 'ignores an unload reported by a tab that is not playing',
    owner: SESSION,
    unload: { tabId: 42, documentId: 'doc-b' },
    enabled: true,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'ignores a stale unload from a previous document in the same tab',
    owner: SESSION,
    unload: { tabId: 7, documentId: 'doc-previous' },
    enabled: true,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'does nothing when no session is active',
    owner: null,
    unload: { tabId: 7, documentId: 'doc-a' },
    enabled: true,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'applies the same rule when the sender tab is unknown',
    owner: SESSION,
    unload: { documentId: 'doc-a' },
    enabled: true,
    expected: { detached: true, stopped: false },
    detachCalls: 1,
    stopCalls: 0,
  },
  {
    name: 'acts on nothing when a newer session replaced the one it was decided for',
    owner: SESSION,
    unload: { tabId: 7, documentId: 'doc-a' },
    enabled: false,
    ownerAfter: { tabId: 7, documentId: 'doc-newer' },
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'acts on nothing when the session ended while storage was in flight',
    owner: SESSION,
    unload: { tabId: 7, documentId: 'doc-a' },
    enabled: true,
    ownerAfter: null,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
];

describe('applyViewUnloadPolicy', () => {
  it.each(CASES)('$name', async (testCase) => {
    const service = createFakeService(testCase.owner, { ownerAfter: testCase.ownerAfter });

    const outcome = await applyViewUnloadPolicy(service, testCase.unload, testCase.enabled);

    expect(outcome).toEqual(testCase.expected);
    expect(service.detachVisualAttachment).toHaveBeenCalledTimes(testCase.detachCalls);
    expect(service.stop).toHaveBeenCalledTimes(testCase.stopCalls);
    if (testCase.detachCalls > 0) {
      // Detaching is scoped to the document that actually unloaded.
      expect(service.detachVisualAttachment).toHaveBeenCalledWith(SESSION.documentId);
    }
  });
});
