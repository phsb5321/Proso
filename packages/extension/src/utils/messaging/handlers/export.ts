// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Export Message Handlers for Proso
 * Handles MP3 export requests from popup/content
 *
 * @module utils/messaging/handlers/export
 */

import type { ProsoProtocol, ExportJobStatus } from '../protocol';
import { Mp3Encoder, type EncodingResult } from '../../audio/mp3-encoder';
import { ROADMAP_STORAGE_KEYS } from '../../config/schema';
import { createAudioUrl, revokeAudioUrl } from '../../audio/audio-url';

/**
 * Export job state
 */
interface ExportJob {
  id: string;
  status: ExportJobStatus;
  currentParagraph: number;
  totalParagraphs: number;
  result?: EncodingResult;
  blobUrl?: string;
  error?: string;
  encoder?: Mp3Encoder;
}

/**
 * Active export jobs
 */
const activeJobs = new Map<string, ExportJob>();

/**
 * Handle export.start message
 * Starts MP3 export job for article paragraphs
 */
export async function handleExportStart(
  request: ProsoProtocol['export.start']['request'],
): Promise<ProsoProtocol['export.start']['response']> {
  const { jobId, paragraphs, provider, voice, speed, quality } = request;

  // Check if job already exists
  if (activeJobs.has(jobId)) {
    return {
      success: false,
      jobId,
      error: 'Export job already exists',
    };
  }

  // Create job
  const job: ExportJob = {
    id: jobId,
    status: 'pending',
    currentParagraph: 0,
    totalParagraphs: paragraphs.length,
    encoder: new Mp3Encoder({ quality }),
  };

  activeJobs.set(jobId, job);

  // Start async export process
  processExportJob(job, paragraphs, provider, voice, speed).catch((error) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : 'Unknown error';
  });

  return {
    success: true,
    jobId,
  };
}

/**
 * Handle export.cancel message
 * Cancels an ongoing export job
 */
export async function handleExportCancel(
  request: ProsoProtocol['export.cancel']['request'],
): Promise<ProsoProtocol['export.cancel']['response']> {
  const { jobId } = request;
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      success: false,
      wasCancelled: false,
    };
  }

  // Cancel the encoder
  if (job.encoder) {
    job.encoder.cancel();
  }

  // Clean up (no-op for data URLs)
  revokeAudioUrl(job.blobUrl ?? null);

  activeJobs.delete(jobId);

  return {
    success: true,
    wasCancelled: true,
  };
}

/**
 * Handle export.getProgress message
 * Returns current progress of export job
 */
export async function handleExportGetProgress(
  request: ProsoProtocol['export.getProgress']['request'],
): Promise<ProsoProtocol['export.getProgress']['response']> {
  const { jobId } = request;
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      status: 'error',
      currentParagraph: 0,
      totalParagraphs: 0,
      percentComplete: 0,
      error: 'Job not found',
    };
  }

  const percentComplete =
    job.totalParagraphs > 0 ? Math.round((job.currentParagraph / job.totalParagraphs) * 100) : 0;

  return {
    status: job.status,
    currentParagraph: job.currentParagraph,
    totalParagraphs: job.totalParagraphs,
    percentComplete,
    error: job.error,
  };
}

/**
 * Handle export.download message
 * Triggers download of completed export
 */
export async function handleExportDownload(
  request: ProsoProtocol['export.download']['request'],
): Promise<ProsoProtocol['export.download']['response']> {
  const { jobId, filename } = request;
  const job = activeJobs.get(jobId);

  if (!job || job.status !== 'complete' || !job.blobUrl) {
    return {
      success: false,
      error: 'Export not ready for download',
    };
  }

  try {
    // Trigger download using downloads API
    const downloadFilename = filename || `proso-export-${Date.now()}.mp3`;

    await browser.downloads.download({
      url: job.blobUrl,
      filename: downloadFilename,
      saveAs: true,
    });

    // Save to export history
    await saveExportHistory(job, downloadFilename);

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Process export job asynchronously
 */
async function processExportJob(
  job: ExportJob,
  paragraphs: Array<{ index: number; text: string }>,
  provider: string,
  voice: string | undefined,
  speed: number,
): Promise<void> {
  job.status = 'generating';

  const audioBlobs: Blob[] = [];

  // Generate audio for each paragraph
  for (let i = 0; i < paragraphs.length; i++) {
    if (job.encoder?.isCancelled()) {
      throw new Error('Export cancelled');
    }

    job.currentParagraph = i + 1;

    // TODO: Generate audio using the TTS provider
    // For now, this is a placeholder that would integrate with
    // the existing audio generation system
    const paragraph = paragraphs[i];

    // Generate audio for this paragraph
    // This would call the audio.generate message handler
    const audioResponse = await browser.runtime.sendMessage({
      type: 'audio.generate',
      request: {
        text: paragraph.text,
        provider,
        voice,
        speed,
      },
    });

    if (audioResponse?.audioUrl) {
      const response = await fetch(audioResponse.audioUrl);
      const blob = await response.blob();
      audioBlobs.push(blob);
    }
  }

  job.status = 'encoding';

  // Encode to MP3
  if (job.encoder && audioBlobs.length > 0) {
    job.result = await job.encoder.encodeArticle(audioBlobs);
    job.blobUrl = await createAudioUrl(job.result.blob);
  }

  job.status = 'complete';
}

/**
 * Save export to history
 */
async function saveExportHistory(job: ExportJob, filename: string): Promise<void> {
  const historyKey = ROADMAP_STORAGE_KEYS.EXPORT_HISTORY;
  const result = await browser.storage.local.get(historyKey);
  const history = (result[historyKey] as Array<unknown>) || [];

  // Add new entry
  history.unshift({
    jobId: job.id,
    completedAt: Date.now(),
    fileSize: job.result?.sizeBytes ?? 0,
    durationMs: job.result?.durationMs ?? 0,
    filename,
  });

  // Limit history size
  if (history.length > 50) {
    history.pop();
  }

  await browser.storage.local.set({ [historyKey]: history });
}

/**
 * Clean up completed jobs
 */
export function cleanupCompletedJobs(): void {
  for (const [jobId, job] of activeJobs) {
    if (job.status === 'complete' || job.status === 'error') {
      // Clean up URL (no-op for data URLs)
      revokeAudioUrl(job.blobUrl ?? null);
      activeJobs.delete(jobId);
    }
  }
}

/**
 * Export handlers object for registration
 */
export const exportHandlers = {
  'export.start': handleExportStart,
  'export.cancel': handleExportCancel,
  'export.getProgress': handleExportGetProgress,
  'export.download': handleExportDownload,
};
