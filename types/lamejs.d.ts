/**
 * Type definitions for lamejs 1.2.x
 * MP3 encoding library
 */

declare module 'lamejs' {
  /**
   * MP3 Encoder class
   * Encodes PCM audio data to MP3 format
   */
  export class Mp3Encoder {
    /**
     * Create a new MP3 encoder
     * @param channels - Number of audio channels (1 for mono, 2 for stereo)
     * @param sampleRate - Sample rate in Hz (e.g., 44100)
     * @param kbps - Bitrate in kbps (e.g., 128, 192, 256)
     */
    constructor(channels: number, sampleRate: number, kbps: number);

    /**
     * Encode a buffer of PCM samples
     * @param left - Left channel samples (Int16Array)
     * @param right - Right channel samples (Int16Array, optional for mono)
     * @returns Encoded MP3 data as Int8Array
     */
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;

    /**
     * Flush remaining data and finalize the MP3
     * @returns Final MP3 data as Int8Array
     */
    flush(): Int8Array;
  }

  /**
   * WAV Header reader
   * Parses WAV file headers
   */
  export class WavHeader {
    channels: number;
    sampleRate: number;
    dataOffset: number;
    dataLen: number;

    static readHeader(dataView: DataView): WavHeader;
  }
}
