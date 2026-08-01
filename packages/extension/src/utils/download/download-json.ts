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

/**
 * Resolve once the browser has finished writing a download.
 *
 * `downloads.download()` resolves when the download is *accepted*, not when
 * the bytes reach disk. Treating acceptance as completion revokes the source
 * blob mid-write and reports a failed write — a full disk, a folder the
 * browser cannot touch — as a successful export.
 *
 * ponytail: a download the user pauses from the downloads panel never reaches
 * a terminal state, so this waits indefinitely rather than timing out. The
 * caller keeps its button disabled meanwhile. If that ever becomes a real
 * complaint the fix is a timeout that reports pessimistically, not a guess
 * that the write finished.
 */
function whenSettled(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onChanged = (delta: {
      id: number;
      state?: { current?: string };
      error?: { current?: string };
    }): void => {
      if (delta.id !== downloadId) return;

      const state = delta.state?.current;
      if (state !== 'complete' && state !== 'interrupted') return;

      browser.downloads.onChanged.removeListener(onChanged);

      if (state === 'complete') {
        resolve();
      } else {
        reject(new Error(delta.error?.current ?? 'Download interrupted'));
      }
    };

    browser.downloads.onChanged.addListener(onChanged);
  });
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

  try {
    const downloadId = await browser.downloads.download({
      url: objectUrl,
      filename,
      // The fixed filename is the point: something reading the path wants the
      // newest export there, not the third copy beside it.
      conflictAction: 'overwrite',
      saveAs: false,
    });

    await whenSettled(downloadId);
  } finally {
    // Every path releases it: a download that never started, one that was
    // interrupted, and the successful case alike.
    URL.revokeObjectURL(objectUrl);
  }
}
