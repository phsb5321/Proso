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
 * Deliver a downloads.onChanged event.
 *
 * Synchronous on purpose. `downloadJson` attaches its listener before it asks
 * for the download, so there is no window in which an event has nowhere to
 * land — and a test that had to wait for the listener would be hiding exactly
 * the race this module exists to avoid.
 */
function emit(delta: ChangedDelta): void {
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
    emit({ id: 7, state: { current: 'complete' } });
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

    emit({ id: 7, state: { current: 'complete' } });
    await expect(promise).resolves.toBeUndefined();
  });

  it('holds the blob until the write settles, then releases it', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    await settledYet(promise);

    // Revoking here is what truncates the file.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    emit({ id: 7, state: { current: 'complete' } });
    await promise;

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('fails with the reason the browser gave when the write is interrupted', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'FILE_NO_SPACE' } });

    await expect(promise).rejects.toThrow('FILE_NO_SPACE');
  });

  it('releases the blob when the write is interrupted', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'FILE_NO_SPACE' } });
    await expect(promise).rejects.toThrow();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('still fails when the browser interrupts without naming a reason', async () => {
    // `DownloadDelta.error` is optional, and a delta only carries the fields
    // that changed — so an interruption can arrive with no reason attached.
    // Reporting nothing there would leave the reader with a stuck button and
    // no message.
    const promise = downloadJson('proso-highlights.json', '[]\n');
    emit({ id: 7, state: { current: 'interrupted' } });

    await expect(promise).rejects.toThrow('Download interrupted');
  });

  it('releases the blob when the download never starts', async () => {
    // Nothing will ever settle this one, so the `finally` is the only release.
    mockDownload.mockRejectedValue(new Error('user cancelled'));

    await expect(downloadJson('proso-highlights.json', '[]\n')).rejects.toThrow('user cancelled');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('ignores state changes belonging to other downloads', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');

    emit({ id: 999, state: { current: 'complete' } });
    expect(await settledYet(promise)).toBe('pending');

    emit({ id: 7, state: { current: 'complete' } });
    await expect(promise).resolves.toBeUndefined();
  });

  it('catches a download that finishes before its id comes back', async () => {
    // `download()` resolving and `onChanged` firing are separate messages from
    // the browser, and nothing orders them — so a small file can be written
    // before the caller learns which id to wait for. Listening only from that
    // point on would miss this event and hang the export forever.
    mockDownload.mockImplementation(async () => {
      emit({ id: 7, state: { current: 'complete' } });
      return 7;
    });

    await expect(downloadJson('proso-highlights.json', '[]\n')).resolves.toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:proso-test');
  });

  it('reports a failure that lands before its id comes back', async () => {
    mockDownload.mockImplementation(async () => {
      emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'FILE_NO_SPACE' } });
      return 7;
    });

    await expect(downloadJson('proso-highlights.json', '[]\n')).rejects.toThrow('FILE_NO_SPACE');
  });

  it('stops listening once the download has settled', async () => {
    const promise = downloadJson('proso-highlights.json', '[]\n');
    emit({ id: 7, state: { current: 'complete' } });
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
