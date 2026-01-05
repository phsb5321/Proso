/**
 * MP3 Encoder for VoxPage
 * Converts audio blobs to MP3 format using lamejs
 *
 * @module utils/audio/mp3-encoder
 * @description Provides MP3 encoding functionality for audio export feature
 */

import { Mp3Encoder as LameMp3Encoder } from 'lamejs';
import type { ExportQuality } from '../config/schema';

/**
 * Progress callback type for encoding operations
 */
export type EncodingProgressCallback = (
  currentParagraph: number,
  totalParagraphs: number,
  percentComplete: number
) => void;

/**
 * Encoding options for MP3 export
 */
export interface EncodingOptions {
  /** Number of audio channels (1 for mono, 2 for stereo) */
  channels: 1 | 2;
  /** Sample rate in Hz (default: 44100) */
  sampleRate: number;
  /** Bitrate quality level */
  quality: ExportQuality;
  /** Optional progress callback */
  onProgress?: EncodingProgressCallback;
}

/**
 * Result of encoding operation
 */
export interface EncodingResult {
  /** Encoded MP3 data as Blob */
  blob: Blob;
  /** Duration in milliseconds */
  durationMs: number;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Default encoding options
 */
const DEFAULT_OPTIONS: Omit<EncodingOptions, 'onProgress'> = {
  channels: 1,
  sampleRate: 44100,
  quality: '192',
};

/**
 * MP3 Encoder class
 * Handles conversion of audio data to MP3 format
 */
export class Mp3Encoder {
  private options: EncodingOptions;
  private encoder: LameMp3Encoder | null = null;
  private cancelled = false;

  constructor(options: Partial<EncodingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize the encoder with the specified options
   */
  private initEncoder(): void {
    const kbps = parseInt(this.options.quality, 10);
    this.encoder = new LameMp3Encoder(
      this.options.channels,
      this.options.sampleRate,
      kbps
    );
    this.cancelled = false;
  }

  /**
   * Encode audio data to MP3 format
   * @param audioData - PCM audio data as Float32Array or Int16Array
   * @returns Promise resolving to encoded MP3 blob
   */
  async encode(audioData: Float32Array | Int16Array): Promise<Blob> {
    this.initEncoder();

    if (!this.encoder) {
      throw new Error('Failed to initialize MP3 encoder');
    }

    // Convert Float32Array to Int16Array if needed
    const samples =
      audioData instanceof Float32Array
        ? this.floatTo16BitPCM(audioData)
        : audioData;

    const mp3Data: Uint8Array[] = [];

    // Encode in chunks to allow cancellation
    const chunkSize = 1152; // MP3 frame size
    for (let i = 0; i < samples.length; i += chunkSize) {
      if (this.cancelled) {
        throw new Error('Encoding cancelled');
      }

      const chunk = samples.subarray(i, Math.min(i + chunkSize, samples.length));
      const mp3buf = this.encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        // Convert Int8Array to Uint8Array for Blob compatibility
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    // Flush remaining data
    const mp3buf = this.encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
  }

  /**
   * Concatenate multiple audio blobs into a single blob
   * @param blobs - Array of audio blobs to concatenate
   * @returns Promise resolving to concatenated blob
   */
  async concatenateBlobs(blobs: Blob[]): Promise<Blob> {
    // TODO: Implement proper audio concatenation
    // This is a placeholder that just concatenates raw data
    // Real implementation needs to handle audio headers and decode/re-encode
    const arrayBuffers = await Promise.all(
      blobs.map((blob) => blob.arrayBuffer())
    );

    const totalLength = arrayBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const buffer of arrayBuffers) {
      combined.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return new Blob([combined], { type: 'audio/mp3' });
  }

  /**
   * Encode multiple paragraphs to a single MP3 file
   * @param paragraphAudios - Array of audio blobs for each paragraph
   * @returns Promise resolving to encoding result
   */
  async encodeArticle(
    paragraphAudios: Blob[]
  ): Promise<EncodingResult> {
    const startTime = Date.now();

    // Concatenate all audio blobs
    const combinedBlob = await this.concatenateBlobs(paragraphAudios);

    // Convert to ArrayBuffer for encoding
    const arrayBuffer = await combinedBlob.arrayBuffer();
    const audioContext = new (globalThis.AudioContext ||
      (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      await audioContext.close();
    }

    // Get channel data
    const channelData = audioBuffer.getChannelData(0);

    // Encode to MP3
    const mp3Blob = await this.encode(channelData);

    const durationMs = audioBuffer.duration * 1000;

    return {
      blob: mp3Blob,
      durationMs,
      sizeBytes: mp3Blob.size,
    };
  }

  /**
   * Cancel ongoing encoding operation
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Check if encoding is cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Convert Float32Array audio samples to Int16Array
   * @param float32Array - Input audio data in float format (-1 to 1)
   * @returns Converted Int16Array
   */
  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }
}

/**
 * Create a new MP3 encoder with default options
 */
export function createMp3Encoder(
  options?: Partial<EncodingOptions>
): Mp3Encoder {
  return new Mp3Encoder(options);
}
