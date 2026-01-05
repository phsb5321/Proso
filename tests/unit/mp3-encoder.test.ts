/**
 * Unit tests for MP3 Encoder
 * @module tests/unit/mp3-encoder.test
 * @description Tests MP3 encoding functionality for audio export feature (US2)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock functions
const mockEncodeBuffer = jest.fn().mockReturnValue(new Int8Array([0x49, 0x44, 0x33]));
const mockFlush = jest.fn().mockReturnValue(new Int8Array([0xff, 0xfb]));
const MockMp3Encoder = jest.fn().mockImplementation(() => ({
  encodeBuffer: mockEncodeBuffer,
  flush: mockFlush,
}));

// Mock lamejs using unstable_mockModule for ESM
jest.unstable_mockModule('lamejs', () => ({
  Mp3Encoder: MockMp3Encoder,
  default: { Mp3Encoder: MockMp3Encoder },
}));

// Import after mock setup
const mp3Module = await import('../../utils/audio/mp3-encoder');
const { Mp3Encoder, createMp3Encoder } = mp3Module;
type Mp3EncoderType = InstanceType<typeof Mp3Encoder>;

describe('Mp3Encoder', () => {
  let encoder: Mp3EncoderType;

  beforeEach(() => {
    encoder = new Mp3Encoder();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create encoder with default options', () => {
      const defaultEncoder = new Mp3Encoder();
      expect(defaultEncoder).toBeInstanceOf(Mp3Encoder);
    });

    it('should create encoder with custom options', () => {
      const customEncoder = new Mp3Encoder({
        channels: 2,
        sampleRate: 48000,
        quality: '256',
      });
      expect(customEncoder).toBeInstanceOf(Mp3Encoder);
    });

    it('should accept partial options', () => {
      const partialEncoder = new Mp3Encoder({
        quality: '128',
      });
      expect(partialEncoder).toBeInstanceOf(Mp3Encoder);
    });
  });

  describe('encode', () => {
    it('should encode Float32Array audio data', async () => {
      const audioData = new Float32Array([0.5, -0.5, 0.25, -0.25, 0, 0.1]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
      expect(result.type).toBe('audio/mp3');
      expect(MockMp3Encoder).toHaveBeenCalled();
    });

    it('should encode Int16Array audio data', async () => {
      const audioData = new Int16Array([16384, -16384, 8192, -8192]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
      expect(result.type).toBe('audio/mp3');
    });

    it('should handle empty audio data', async () => {
      const audioData = new Float32Array([]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
      expect(result.type).toBe('audio/mp3');
    });

    it('should encode data in chunks', async () => {
      // Create audio data larger than chunk size (1152)
      const audioData = new Float32Array(5000);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(i * 0.01);
      }

      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
      // Should have called encodeBuffer multiple times
      expect(mockEncodeBuffer.mock.calls.length).toBeGreaterThan(1);
    });

    it('should throw error when encoding is cancelled during processing', async () => {
      // Set up encoder to cancel after first chunk
      let callCount = 0;
      mockEncodeBuffer.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          encoder.cancel();
        }
        return new Int8Array([0x49, 0x44, 0x33]);
      });

      const audioData = new Float32Array(5000);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(i * 0.01);
      }

      await expect(encoder.encode(audioData)).rejects.toThrow('Encoding cancelled');
    });

    it('should call flush after encoding', async () => {
      const audioData = new Float32Array([0.5, -0.5]);
      await encoder.encode(audioData);

      expect(mockFlush).toHaveBeenCalled();
    });
  });

  describe('concatenateBlobs', () => {
    // Create mock blobs with arrayBuffer method
    const createMockBlob = (data: Uint8Array) => {
      const blob = new Blob([data as BlobPart], { type: 'audio/mp3' });
      // Add arrayBuffer method for test environment
      (blob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
        Promise.resolve(new ArrayBuffer(data.length));
      return blob;
    };

    it('should concatenate multiple blobs', async () => {
      const blob1 = createMockBlob(new Uint8Array([1, 2, 3]));
      const blob2 = createMockBlob(new Uint8Array([4, 5, 6]));

      const result = await encoder.concatenateBlobs([blob1, blob2]);

      expect(result).toBeDefined();
      expect(result.type).toBe('audio/mp3');
    });

    it('should handle empty blob array', async () => {
      const result = await encoder.concatenateBlobs([]);

      expect(result).toBeDefined();
      expect(result.type).toBe('audio/mp3');
    });

    it('should handle single blob', async () => {
      const blob = createMockBlob(new Uint8Array([1, 2, 3]));

      const result = await encoder.concatenateBlobs([blob]);

      expect(result).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('should set cancelled flag', () => {
      expect(encoder.isCancelled()).toBe(false);

      encoder.cancel();

      expect(encoder.isCancelled()).toBe(true);
    });

    it('should be reset when new encoder created', () => {
      encoder.cancel();
      expect(encoder.isCancelled()).toBe(true);

      // Create a new encoder to test reset behavior
      const newEncoder = new Mp3Encoder();
      expect(newEncoder.isCancelled()).toBe(false);
    });
  });

  describe('floatTo16BitPCM conversion', () => {
    it('should clamp values to valid range', async () => {
      // Values outside -1 to 1 should be clamped
      const audioData = new Float32Array([2.0, -2.0, 1.5, -1.5]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
      // Encoder should not throw even with out-of-range values
    });

    it('should handle silence correctly', async () => {
      const audioData = new Float32Array([0, 0, 0, 0]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
    });

    it('should handle full-scale positive values', async () => {
      const audioData = new Float32Array([1, 1, 1, 1]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
    });

    it('should handle full-scale negative values', async () => {
      const audioData = new Float32Array([-1, -1, -1, -1]);
      const result = await encoder.encode(audioData);

      expect(result).toBeDefined();
    });
  });

  describe('quality settings', () => {
    it('should use 128 kbps quality', async () => {
      const lowQualityEncoder = new Mp3Encoder({ quality: '128' });
      const audioData = new Float32Array([0.5, -0.5]);
      await lowQualityEncoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(1, 44100, 128);
    });

    it('should use 192 kbps quality (default)', async () => {
      const audioData = new Float32Array([0.5, -0.5]);
      await encoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(1, 44100, 192);
    });

    it('should use 256 kbps quality', async () => {
      const highQualityEncoder = new Mp3Encoder({ quality: '256' });
      const audioData = new Float32Array([0.5, -0.5]);
      await highQualityEncoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(1, 44100, 256);
    });
  });

  describe('channel configuration', () => {
    it('should encode mono audio', async () => {
      const monoEncoder = new Mp3Encoder({ channels: 1 });
      const audioData = new Float32Array([0.5, -0.5]);
      await monoEncoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
    });

    it('should encode stereo audio', async () => {
      const stereoEncoder = new Mp3Encoder({ channels: 2 });
      const audioData = new Float32Array([0.5, -0.5]);
      await stereoEncoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number));
    });
  });

  describe('sample rate configuration', () => {
    it('should use default 44100 Hz sample rate', async () => {
      const audioData = new Float32Array([0.5, -0.5]);
      await encoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(expect.any(Number), 44100, expect.any(Number));
    });

    it('should use custom sample rate', async () => {
      const customSampleRateEncoder = new Mp3Encoder({ sampleRate: 48000 });
      const audioData = new Float32Array([0.5, -0.5]);
      await customSampleRateEncoder.encode(audioData);

      expect(MockMp3Encoder).toHaveBeenCalledWith(expect.any(Number), 48000, expect.any(Number));
    });
  });
});

describe('createMp3Encoder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create Mp3Encoder instance', () => {
    const encoder = createMp3Encoder();

    expect(encoder).toBeInstanceOf(Mp3Encoder);
  });

  it('should pass options to encoder', () => {
    const encoder = createMp3Encoder({
      channels: 2,
      sampleRate: 48000,
      quality: '256',
    });

    expect(encoder).toBeInstanceOf(Mp3Encoder);
  });

  it('should create encoder with default options when none provided', () => {
    const encoder = createMp3Encoder();

    expect(encoder).toBeInstanceOf(Mp3Encoder);
    expect(encoder.isCancelled()).toBe(false);
  });
});
