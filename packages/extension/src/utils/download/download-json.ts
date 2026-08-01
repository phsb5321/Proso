// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * JSON File Download
 *
 * Writes a JSON document into the browser's download folder under a caller-
 * chosen name. Split out from the page that triggers it because everything
 * risky about writing a file — when the blob may be released, when the write
 * has actually finished, what a missing permission looks like — is invisible
 * from the button's point of view and untestable while it lives inline.
 *
 * @module utils/download/download-json
 */

import { browser } from 'wxt/browser';

/** How a download ended, once it has stopped moving. */
interface Outcome {
  state: 'complete' | 'interrupted';
  error?: string;
}

interface ChangedDelta {
  id: number;
  state?: { current?: string };
  error?: { current?: string };
}

/**
 * Watch every download's terminal state, starting now.
 *
 * The obvious shape — call `download()`, then listen for the id it returns —
 * has a hole: `download()` resolving and `onChanged` firing are separate
 * messages from the browser's parent process, and nothing orders them. A small
 * file can therefore finish before the listener exists, firing into an empty
 * room and leaving the caller waiting forever with no error to show. Listening
 * first and remembering outcomes by id removes the window rather than betting
 * against it.
 *
 * ponytail: a download the user pauses from the downloads panel never reaches
 * a terminal state, so `settled` waits indefinitely rather than timing out. The
 * caller keeps its button disabled meanwhile. If that ever becomes a real
 * complaint the fix is a timeout that reports pessimistically, not a guess that
 * the write finished.
 */
function watchDownloads(): {
  settled: (downloadId: number) => Promise<Outcome>;
  stop: () => void;
} {
  const finished = new Map<number, Outcome>();
  const waiting = new Map<number, (outcome: Outcome) => void>();

  const onChanged = (delta: ChangedDelta): void => {
    const state = delta.state?.current;
    if (state !== 'complete' && state !== 'interrupted') return;

    const outcome: Outcome = { state, error: delta.error?.current };
    const waiter = waiting.get(delta.id);

    if (waiter) {
      waiting.delete(delta.id);
      waiter(outcome);
    } else {
      finished.set(delta.id, outcome);
    }
  };

  browser.downloads.onChanged.addListener(onChanged);

  return {
    settled: (downloadId) => {
      const already = finished.get(downloadId);
      if (already) {
        finished.delete(downloadId);
        return Promise.resolve(already);
      }
      return new Promise((resolve) => waiting.set(downloadId, resolve));
    },
    stop: () => browser.downloads.onChanged.removeListener(onChanged),
  };
}

/**
 * Write a JSON document to the download folder and wait for it to land.
 *
 * @param filename - Name within the download folder; an existing file of the
 *   same name is replaced rather than sitting beside a `name(1).json`
 * @param json - The document, written verbatim
 * @throws If the write cannot start, or does not finish
 */
export async function downloadJson(filename: string, json: string): Promise<void> {
  // Without the `downloads` manifest permission this namespace is simply
  // absent, so the call below would throw `undefined is not an object` at the
  // reader rather than saying what is wrong.
  if (!browser.downloads?.download) {
    throw new Error('Downloads are unavailable: the extension lacks the "downloads" permission');
  }

  const objectUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  // Before the download exists, so a fast one cannot finish unobserved.
  const watch = watchDownloads();

  try {
    const downloadId = await browser.downloads.download({
      url: objectUrl,
      filename,
      // The fixed filename is the point: something reading the path wants the
      // newest export there, not the third copy beside it.
      conflictAction: 'overwrite',
      saveAs: false,
    });

    const outcome = await watch.settled(downloadId);

    if (outcome.state === 'interrupted') {
      throw new Error(outcome.error ?? 'Download interrupted');
    }
  } finally {
    // Every path releases both: a download that never started, one that was
    // interrupted, and the successful case alike.
    watch.stop();
    URL.revokeObjectURL(objectUrl);
  }
}
