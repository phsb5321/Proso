// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * MP3 Encoding Web Worker for VoxPage
 * Provides non-blocking MP3 encoding in a separate thread
 *
 * @module utils/audio/mp3-worker
 * @description Web Worker wrapper for MP3 encoding to prevent UI blocking
 */

import { Mp3Encoder as LameMp3Encoder } from 'lamejs';
import type { ExportQuality } from '../config/schema';

/**
 * Message types for worker communication
 */
export type WorkerMessage =
  | { type: 'encode'; id: string; audioData: Float32Array; options: EncoderOptions }
  | { type: 'cancel'; id: string }
  | { type: 'progress'; id: string; percent: number }
  | { type: 'complete'; id: string; blob: Blob; durationMs: number }
  | { type: 'error'; id: string; error: string };

/**
 * Encoder options for worker
 */
export interface EncoderOptions {
  channels: 1 | 2;
  sampleRate: number;
  quality: ExportQuality;
}

/**
 * Active encoding jobs
 */
const activeJobs = new Map<string, { cancelled: boolean }>();

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'encode':
      await handleEncode(message.id, message.audioData, message.options);
      break;
    case 'cancel':
      handleCancel(message.id);
      break;
  }
};

/**
 * Handle encode request
 */
async function handleEncode(
  id: string,
  audioData: Float32Array,
  options: EncoderOptions
): Promise<void> {
  const job = { cancelled: false };
  activeJobs.set(id, job);

  try {
    const kbps = parseInt(options.quality, 10);
    const encoder = new LameMp3Encoder(
      options.channels,
      options.sampleRate,
      kbps
    );

    // Convert float to int16
    const samples = floatTo16BitPCM(audioData);
    const mp3Data: Uint8Array[] = [];

    // Encode in chunks
    const chunkSize = 1152;
    const totalChunks = Math.ceil(samples.length / chunkSize);
    let processedChunks = 0;

    for (let i = 0; i < samples.length; i += chunkSize) {
      if (job.cancelled) {
        throw new Error('Encoding cancelled');
      }

      const chunk = samples.subarray(i, Math.min(i + chunkSize, samples.length));
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }

      processedChunks++;

      // Report progress every 10 chunks
      if (processedChunks % 10 === 0) {
        const percent = Math.round((processedChunks / totalChunks) * 100);
        self.postMessage({
          type: 'progress',
          id,
          percent,
        } as WorkerMessage);
      }
    }

    // Flush remaining data
    const mp3buf = encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    // Create blob
    const blob = new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
    const durationMs = (samples.length / options.sampleRate) * 1000;

    // Send complete message
    self.postMessage({
      type: 'complete',
      id,
      blob,
      durationMs,
    } as WorkerMessage);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as WorkerMessage);
  } finally {
    activeJobs.delete(id);
  }
}

/**
 * Handle cancel request
 */
function handleCancel(id: string): void {
  const job = activeJobs.get(id);
  if (job) {
    job.cancelled = true;
  }
}

/**
 * Convert Float32Array to Int16Array
 */
function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

/**
 * Helper class to use the worker from the main thread
 * This is NOT run in the worker, but imported in the main thread
 */
export class Mp3WorkerEncoder {
  private worker: Worker | null = null;
  private pendingJobs = new Map<
    string,
    {
      resolve: (result: { blob: Blob; durationMs: number }) => void;
      reject: (error: Error) => void;
      onProgress?: (percent: number) => void;
    }
  >();

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    if (this.worker) return;

    // Create worker from this file
    this.worker = new Worker(new URL('./mp3-worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (error) => {
      console.error('[Mp3WorkerEncoder] Worker error:', error);
    };
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    const job = this.pendingJobs.get(message.id);
    if (!job) return;

    switch (message.type) {
      case 'progress':
        job.onProgress?.(message.percent);
        break;
      case 'complete':
        job.resolve({ blob: message.blob, durationMs: message.durationMs });
        this.pendingJobs.delete(message.id);
        break;
      case 'error':
        job.reject(new Error(message.error));
        this.pendingJobs.delete(message.id);
        break;
    }
  }

  /**
   * Encode audio data to MP3
   */
  async encode(
    audioData: Float32Array,
    options: EncoderOptions,
    onProgress?: (percent: number) => void
  ): Promise<{ blob: Blob; durationMs: number }> {
    await this.initialize();

    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.pendingJobs.set(id, { resolve, reject, onProgress });

      this.worker!.postMessage({
        type: 'encode',
        id,
        audioData,
        options,
      } as WorkerMessage);
    });
  }

  /**
   * Cancel an encoding job
   */
  cancel(id: string): void {
    if (this.worker) {
      this.worker.postMessage({
        type: 'cancel',
        id,
      } as WorkerMessage);
    }
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingJobs.clear();
  }
}

/**
 * Create a new worker encoder instance
 */
export function createMp3WorkerEncoder(): Mp3WorkerEncoder {
  return new Mp3WorkerEncoder();
}
