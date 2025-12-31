/**
 * VoxPage Visualizer Component
 * Renders audio visualization on a Canvas element
 */

// Canvas and context
let canvas = null;
let ctx = null;

// Animation state
let animationId = null;
let isAnimating = false;

// Visualizer state
let visualizerState = 'idle'; // 'idle', 'playing', 'paused'
let lastData = null;

// Configuration
const CONFIG = {
  barCount: 32,
  barGap: 2,
  barMinHeight: 2,
  barRadius: 2,
  idleWaveAmplitude: 3,
  idleWaveSpeed: 0.02,
  fadeSpeed: 0.1,
  smoothingFactor: 0.3
};

// Color getters (will read from CSS variables)
let barColor = null;
let barColorPlaying = null;
let bgColor = null;

// Smoothed bar heights for animation
let smoothedHeights = null;

// Idle animation phase
let idlePhase = 0;

/**
 * Initialize the visualizer component
 * @param {HTMLCanvasElement} canvasElement - The canvas element to use
 * @returns {boolean} Whether initialization was successful
 */
export function initVisualizer(canvasElement) {
  if (!canvasElement) {
    console.error('No canvas element provided for visualizer');
    return false;
  }

  canvas = canvasElement;
  ctx = canvas.getContext('2d');

  // Set canvas size
  resizeCanvas();

  // Initialize smoothed heights
  smoothedHeights = new Array(CONFIG.barCount).fill(0);

  // Read colors from CSS variables
  updateColors();

  // Listen for resize
  window.addEventListener('resize', resizeCanvas);

  // Start idle animation
  setState('idle');

  return true;
}

/**
 * Resize canvas to match display size
 */
function resizeCanvas() {
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.scale(dpr, dpr);
}

/**
 * Update colors from CSS variables
 */
function updateColors() {
  const styles = getComputedStyle(document.documentElement);
  barColor = styles.getPropertyValue('--color-text-tertiary').trim() || '#6b7280';
  barColorPlaying = styles.getPropertyValue('--color-accent-primary').trim() || '#0D9488';
  bgColor = styles.getPropertyValue('--color-bg-secondary').trim() || '#252547';
}

/**
 * Set the visualizer state
 * @param {string} newState - 'idle', 'playing', or 'paused'
 */
export function setState(newState) {
  visualizerState = newState;

  if (newState === 'playing' || newState === 'idle') {
    startAnimation();
  } else if (newState === 'paused') {
    // Keep rendering but with static display
    startAnimation();
  }
}

/**
 * Start the animation loop
 */
function startAnimation() {
  if (isAnimating) return;

  isAnimating = true;
  animate();
}

/**
 * Stop the animation loop
 */
