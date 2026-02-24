// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Proso Audio Visualizer Module
 * Provides frequency analysis data for audio visualization using Web Audio API
 *
 * @module utils/audio/visualizer
 */

import { z } from 'zod';

/**
 * Frequency data schema
 */
export const frequencyDataSchema = z.object({
  available: z.boolean(),
  data: z.array(z.number()),
  average: z.number(),
  peak: z.number(),
  binCount: z.number().int().nonnegative().optional(),
});

export type FrequencyData = z.infer<typeof frequencyDataSchema>;

/**
 * Waveform data schema
 */
export const waveformDataSchema = z.object({
  available: z.boolean(),
  data: z.array(z.number()),
  rms: z.number(),
  bufferLength: z.number().int().nonnegative().optional(),
});

export type WaveformData = z.infer<typeof waveformDataSchema>;

/**
 * Visualizer data schema (combined frequency + waveform)
 */
export const visualizerDataSchema = z.object({
  available: z.boolean(),
  frequency: z.object({
    data: z.array(z.number()),
    average: z.number(),
    peak: z.number(),
    binCount: z.number().int().nonnegative().optional(),
  }),
  waveform: z.object({
    data: z.array(z.number()),
    rms: z.number(),
  }),
  timestamp: z.number(),
});

export type VisualizerData = z.infer<typeof visualizerDataSchema>;

// Configuration constants
const FFT_SIZE = 256; // Power of 2, determines frequency resolution
const SMOOTHING_TIME_CONSTANT = 0.8; // 0-1, higher = smoother

/**
 * Audio Visualizer class
 * Encapsulates Web Audio API context and analysis nodes
 */
export class AudioVisualizer {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private timeDomainData: Uint8Array<ArrayBuffer> | null = null;

  /**
   * Initialize the Web Audio API context and analyser node
   * @returns Whether initialization was successful
   */
  initialize(): boolean {
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        return true; // Already initialized
      }

      // Create audio context
      this.audioContext = new (window.AudioContext || (window as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();

      // Create analyser node
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = FFT_SIZE;
      this.analyserNode.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

      // Create gain node for volume control (passthrough)
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect analyser to destination (speakers)
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // Initialize data buffers
      const bufferLength = this.analyserNode.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.timeDomainData = new Uint8Array(bufferLength);

      console.log('Audio visualizer initialized with', bufferLength, 'frequency bins');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio visualizer:', error);
      return false;
    }
  }

