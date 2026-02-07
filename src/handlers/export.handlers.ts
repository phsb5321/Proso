/**
 * Export Message Handlers
 *
 * Hexagonal handlers for MP3 export operations.
 * Wraps the existing export logic from utils/messaging/handlers/export.ts
 * into the hexagonal handler registry pattern.
 *
 * @module handlers/export
 */

import type { HandlerRegistry } from './registry';

// ============================================
// Types
// ============================================

/**
 * Export job status type.
 */
type ExportJobStatus = 'pending' | 'generating' | 'encoding' | 'complete' | 'error';

/**
 * Export job state.
 */
interface ExportJob {
  id: string;
  status: ExportJobStatus;
  currentParagraph: number;
  totalParagraphs: number;
  blobUrl?: string;
  error?: string;
  cancelled: boolean;
}

/**
 * Export handler error type.
 */
export type ExportHandlerError =
  | { type: 'job_not_found'; jobId: string }
  | { type: 'job_already_exists'; jobId: string }
  | { type: 'not_ready'; message: string }
  | { type: 'operation_failed'; message: string }
  | { type: 'invalid_params'; message: string };

/**
 * Response types for export handlers.
 */
export interface ExportStartResponse {
  success: boolean;
  jobId: string;
  error?: string;
}

export interface ExportCancelResponse {
  success: boolean;
  wasCancelled: boolean;
}

export interface ExportProgressResponse {
  status: ExportJobStatus;
  currentParagraph: number;
  totalParagraphs: number;
  percentComplete: number;
  error?: string;
}

export interface ExportDownloadResponse {
  success: boolean;
  error?: string;
}

// ============================================
// Handler Parameters
// ============================================

interface ExportStartParams {
  jobId: string;
  paragraphs: Array<{ index: number; text: string }>;
  provider: string;
  voice?: string;
  speed: number;
  quality?: string;
}

interface ExportCancelParams {
  jobId: string;
}

interface ExportProgressParams {
  jobId: string;
}

interface ExportDownloadParams {
  jobId: string;
  filename?: string;
}

// ============================================
// State
// ============================================

const activeJobs = new Map<string, ExportJob>();

/**
 * Get active jobs map (for testing).
 */
export function getActiveJobs(): Map<string, ExportJob> {
  return activeJobs;
}

/**
 * Clear all active jobs (for testing).
 */
export function clearActiveJobs(): void {
  activeJobs.clear();
}

// ============================================
// Dependencies (injectable for testing)
// ============================================

export interface ExportDependencies {
  generateAudio: (request: {
    text: string;
    provider: string;
    voice?: string;
    speed: number;
  }) => Promise<{ audioUrl?: string; success?: boolean; error?: string }>;
  downloadFile: (url: string, filename: string) => Promise<void>;
  encodeToMp3: (
    audioBlobs: Blob[],
  ) => Promise<{ blob: Blob; durationMs: number; sizeBytes: number }>;
  createAudioUrl: (blob: Blob) => Promise<string>;
  revokeAudioUrl: (url: string | null) => void;
  saveExportHistory: (entry: {
    jobId: string;
    completedAt: number;
    fileSize: number;
    durationMs: number;
    filename: string;
  }) => Promise<void>;
}

let dependencies: ExportDependencies | null = null;

/**
 * Set the export dependencies.
 * Called during container initialization.
 */
export function setExportDependencies(deps: ExportDependencies): void {
  dependencies = deps;
}

function getDependencies(): ExportDependencies {
  if (!dependencies) {
    throw new Error('Export dependencies not initialized. Call setExportDependencies() first.');
  }
  return dependencies;
}

// ============================================
// Handlers
// ============================================

/**
 * Start an export job.
 */
async function handleExportStart(params: unknown): Promise<ExportStartResponse> {
  const p = params as ExportStartParams;

  if (!p.jobId || typeof p.jobId !== 'string') {
    return { success: false, jobId: '', error: 'jobId is required' };
  }

  if (!p.paragraphs || !Array.isArray(p.paragraphs) || p.paragraphs.length === 0) {
    return {
      success: false,
      jobId: p.jobId,
      error: 'paragraphs array is required and must not be empty',
    };
  }

  if (activeJobs.has(p.jobId)) {
    return { success: false, jobId: p.jobId, error: 'Export job already exists' };
  }

  const job: ExportJob = {
    id: p.jobId,
    status: 'pending',
    currentParagraph: 0,
    totalParagraphs: p.paragraphs.length,
    cancelled: false,
  };

  activeJobs.set(p.jobId, job);

  // Start async export process (fire-and-forget)
  processExportJob(job, p.paragraphs, p.provider, p.voice, p.speed ?? 1.0).catch((error) => {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : 'Unknown error';
  });

  return { success: true, jobId: p.jobId };
}

