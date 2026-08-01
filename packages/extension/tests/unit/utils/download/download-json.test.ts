// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * JSON File Download
 *
 * The download path is the part of an export that cannot be checked by
 * looking at it: `downloads.download()` resolving means the browser accepted
 * the job, not that anything was written, and the difference only shows up as
 * a truncated file or a success message over a failed write. These tests hold
 * the timing that inspection cannot.
 *
 * @module tests/unit/utils/download/download-json.test
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type ChangedDelta = {
  id: number;
  state?: { current?: string };
  error?: { current?: string };
};
type ChangedListener = (delta: ChangedDelta) => void;

const listeners = new Set<ChangedListener>();

const mockDownload = jest.fn<(options: Record<string, unknown>) => Promise<number>>();

const mockBrowser = {
  downloads: {
    download: mockDownload,
    onChanged: {
      addListener: (listener: ChangedListener): void => {
        listeners.add(listener);
      },
      removeListener: (listener: ChangedListener): void => {
        listeners.delete(listener);
      },
    },
  },
};

jest.unstable_mockModule('wxt/browser', () => ({ browser: mockBrowser }));

const { downloadJson } = await import('../../../../src/utils/download/download-json');

/**
 * Deliver a downloads.onChanged event, once something is actually listening.
 *
 * `downloadJson` awaits `download()` before it attaches its listener, so an
 * event emitted synchronously after the call lands in an empty room and the
 * export hangs forever — which is a property of the test, not the code.
 */
async function emit(delta: ChangedDelta): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const listener of [...listeners]) listener(delta);
}

/** Resolve to 'pending' if the promise has not settled by the next tick. */
async function settledYet(promise: Promise<unknown>): Promise<'settled' | 'pending'> {
  return Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    Promise.resolve().then(() => 'pending' as const),
  ]);
}

const createObjectURL = jest.fn(() => 'blob:proso-test');
const revokeObjectURL = jest.fn();

beforeEach(() => {
  listeners.clear();
  mockDownload.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  mockDownload.mockResolvedValue(7);
  globalThis.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

describe('downloadJson', () => {
  it('replaces the file at the requested name instead of writing beside it', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await emit({ id: 7, state: { current: 'complete' } });
    await promise;

    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'proso-highlights.json',
        conflictAction: 'overwrite',
        saveAs: false,
      }),
    );
  });

  it('does not report the write as done until the browser says it is', async () => {
    // The whole point of the module: `download()` has already resolved here,
    // and the file is not necessarily on disk yet.
    const promise = downloadJson('proso-highlights.json', '[]\n');

    expect(await settledYet(promise)).toBe('pending');

    await emit({ id: 7, state: { current: 'complete' } });
    await expect(promise).resolves.toBeUndefined();
  });

  it('holds the blob until the write settles, then releases it', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await settledYet(promise);

    // Revoking here is what truncates the file.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await emit({ id: 7, state: { current: 'complete' } });
    await promise;

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('fails with the reason the browser gave when the write is interrupted', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'DISK_FULL' } });

    await expect(promise).rejects.toThrow('DISK_FULL');
  });

  it('releases the blob when the write is interrupted', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'DISK_FULL' } });
    await expect(promise).rejects.toThrow();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('releases the blob when the download never starts', async () => {
    // Nothing will ever settle this one, so the `finally` is the only release.
    mockDownload.mockRejectedValue(new Error('user cancelled'));

    await expect(downloadJson('proso-highlights.json', '[]\n')).rejects.toThrow('user cancelled');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('ignores state changes belonging to other downloads', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');

    await emit({ id: 999, state: { current: 'complete' } });
    expect(await settledYet(promise)).toBe('pending');

    await emit({ id: 7, state: { current: 'complete' } });
    await expect(promise).resolves.toBeUndefined();
  });

  it('stops listening once the download has settled', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await emit({ id: 7, state: { current: 'complete' } });
    await promise;

    // A listener per export would accumulate for the life of the page.
    expect(listeners.size).toBe(0);
  });

  it('says what is wrong when the downloads permission is missing', async () => {
    // `browser.downloads` is undefined without the manifest permission, so the
    // unguarded call throws a TypeError naming nothing the reader can act on.
    const saved = mockBrowser.downloads;
    (mockBrowser as { downloads?: unknown }).downloads = undefined;

    try {
      await expect(downloadJson('proso-highlights.json', '[]\n')).rejects.toThrow(
        /"downloads" permission/,
      );
    } finally {
      (mockBrowser as { downloads?: unknown }).downloads = saved;
    }
  });
});