export function stopAnimation() {
  isAnimating = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

/**
 * Main animation loop
 */
function animate() {
  if (!isAnimating || !ctx || !canvas) {
    return;
  }

  // Clear canvas
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Draw based on state
  switch (visualizerState) {
    case 'playing':
      drawBars(lastData);
      break;
    case 'paused':
      drawBars(lastData, true);
      break;
    case 'idle':
    default:
      drawIdleWave();
      break;
  }

  animationId = requestAnimationFrame(animate);
}

/**
 * Draw frequency bars
 * @param {number[]|null} data - Frequency data (0-1 values) or null
 * @param {boolean} isPaused - Whether to use muted colors
 */
function drawBars(data, isPaused = false) {
  if (!ctx || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const barWidth = (width - (CONFIG.barCount - 1) * CONFIG.barGap) / CONFIG.barCount;
  const maxBarHeight = height - 4;

  // Update colors in case theme changed
  updateColors();

  // Generate fake data if none provided
  const displayData = data && data.length > 0 ? data : generateFakeData();

  // Draw each bar
  for (let i = 0; i < CONFIG.barCount; i++) {
    const value = displayData[i] || 0;

    // Smooth the height
    const targetHeight = Math.max(CONFIG.barMinHeight, value * maxBarHeight);
    smoothedHeights[i] = smoothedHeights[i] + (targetHeight - smoothedHeights[i]) * CONFIG.smoothingFactor;

    const barHeight = smoothedHeights[i];
    const x = i * (barWidth + CONFIG.barGap);
    const y = (height - barHeight) / 2;

    // Set color
    ctx.fillStyle = isPaused ? barColor : barColorPlaying;

    // Draw rounded rectangle
    drawRoundedRect(x, y, barWidth, barHeight, CONFIG.barRadius);
  }
}

/**
 * Draw idle wave animation
 */
function drawIdleWave() {
  if (!ctx || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const barWidth = (width - (CONFIG.barCount - 1) * CONFIG.barGap) / CONFIG.barCount;
  const centerY = height / 2;

  // Update idle phase
  idlePhase += CONFIG.idleWaveSpeed;

  // Update colors in case theme changed
  updateColors();

  // Draw each bar as a subtle wave
  for (let i = 0; i < CONFIG.barCount; i++) {
    const wave = Math.sin(idlePhase + i * 0.3) * CONFIG.idleWaveAmplitude;
    const barHeight = CONFIG.barMinHeight + Math.abs(wave);

    const x = i * (barWidth + CONFIG.barGap);
    const y = centerY - barHeight / 2;

    // Smooth transition from previous heights
    const targetHeight = barHeight;
    smoothedHeights[i] = smoothedHeights[i] + (targetHeight - smoothedHeights[i]) * 0.1;

    ctx.fillStyle = barColor;
    drawRoundedRect(x, y, barWidth, smoothedHeights[i], CONFIG.barRadius);
  }
}

/**
 * Draw a rounded rectangle
 */
function drawRoundedRect(x, y, width, height, radius) {
  if (!ctx) return;

  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Generate fake frequency data for display when real data unavailable
 * @returns {number[]}
 */
function generateFakeData() {
  const data = [];
  const time = Date.now() / 1000;

  for (let i = 0; i < CONFIG.barCount; i++) {
    // Create a bouncy wave effect
    const wave1 = Math.sin(time * 2 + i * 0.2) * 0.3;
    const wave2 = Math.sin(time * 3.5 + i * 0.4) * 0.2;
    const wave3 = Math.cos(time * 1.5 + i * 0.1) * 0.15;

    // Base height with waves
    const value = 0.3 + wave1 + wave2 + wave3;

    // Clamp between 0 and 1
    data.push(Math.max(0.1, Math.min(1, value)));
  }

  return data;
}

/**
 * Update visualizer with new audio data
 * @param {Object} data - Visualizer data from background
 */
export function updateData(data) {
  if (!data) return;

  if (data.available && data.frequency && data.frequency.data) {
    // Resample frequency data to match bar count
    lastData = resampleData(data.frequency.data, CONFIG.barCount);
  }
}

/**
 * Resample frequency data to target bar count
 * @param {number[]} data - Original frequency data
 * @param {number} targetCount - Target number of bars
 * @returns {number[]}
 */
function resampleData(data, targetCount) {
  if (!data || data.length === 0) return new Array(targetCount).fill(0);

  const result = [];
  const binSize = data.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);

    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
    }

    result.push(sum / (end - start));
  }

  return result;
}

/**
 * Check if visualizer is initialized
 * @returns {boolean}
 */
export function isInitialized() {
  return !!(canvas && ctx);
}

/**
 * Clean up visualizer resources
 */
export function destroyVisualizer() {
  stopAnimation();

  window.removeEventListener('resize', resizeCanvas);

  canvas = null;
  ctx = null;
  smoothedHeights = null;
  lastData = null;
}

/**
 * Check if reduced motion is preferred
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Handle reduced motion preference
 * When reduced motion is preferred, show static bars instead of animation
 */
export function handleReducedMotion() {
  if (prefersReducedMotion()) {
    // Show static visualization
    stopAnimation();
    if (ctx && canvas) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw static bars at minimal height
      const width = rect.width;
      const height = rect.height;
      const barWidth = (width - (CONFIG.barCount - 1) * CONFIG.barGap) / CONFIG.barCount;

      updateColors();
      ctx.fillStyle = barColor;

      for (let i = 0; i < CONFIG.barCount; i++) {
        const x = i * (barWidth + CONFIG.barGap);
        const y = (height - CONFIG.barMinHeight) / 2;
        drawRoundedRect(x, y, barWidth, CONFIG.barMinHeight, CONFIG.barRadius);
      }
    }
  } else {
    // Resume normal animation
    if (!isAnimating) {
      startAnimation();
    }
  }
}