/**
 * Cancel an export job.
 */
async function handleExportCancel(params: unknown): Promise<ExportCancelResponse> {
  const p = params as ExportCancelParams;

  if (!p.jobId || typeof p.jobId !== 'string') {
    return { success: false, wasCancelled: false };
  }

  const job = activeJobs.get(p.jobId);
  if (!job) {
    return { success: false, wasCancelled: false };
  }

  job.cancelled = true;
  job.status = 'error';
  job.error = 'Cancelled';

  // Clean up blob URL
  try {
    const deps = getDependencies();
    deps.revokeAudioUrl(job.blobUrl ?? null);
  } catch {
    // Dependencies not initialized, skip cleanup
  }

  activeJobs.delete(p.jobId);

  return { success: true, wasCancelled: true };
}

/**
 * Get export progress.
 */
async function handleExportGetProgress(params: unknown): Promise<ExportProgressResponse> {
  const p = params as ExportProgressParams;

  if (!p.jobId || typeof p.jobId !== 'string') {
    return {
      status: 'error',
      currentParagraph: 0,
      totalParagraphs: 0,
      percentComplete: 0,
      error: 'jobId is required',
    };
  }

  const job = activeJobs.get(p.jobId);
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
 * Download a completed export.
 */
async function handleExportDownload(params: unknown): Promise<ExportDownloadResponse> {
  const p = params as ExportDownloadParams;

  if (!p.jobId || typeof p.jobId !== 'string') {
    return { success: false, error: 'jobId is required' };
  }

  const job = activeJobs.get(p.jobId);
  if (!job || job.status !== 'complete' || !job.blobUrl) {
    return { success: false, error: 'Export not ready for download' };
  }

  try {
    const deps = getDependencies();
    const filename = p.filename || `voxpage-export-${Date.now()}.mp3`;
    await deps.downloadFile(job.blobUrl, filename);

    await deps.saveExportHistory({
      jobId: job.id,
      completedAt: Date.now(),
      fileSize: 0,
      durationMs: 0,
      filename,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Process export job asynchronously.
 */
async function processExportJob(
  job: ExportJob,
  paragraphs: Array<{ index: number; text: string }>,
  provider: string,
  voice: string | undefined,
  speed: number,
): Promise<void> {
  const deps = getDependencies();
  job.status = 'generating';

  const audioBlobs: Blob[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    if (job.cancelled) {
      throw new Error('Export cancelled');
    }

    job.currentParagraph = i + 1;

    const audioResponse = await deps.generateAudio({
      text: paragraphs[i].text,
      provider,
      voice,
      speed,
    });

    if (audioResponse?.audioUrl) {
      const response = await fetch(audioResponse.audioUrl);
      const blob = await response.blob();
      audioBlobs.push(blob);
    }
  }

  job.status = 'encoding';

  if (audioBlobs.length > 0) {
    const result = await deps.encodeToMp3(audioBlobs);
    job.blobUrl = await deps.createAudioUrl(result.blob);
  }

  job.status = 'complete';
}

/**
 * Clean up completed or errored jobs.
 */
export function cleanupCompletedJobs(): void {
  for (const [jobId, job] of activeJobs) {
    if (job.status === 'complete' || job.status === 'error') {
      try {
        const deps = getDependencies();
        deps.revokeAudioUrl(job.blobUrl ?? null);
      } catch {
        // Dependencies not initialized, skip cleanup
      }
      activeJobs.delete(jobId);
    }
  }
}

// ============================================
// Registration
// ============================================

/**
 * Register all export handlers on the given registry.
 */
export function registerExportHandlers(registry: HandlerRegistry): void {
  registry.register('export.start', handleExportStart, 'Start MP3 export job');
  registry.register('export.cancel', handleExportCancel, 'Cancel export job');
  registry.register('export.getProgress', handleExportGetProgress, 'Get export progress');
  registry.register('export.download', handleExportDownload, 'Download completed export');
}