  /**
   * Connect an HTML Audio element to the visualizer
   * @param audioElement - The audio element to analyze
   * @returns Whether connection was successful
   */
  connectAudioElement(audioElement: HTMLAudioElement): boolean {
    if (!audioElement) {
      console.error('No audio element provided');
      return false;
    }

    try {
      // Ensure context is initialized
      if (!this.audioContext || this.audioContext.state === 'closed') {
        if (!this.initialize()) {
          return false;
        }
      }

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Disconnect previous source if exists
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch (_e) {
          // May already be disconnected
        }
      }

      // Create media element source from the audio element
      // Note: Each audio element can only be connected once
      try {
        if (!this.audioContext || !this.analyserNode) {
          return false;
        }
        this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
        this.sourceNode.connect(this.analyserNode);
        return true;
      } catch (error: unknown) {
        // Audio element might already be connected
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          console.warn('Audio element already connected to a context');
          return true;
        }
        throw error;
      }
    } catch (error) {
      console.error('Failed to connect audio element:', error);
      return false;
    }
  }

  /**
   * Get current frequency data for visualization
   * @returns Frequency data object with normalized values
   */
  getFrequencyData(): FrequencyData {
    if (!this.analyserNode || !this.frequencyData) {
      return {
        available: false,
        data: [],
        average: 0,
        peak: 0,
      };
    }

    // Get frequency data
    this.analyserNode.getByteFrequencyData(this.frequencyData);

    // Calculate statistics
    let sum = 0;
    let peak = 0;

    for (let i = 0; i < this.frequencyData.length; i++) {
      sum += this.frequencyData[i];
      if (this.frequencyData[i] > peak) {
        peak = this.frequencyData[i];
      }
    }

    const average = sum / this.frequencyData.length;

    // Return normalized data (0-1 range)
    return {
      available: true,
      data: Array.from(this.frequencyData).map((v) => v / 255),
      average: average / 255,
      peak: peak / 255,
      binCount: this.frequencyData.length,
    };
  }

  /**
   * Get time-domain waveform data
   * @returns Waveform data object
   */
  getWaveformData(): WaveformData {
    if (!this.analyserNode || !this.timeDomainData) {
      return {
        available: false,
        data: [],
        rms: 0,
      };
    }

    // Get time domain data
    this.analyserNode.getByteTimeDomainData(this.timeDomainData);

    // Calculate RMS (root mean square) for volume level
    let sumSquares = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const normalized = (this.timeDomainData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / this.timeDomainData.length);

    // Return normalized data (-1 to 1 range centered at 0)
    return {
      available: true,
      data: Array.from(this.timeDomainData).map((v) => (v - 128) / 128),
      rms,
      bufferLength: this.timeDomainData.length,
    };
  }

  /**
   * Get combined visualizer data for the popup
   * @returns Combined frequency and waveform data
   */
  getVisualizerData(): VisualizerData {
    const frequency = this.getFrequencyData();
    const waveform = this.getWaveformData();

    return {
      available: frequency.available && waveform.available,
      frequency: {
        data: frequency.data,
        average: frequency.average,
        peak: frequency.peak,
        binCount: frequency.binCount,
      },
      waveform: {
        data: waveform.data,
        rms: waveform.rms,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Check if the visualizer is ready
   */
  isReady(): boolean {
    return !!(this.audioContext && this.analyserNode && this.audioContext.state !== 'closed');
  }

  /**
   * Get the audio context state
   */
  getContextState(): AudioContextState | 'unavailable' {
    return this.audioContext ? this.audioContext.state : 'unavailable';
  }

  /**
   * Resume audio context if suspended
   */
  async resumeContext(): Promise<boolean> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        return true;
      } catch (error) {
        console.error('Failed to resume audio context:', error);
        return false;
      }
    }
    return this.audioContext?.state === 'running';
  }

  /**
   * Disconnect and clean up the visualizer source
   */
  disconnect(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (_e) {
        // May already be disconnected
      }
      this.sourceNode = null;
    }
  }

  /**
   * Fully close and clean up the audio context
   */
  destroy(): void {
    this.disconnect();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    this.audioContext = null;
    this.analyserNode = null;
    this.gainNode = null;
    this.frequencyData = null;
    this.timeDomainData = null;
  }

  /**
   * Get frequency bin for a specific frequency
   * @param frequency - Frequency in Hz
   * @returns Bin index
   */
  getFrequencyBin(frequency: number): number {
    if (!this.audioContext || !this.analyserNode) return 0;

    const nyquist = this.audioContext.sampleRate / 2;
    const binCount = this.analyserNode.frequencyBinCount;
    return Math.round((frequency / nyquist) * binCount);
  }

  /**
   * Get simplified bar data for visualization
   * Groups frequency bins into a specified number of bars
   * @param barCount - Number of bars to generate
   * @returns Array of bar heights (0-1)
   */
  getBarData(barCount = 32): number[] {
    const frequency = this.getFrequencyData();
    if (!frequency.available || frequency.data.length === 0) {
      return new Array(barCount).fill(0);
    }

    const data = frequency.data;
    const binsPerBar = Math.floor(data.length / barCount);
    const bars: number[] = [];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * binsPerBar;
      const end = start + binsPerBar;

      for (let j = start; j < end && j < data.length; j++) {
        sum += data[j];
      }

      bars.push(sum / binsPerBar);
    }

    return bars;
  }
}

/**
 * Singleton audio visualizer instance
 */
export const audioVisualizer = new AudioVisualizer();

// Export functional API for backwards compatibility
export const initializeVisualizer = () => audioVisualizer.initialize();
export const connectAudioElement = (el: HTMLAudioElement) =>
  audioVisualizer.connectAudioElement(el);
export const getFrequencyData = () => audioVisualizer.getFrequencyData();
export const getWaveformData = () => audioVisualizer.getWaveformData();
export const getVisualizerData = () => audioVisualizer.getVisualizerData();
export const isVisualizerReady = () => audioVisualizer.isReady();
export const getContextState = () => audioVisualizer.getContextState();
export const resumeContext = () => audioVisualizer.resumeContext();
export const disconnectVisualizer = () => audioVisualizer.disconnect();
export const destroyVisualizer = () => audioVisualizer.destroy();
export const getFrequencyBin = (freq: number) => audioVisualizer.getFrequencyBin(freq);
export const getBarData = (barCount?: number) => audioVisualizer.getBarData(barCount);
