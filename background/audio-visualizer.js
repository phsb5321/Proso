/**
 * VoxPage Audio Visualizer Module
 * Provides frequency analysis data for audio visualization using Web Audio API
 */

// Audio context and nodes
let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let gainNode = null;

// Analysis data buffers
let frequencyData = null;
let timeDomainData = null;

// Configuration
const FFT_SIZE = 256; // Power of 2, determines frequency resolution
const SMOOTHING_TIME_CONSTANT = 0.8; // 0-1, higher = smoother

/**
 * Initialize the Web Audio API context and analyser node
 * @returns {boolean} Whether initialization was successful
 */
export function initializeVisualizer() {
  try {
    if (audioContext && audioContext.state !== 'closed') {
      return true; // Already initialized
    }

    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create analyser node
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = FFT_SIZE;
    analyserNode.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

    // Create gain node for volume control (passthrough)
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;

    // Connect analyser to destination (speakers)
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Initialize data buffers
    const bufferLength = analyserNode.frequencyBinCount;
    frequencyData = new Uint8Array(bufferLength);
    timeDomainData = new Uint8Array(bufferLength);

    console.log('Audio visualizer initialized with', bufferLength, 'frequency bins');
    return true;
  } catch (error) {
    console.error('Failed to initialize audio visualizer:', error);
    return false;
  }
}

/**
 * Connect an HTML Audio element to the visualizer
 * @param {HTMLAudioElement} audioElement - The audio element to analyze
 * @returns {boolean} Whether connection was successful
 */
export function connectAudioElement(audioElement) {
  if (!audioElement) {
    console.error('No audio element provided');
    return false;
  }

  try {
    // Ensure context is initialized
    if (!audioContext || audioContext.state === 'closed') {
      if (!initializeVisualizer()) {
        return false;
      }
    }

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Disconnect previous source if exists
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (e) {
        // May already be disconnected
      }
    }

    // Create media element source from the audio element
    // Note: Each audio element can only be connected once
    try {
      sourceNode = audioContext.createMediaElementSource(audioElement);
      sourceNode.connect(analyserNode);
      return true;
    } catch (error) {
      // Audio element might already be connected
      if (error.name === 'InvalidStateError') {
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
 * @returns {Object} Frequency data object with normalized values
 */
export function getFrequencyData() {
  if (!analyserNode || !frequencyData) {
    return {
      available: false,
      data: [],
      average: 0,
      peak: 0
    };
  }

  // Get frequency data
  analyserNode.getByteFrequencyData(frequencyData);

  // Calculate statistics
  let sum = 0;
  let peak = 0;

  for (let i = 0; i < frequencyData.length; i++) {
    sum += frequencyData[i];
    if (frequencyData[i] > peak) {
      peak = frequencyData[i];
    }
  }

  const average = sum / frequencyData.length;

  // Return normalized data (0-1 range)
  return {
    available: true,
    data: Array.from(frequencyData).map(v => v / 255),
    average: average / 255,
    peak: peak / 255,
    binCount: frequencyData.length
  };
}

/**
 * Get time-domain waveform data
 * @returns {Object} Waveform data object
 */
export function getWaveformData() {
  if (!analyserNode || !timeDomainData) {
    return {
      available: false,
      data: [],
      rms: 0
    };
  }

  // Get time domain data
  analyserNode.getByteTimeDomainData(timeDomainData);

  // Calculate RMS (root mean square) for volume level
  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const normalized = (timeDomainData[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / timeDomainData.length);

  // Return normalized data (-1 to 1 range centered at 0)
  return {
    available: true,
    data: Array.from(timeDomainData).map(v => (v - 128) / 128),
    rms: rms,
    bufferLength: timeDomainData.length
  };
}

/**
 * Get combined visualizer data for the popup
 * @returns {Object} Combined frequency and waveform data
 */
export function getVisualizerData() {
  const frequency = getFrequencyData();
  const waveform = getWaveformData();

  return {
    available: frequency.available && waveform.available,
    frequency: {
      data: frequency.data,
      average: frequency.average,
      peak: frequency.peak,
      binCount: frequency.binCount
    },
    waveform: {
      data: waveform.data,
      rms: waveform.rms
    },
    timestamp: Date.now()
  };
}

/**
 * Check if the visualizer is ready
 * @returns {boolean}
 */
export function isVisualizerReady() {
  return !!(audioContext && analyserNode && audioContext.state !== 'closed');
}

/**
 * Get the audio context state
 * @returns {string} Context state or 'unavailable'
 */
export function getContextState() {
  return audioContext ? audioContext.state : 'unavailable';
}

/**
 * Resume audio context if suspended
 * @returns {Promise<boolean>}
 */
export async function resumeContext() {
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      return true;
    } catch (error) {
      console.error('Failed to resume audio context:', error);
      return false;
    }
  }
  return audioContext?.state === 'running';
}

/**
 * Disconnect and clean up the visualizer
 */
export function disconnectVisualizer() {
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch (e) {
      // May already be disconnected
    }
    sourceNode = null;
  }
}

/**
 * Fully close and clean up the audio context
 */
export function destroyVisualizer() {
  disconnectVisualizer();

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }

  audioContext = null;
  analyserNode = null;
  gainNode = null;
  frequencyData = null;
  timeDomainData = null;
}

/**
 * Get frequency bin for a specific frequency
 * @param {number} frequency - Frequency in Hz
 * @returns {number} Bin index
 */
export function getFrequencyBin(frequency) {
  if (!audioContext || !analyserNode) return 0;

  const nyquist = audioContext.sampleRate / 2;
  const binCount = analyserNode.frequencyBinCount;
  return Math.round((frequency / nyquist) * binCount);
}

/**
 * Get simplified bar data for visualization
 * Groups frequency bins into a specified number of bars
 * @param {number} barCount - Number of bars to generate
 * @returns {number[]} Array of bar heights (0-1)
 */
export function getBarData(barCount = 32) {
  const frequency = getFrequencyData();
  if (!frequency.available || frequency.data.length === 0) {
    return new Array(barCount).fill(0);
  }

  const data = frequency.data;
  const binsPerBar = Math.floor(data.length / barCount);
  const bars = [];

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
