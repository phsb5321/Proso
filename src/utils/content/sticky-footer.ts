// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Sticky Footer
 * A persistent footer player that appears at the bottom of the page during playback.
 * Replaces the floating controller with a more stable, accessible design.
 *
 * Feature: 018-ui-redesign
 * Migration: 022-plasmo-migration (T034)
 *
 * @module utils/content/sticky-footer
 */

import { z } from 'zod';
import { browser } from 'wxt/browser';

// ============================================================================
// Zod Schemas (SSOT for type definitions)
// ============================================================================

/**
 * Footer position schema
 * x: 'center' | 'left' | 'right' or numeric pixel offset
 * yOffset: vertical offset from bottom in pixels (0 to window.innerHeight / 3)
 */
export const footerPositionSchema = z.object({
  x: z.union([z.literal('center'), z.literal('left'), z.literal('right'), z.number()]),
  yOffset: z.number().min(0),
});

/**
 * Footer state schema (matches shared/config/defaults.js)
 */
export const footerStateSchema = z.object({
  isVisible: z.boolean(),
  isMinimized: z.boolean(),
  position: footerPositionSchema,
  isPlaying: z.boolean().default(false),
  currentIndex: z.number().int().default(0),
  totalParagraphs: z.number().int().default(0),
  progress: z.number().min(0).max(100).default(0),
  speed: z.number().min(0.5).max(2.0).default(1.0),
});

/**
 * Playback status schema
 */
export const playbackStatusSchema = z.enum(['stopped', 'loading', 'playing', 'paused']);

/**
 * Internal playback state schema (used by StickyFooter class)
 */
export const playbackStateSchema = z.object({
  status: playbackStatusSchema,
  progress: z.number().min(0).max(100),
  currentTime: z.string(),
  totalTime: z.string(),
  currentParagraph: z.number().int().nonnegative(),
  totalParagraphs: z.number().int().nonnegative(),
  speed: z.number().min(0.5).max(2.0),
});

/**
 * Button options schema
 */
export const buttonOptionsSchema = z.object({
  className: z.string().optional(),
  ariaLabel: z.string().optional(),
  action: z.string().optional(),
  ariaPressed: z.boolean().optional(),
  icon: z.string().optional(),
  text: z.string().optional(),
});

/**
 * Icon name schema
 */
export const iconNameSchema = z.enum([
  'play',
  'pause',
  'skip-back',
  'skip-forward',
  'minimize-2',
  'maximize-2',
  'x',
  'queue', // T077: Add to queue icon
]);

/**
 * Footer action schema (for message passing)
 */
export const footerActionSchema = z.enum([
  'play',
  'pause',
  'prev',
  'next',
  'seek',
  'speed',
  'stop',
  'close',
  'addToQueue', // T077: Add to queue action
]);

/**
 * Storage state schema (persisted to browser.storage.local)
 */
export const storageStateSchema = z.object({
  isMinimized: z.boolean(),
  position: footerPositionSchema,
});

// ============================================================================
// Type Exports (inferred from Zod schemas)
// ============================================================================

export type FooterPosition = z.infer<typeof footerPositionSchema>;
export type FooterState = z.infer<typeof footerStateSchema>;
export type PlaybackStatus = z.infer<typeof playbackStatusSchema>;
export type PlaybackState = z.infer<typeof playbackStateSchema>;
export type ButtonOptions = z.infer<typeof buttonOptionsSchema>;
export type IconName = z.infer<typeof iconNameSchema>;
export type FooterAction = z.infer<typeof footerActionSchema>;
export type StorageState = z.infer<typeof storageStateSchema>;

// ============================================================================
// Constants
// ============================================================================

// Storage key for footer state
// NOTE: Must match StorageKey.FOOTER_STATE in background/constants.js
const FOOTER_STATE_KEY = 'footerState';

// Footer dimensions (matches styles/tokens.css)
const FOOTER_HEIGHT = 64;
const FOOTER_HEIGHT_MINIMIZED = 48;
const FOOTER_PILL_WIDTH = 160;
const FOOTER_MAX_WIDTH = 600;
const Z_INDEX = 2147483647;

// Speed options
const SPEED_OPTIONS: readonly number[] = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;

// ============================================================================
// SVG Icon Creation
// ============================================================================

/**
 * Create an SVG element from path data
 */
function createSvgIcon(name: IconName): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const icons: Record<IconName, () => void> = {
    play: () => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
      svg.appendChild(polygon);
    },
    pause: () => {
      const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect1.setAttribute('x', '6');
      rect1.setAttribute('y', '4');
      rect1.setAttribute('width', '4');
      rect1.setAttribute('height', '16');
      const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect2.setAttribute('x', '14');
      rect2.setAttribute('y', '4');
      rect2.setAttribute('width', '4');
      rect2.setAttribute('height', '16');
      svg.appendChild(rect1);
      svg.appendChild(rect2);
    },
    'skip-back': () => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '19 20 9 12 19 4 19 20');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '5');
      line.setAttribute('y1', '19');
      line.setAttribute('x2', '5');
      line.setAttribute('y2', '5');
      svg.appendChild(polygon);
      svg.appendChild(line);
    },
    'skip-forward': () => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '5 4 15 12 5 20 5 4');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '19');
      line.setAttribute('y1', '5');
      line.setAttribute('x2', '19');
      line.setAttribute('y2', '19');
      svg.appendChild(polygon);
      svg.appendChild(line);
    },
    'minimize-2': () => {
      const pl1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl1.setAttribute('points', '4 14 10 14 10 20');
      const pl2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl2.setAttribute('points', '20 10 14 10 14 4');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '14');
      l1.setAttribute('y1', '10');
      l1.setAttribute('x2', '21');
      l1.setAttribute('y2', '3');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '3');
      l2.setAttribute('y1', '21');
      l2.setAttribute('x2', '10');
      l2.setAttribute('y2', '14');
      svg.appendChild(pl1);
      svg.appendChild(pl2);
      svg.appendChild(l1);
      svg.appendChild(l2);
    },
    'maximize-2': () => {
      const pl1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl1.setAttribute('points', '15 3 21 3 21 9');
      const pl2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl2.setAttribute('points', '9 21 3 21 3 15');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '21');
      l1.setAttribute('y1', '3');
      l1.setAttribute('x2', '14');
      l1.setAttribute('y2', '10');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '3');
      l2.setAttribute('y1', '21');
      l2.setAttribute('x2', '10');
      l2.setAttribute('y2', '14');
      svg.appendChild(pl1);
      svg.appendChild(pl2);
      svg.appendChild(l1);
      svg.appendChild(l2);
    },
    x: () => {
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '18');
      l1.setAttribute('y1', '6');
      l1.setAttribute('x2', '6');
      l1.setAttribute('y2', '18');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '6');
      l2.setAttribute('y1', '6');
      l2.setAttribute('x2', '18');
      l2.setAttribute('y2', '18');
      svg.appendChild(l1);
      svg.appendChild(l2);
    },
    queue: () => {
      // List icon with plus for "add to queue"
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '8');
      l1.setAttribute('y1', '6');
      l1.setAttribute('x2', '21');
      l1.setAttribute('y2', '6');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '8');
      l2.setAttribute('y1', '12');
      l2.setAttribute('x2', '21');
      l2.setAttribute('y2', '12');
      const l3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l3.setAttribute('x1', '8');
      l3.setAttribute('y1', '18');
      l3.setAttribute('x2', '21');
      l3.setAttribute('y2', '18');
      const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      d1.setAttribute('x1', '3');
      d1.setAttribute('y1', '6');
      d1.setAttribute('x2', '3.01');
      d1.setAttribute('y2', '6');
      const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      d2.setAttribute('x1', '3');
      d2.setAttribute('y1', '12');
      d2.setAttribute('x2', '3.01');
      d2.setAttribute('y2', '12');
      const d3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      d3.setAttribute('x1', '3');
      d3.setAttribute('y1', '18');
      d3.setAttribute('x2', '3.01');
      d3.setAttribute('y2', '18');
      svg.appendChild(l1);
      svg.appendChild(l2);
      svg.appendChild(l3);
      svg.appendChild(d1);
      svg.appendChild(d2);
      svg.appendChild(d3);
    },
  };

  icons[name]();
  return svg;
}

// ============================================================================
// Button Creation
// ============================================================================

/**
 * Create a button element with proper ARIA attributes
 */
function createButton(options: ButtonOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = options.className || 'btn';
  btn.setAttribute('aria-label', options.ariaLabel || '');
  btn.setAttribute('tabindex', '0');

  if (options.action) {
    btn.dataset.action = options.action;
  }

  if (options.ariaPressed !== undefined) {
    btn.setAttribute('aria-pressed', String(options.ariaPressed));
  }

  if (options.icon) {
    btn.appendChild(createSvgIcon(options.icon as IconName));
  }

  if (options.text) {
    btn.textContent = options.text;
  }

  return btn;
}

// ============================================================================
// CSS Styles
// ============================================================================

/**
 * Get CSS styles for the footer
 */
function getStyles(): string {
  return `
    :host {
      all: initial;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --footer-bg: #1a1a2e;
      --footer-bg-secondary: #16213e;
      --footer-accent: #0D9488;
      --footer-accent-hover: #14B8A6;
      --footer-text: #ffffff;
      --footer-text-muted: #b8c5d6;
      --footer-border: rgba(255, 255, 255, 0.1);
      --footer-focus-ring: rgba(13, 148, 136, 0.5);
      --footer-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
      --footer-height: ${FOOTER_HEIGHT}px;
      --footer-height-minimized: ${FOOTER_HEIGHT_MINIMIZED}px;
      --footer-pill-width: ${FOOTER_PILL_WIDTH}px;
      --footer-max-width: ${FOOTER_MAX_WIDTH}px;
      --footer-z-index: ${Z_INDEX};
      --footer-button-size: 40px;
      --footer-button-size-sm: 32px;
      --min-touch-target: 44px;
    }
    @media (prefers-color-scheme: light) {
      :host {
        --footer-bg: #ffffff;
        --footer-bg-secondary: #f8fafc;
        --footer-accent: #0F766E;
        --footer-accent-hover: #0D9488;
        --footer-text: #1e293b;
        --footer-text-muted: #475569;
        --footer-border: rgba(0, 0, 0, 0.1);
        --footer-focus-ring: rgba(15, 118, 110, 0.3);
        --footer-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
    }
    .footer {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--footer-z-index);
      width: 100%;
      max-width: var(--footer-max-width);
      height: var(--footer-height);
      background: var(--footer-bg);
      border-top: 1px solid var(--footer-border);
      border-left: 1px solid var(--footer-border);
      border-right: 1px solid var(--footer-border);
      border-radius: 12px 12px 0 0;
      box-shadow: var(--footer-shadow);
      color: var(--footer-text);
      padding: 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: height 200ms ease-out, width 200ms ease-out, border-radius 200ms ease-out;
    }
    .footer.minimized {
      width: var(--footer-pill-width);
      height: var(--footer-height-minimized);
      border-radius: 24px 24px 0 0;
      padding: 4px 12px;
    }
    .footer.left { left: 16px; transform: translateX(0); }
    .footer.right { left: auto; right: 16px; transform: translateX(0); }
    .drag-handle {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 4px;
      background: var(--footer-border);
      border-radius: 2px;
      cursor: grab;
      margin-top: 4px;
    }
    .drag-handle:active { cursor: grabbing; }
    .btn {
      min-width: var(--min-touch-target);
      min-height: var(--min-touch-target);
      width: var(--footer-button-size);
      height: var(--footer-button-size);
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--footer-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background-color 150ms ease, transform 100ms ease;
    }
    .btn:hover { background: rgba(255, 255, 255, 0.1); }
    .btn:active { transform: scale(0.95); }
    .btn:focus-visible { outline: 2px solid var(--footer-accent); outline-offset: 2px; box-shadow: 0 0 0 4px var(--footer-focus-ring); }
    .btn:focus:not(:focus-visible) { outline: none; }
    .btn svg { width: 20px; height: 20px; stroke: currentColor; stroke-width: 2; fill: none; }
    .btn-play-pause { width: 48px; height: 48px; background: var(--footer-accent); color: white; }
    .btn-play-pause:hover { background: var(--footer-accent-hover); }
    .btn-play-pause svg { width: 24px; height: 24px; }
    .btn-sm { width: var(--footer-button-size-sm); height: var(--footer-button-size-sm); }
    .btn-sm svg { width: 16px; height: 16px; }
    .controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .progress-section { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
    .progress-bar { flex: 1; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; cursor: pointer; overflow: hidden; min-width: 60px; }
    .progress-fill { height: 100%; background: var(--footer-accent); border-radius: 3px; transition: width 100ms linear; width: 0%; }
    .time-display { font-size: 12px; color: var(--footer-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .speed-control { position: relative; }
    .speed-btn { font-size: 12px; font-weight: 500; padding: 4px 8px; border-radius: 4px; min-width: 48px; }
    .speed-dropdown { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: var(--footer-bg); border: 1px solid var(--footer-border); border-radius: 8px; box-shadow: var(--footer-shadow); padding: 4px; display: none; min-width: 60px; margin-bottom: 4px; }
    .speed-dropdown.open { display: block; }
    .speed-option { display: block; width: 100%; padding: 8px 12px; border: none; background: transparent; color: var(--footer-text); font-size: 12px; text-align: center; cursor: pointer; border-radius: 4px; }
    .speed-option:hover { background: rgba(255, 255, 255, 0.1); }
    .speed-option.active { background: var(--footer-accent); color: white; }
    .footer.minimized .progress-section,
    .footer.minimized .controls .btn:not(.btn-play-pause),
    .footer.minimized .speed-control,
    .footer.minimized .btn-minimize { display: none; }
    .footer.minimized .controls { justify-content: center; flex: 1; }
    .actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .paragraph-indicator { font-size: 11px; color: var(--footer-text-muted); white-space: nowrap; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .live-region { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .loading .btn-play-pause svg { animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
}

// ============================================================================
// StickyFooter Class
// ============================================================================

/**
 * StickyFooter manages a sticky footer playback control bar
 */
export class StickyFooter {
  private container: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private isVisible = false;
  private isMinimized = false;
  private position: FooterPosition = { x: 'center', yOffset: 0 };
  private isDragging = false;
  private dragStartY = 0;
  private dragStartOffset = 0;

  private playbackState: PlaybackState = {
    status: 'stopped',
    progress: 0,
    currentTime: '0:00',
    totalTime: '0:00',
    currentParagraph: 0,
    totalParagraphs: 0,
    speed: 1.0,
  };

  private _originalBodyPadding: string | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _mutationObserver: MutationObserver | null = null;

  // Cached DOM references
  private _footerEl: HTMLDivElement | null = null;
  private _progressFill: HTMLDivElement | null = null;
  private _timeDisplays: HTMLSpanElement[] = [];
  private _progressBar: HTMLDivElement | null = null;
  private _paragraphIndicator: HTMLSpanElement | null = null;
  private _liveRegion: HTMLDivElement | null = null;
  private _playPauseBtn: HTMLButtonElement | null = null;
  private _speedDropdown: HTMLDivElement | null = null;

  // Bound event handlers
  private readonly _onDragStart: (e: MouseEvent | TouchEvent) => void;
  private readonly _onDragMove: (e: MouseEvent | TouchEvent) => void;
  private readonly _onDragEnd: () => void;
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onResize: () => void;

  constructor() {
    this._onDragStart = this._handleDragStart.bind(this);
    this._onDragMove = this._handleDragMove.bind(this);
    this._onDragEnd = this._handleDragEnd.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onResize = this._handleResize.bind(this);
  }

  // ==========================================================================
  // DOM Building
  // ==========================================================================

  /**
   * Build the footer DOM structure using safe DOM methods
   */
  private _buildDOM(): DocumentFragment {
    const { status, progress, currentTime, totalTime, currentParagraph, totalParagraphs, speed } =
      this.playbackState;
    const isPlaying = status === 'playing';
    const isLoading = status === 'loading';

    const fragment = document.createDocumentFragment();

    // Footer container
    const footer = document.createElement('div');
    footer.className = 'footer';
    if (this.isMinimized) footer.classList.add('minimized');
    if (this.position.x !== 'center') footer.classList.add(String(this.position.x));
    if (isLoading) footer.classList.add('loading');
    footer.setAttribute('role', 'toolbar');
    footer.setAttribute('aria-label', 'VoxPage playback controls');
    footer.setAttribute('tabindex', '0');
    this._footerEl = footer;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    footer.appendChild(dragHandle);

    // Live region
    const liveRegion = document.createElement('div');
    liveRegion.className = 'live-region';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion = liveRegion;
    footer.appendChild(liveRegion);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';

    const prevBtn = createButton({
      className: 'btn btn-sm',
      ariaLabel: 'Previous paragraph',
      action: 'prev',
      icon: 'skip-back',
    });
    controls.appendChild(prevBtn);

    const playPauseBtn = createButton({
      className: 'btn btn-play-pause',
      ariaLabel: isPlaying ? 'Pause' : 'Play',
      ariaPressed: isPlaying,
      action: 'playPause',
      icon: isPlaying ? 'pause' : 'play',
    });
    this._playPauseBtn = playPauseBtn;
    controls.appendChild(playPauseBtn);

    const nextBtn = createButton({
      className: 'btn btn-sm',
      ariaLabel: 'Next paragraph',
      action: 'next',
      icon: 'skip-forward',
    });
    controls.appendChild(nextBtn);

    footer.appendChild(controls);

    // Progress section
    const progressSection = document.createElement('div');
    progressSection.className = 'progress-section';

    const currentTimeEl = document.createElement('span');
    currentTimeEl.className = 'time-display';
    currentTimeEl.textContent = currentTime;
    progressSection.appendChild(currentTimeEl);

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.setAttribute('role', 'slider');
    progressBar.setAttribute('aria-label', 'Playback progress');
    progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.setAttribute('aria-valuetext', `${Math.round(progress)}% complete`);
    progressBar.setAttribute('tabindex', '0');
    progressBar.dataset.action = 'seek';
    this._progressBar = progressBar;

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${progress}%`;
    this._progressFill = progressFill;
    progressBar.appendChild(progressFill);
    progressSection.appendChild(progressBar);

    const totalTimeEl = document.createElement('span');
    totalTimeEl.className = 'time-display';
    totalTimeEl.textContent = totalTime;
    progressSection.appendChild(totalTimeEl);

    this._timeDisplays = [currentTimeEl, totalTimeEl];
    footer.appendChild(progressSection);

    // Speed control
    const speedControl = document.createElement('div');
    speedControl.className = 'speed-control';

    const speedBtn = createButton({
      className: 'btn speed-btn',
      ariaLabel: `Playback speed ${speed}x`,
      action: 'toggleSpeed',
      text: `${speed}x`,
    });
    speedControl.appendChild(speedBtn);

    const speedDropdown = document.createElement('div');
    speedDropdown.className = 'speed-dropdown';
    speedDropdown.setAttribute('role', 'listbox');
    speedDropdown.setAttribute('aria-label', 'Select playback speed');
    this._speedDropdown = speedDropdown;

    SPEED_OPTIONS.forEach((s) => {
      const option = document.createElement('button');
      option.className = 'speed-option';
      if (s === speed) option.classList.add('active');
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(s === speed));
      option.setAttribute('tabindex', '0');
      option.dataset.speed = String(s);
      option.textContent = `${s}x`;
      speedDropdown.appendChild(option);
    });
    speedControl.appendChild(speedDropdown);
    footer.appendChild(speedControl);

    // Paragraph indicator
    const indicator = document.createElement('span');
    indicator.className = 'paragraph-indicator';
    indicator.setAttribute('aria-label', 'Current position');
    if (totalParagraphs > 0) {
      indicator.textContent = `${currentParagraph}/${totalParagraphs}`;
    }
    this._paragraphIndicator = indicator;
    footer.appendChild(indicator);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';

    // T077: Add to Queue button
    const queueBtn = createButton({
      className: 'btn btn-sm btn-queue',
      ariaLabel: 'Add to reading queue',
      action: 'addToQueue',
      icon: 'queue',
    });
    actions.appendChild(queueBtn);

    const minimizeBtn = createButton({
      className: 'btn btn-sm btn-minimize',
      ariaLabel: this.isMinimized ? 'Expand player' : 'Minimize player',
      action: 'toggleMinimize',
      icon: this.isMinimized ? 'maximize-2' : 'minimize-2',
    });
    actions.appendChild(minimizeBtn);

    const closeBtn = createButton({
      className: 'btn btn-sm',
      ariaLabel: 'Close player',
      action: 'close',
      icon: 'x',
    });
    actions.appendChild(closeBtn);
    footer.appendChild(actions);

    fragment.appendChild(footer);
    return fragment;
  }

  /**
   * Render the footer (full re-render)
   */
  private _render(): void {
    if (!this.shadowRoot) return;

    // Clear shadow root
    while (this.shadowRoot.firstChild) {
      this.shadowRoot.removeChild(this.shadowRoot.firstChild);
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = getStyles();
    this.shadowRoot.appendChild(style);

    // Add DOM
    this.shadowRoot.appendChild(this._buildDOM());

    // Setup listeners
    this._attachButtonListeners();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Show the footer
   */
  async show(initialState?: Partial<StorageState>): Promise<void> {
    if (this.container) return;

    if (initialState) {
      this.isMinimized = initialState.isMinimized || false;
      this.position = initialState.position || { x: 'center', yOffset: 0 };
    } else {
      await this._restoreState();
    }

    this.container = document.createElement('div');
    this.container.id = 'voxpage-sticky-footer';
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

    this._render();
    document.body.appendChild(this.container);
    this._adjustBodyPadding(true);
    this._setupEventListeners();
    this._setupResizeObserver();
    this._setupMutationObserver();

    this.isVisible = true;

    if (this._footerEl) {
      this._footerEl.focus();
    }

    console.log('VoxPage: Sticky footer shown');
  }

  /**
   * Hide the footer
   */
  hide(): void {
    if (!this.container) return;

    this._removeEventListeners();
    this._disconnectResizeObserver();
    this._disconnectMutationObserver();
    this._adjustBodyPadding(false);

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.shadowRoot = null;
    this.isVisible = false;
    this._footerEl = null;
    this._progressFill = null;
    this._timeDisplays = [];
    this._progressBar = null;
    this._paragraphIndicator = null;
    this._liveRegion = null;
    this._playPauseBtn = null;
    this._speedDropdown = null;

    console.log('VoxPage: Sticky footer hidden');
  }

  /**
   * Update playback state
   */
  updateState(state: Partial<PlaybackState>): void {
    const previousStatus = this.playbackState.status;
    const previousParagraph = this.playbackState.currentParagraph;

    Object.assign(this.playbackState, state);

    if (this.shadowRoot) {
      // Update progress bar
      if (this._progressFill) {
        this._progressFill.style.width = `${this.playbackState.progress}%`;
      }

      // Update time displays
      if (this._timeDisplays.length >= 2) {
        this._timeDisplays[0].textContent = this.playbackState.currentTime;
        this._timeDisplays[1].textContent = this.playbackState.totalTime;
      }

      // Update progress bar ARIA
      if (this._progressBar) {
        this._progressBar.setAttribute('aria-valuenow', String(Math.round(this.playbackState.progress)));
        this._progressBar.setAttribute(
          'aria-valuetext',
          `${Math.round(this.playbackState.progress)}% complete`,
        );
      }

      // Update paragraph indicator
      if (this._paragraphIndicator && this.playbackState.totalParagraphs > 0) {
        this._paragraphIndicator.textContent = `${this.playbackState.currentParagraph}/${this.playbackState.totalParagraphs}`;
      }

      // Update play/pause button if status changed
      if (previousStatus !== this.playbackState.status) {
        this._render();
        this._announce(this.playbackState.status === 'playing' ? 'Playing' : 'Paused');
      }

      // Announce paragraph change
      if (
        previousParagraph !== this.playbackState.currentParagraph &&
        this.playbackState.totalParagraphs > 0
      ) {
        this._announce(
          `Paragraph ${this.playbackState.currentParagraph} of ${this.playbackState.totalParagraphs}`,
        );
      }
    }
  }

  /**
   * Check if footer is visible
   */
  isFooterVisible(): boolean {
    return this.isVisible;
  }

  // ==========================================================================
  // Body Padding Adjustment (FR-003)
  // ==========================================================================

  /**
   * Adjust body padding when footer is shown/hidden
   */
  private _adjustBodyPadding(show: boolean): void {
    if (show) {
      this._originalBodyPadding = document.body.style.paddingBottom || '';
      const computedPadding = parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0;
      const footerHeight = this.isMinimized ? FOOTER_HEIGHT_MINIMIZED : FOOTER_HEIGHT;
      document.body.style.paddingBottom = `${computedPadding + footerHeight + 16}px`;
    } else {
      document.body.style.paddingBottom = this._originalBodyPadding || '';
      this._originalBodyPadding = null;
    }
  }

  // ==========================================================================
  // State Persistence
  // ==========================================================================

  /**
   * Restore state from browser.storage.local
   */
  private async _restoreState(): Promise<void> {
    try {
      const result = await browser.storage.local.get(FOOTER_STATE_KEY);
      if (result[FOOTER_STATE_KEY]) {
        const parsed = storageStateSchema.safeParse(result[FOOTER_STATE_KEY]);
        if (parsed.success) {
          this.isMinimized = parsed.data.isMinimized;
          this.position = parsed.data.position;
        } else {
          console.warn('VoxPage: Invalid footer state schema:', parsed.error);
        }
      }
    } catch (e) {
      console.warn('VoxPage: Failed to restore footer state:', e);
    }
  }

  /**
   * Save state to browser.storage.local
   */
  private async _saveState(): Promise<void> {
    try {
      const state: StorageState = {
        isMinimized: this.isMinimized,
        position: this.position,
      };
      await browser.storage.local.set({
        [FOOTER_STATE_KEY]: state,
      });
    } catch (e) {
      console.warn('VoxPage: Failed to save footer state:', e);
    }
  }

  // ==========================================================================
  // Message Passing
  // ==========================================================================

  /**
   * Send message to background script
   */
  private _sendMessage(type: string, payload: Record<string, unknown> = {}): void {
    browser.runtime
      .sendMessage({
        type,
        ...payload,
      })
      .catch((err) => {
        console.error('VoxPage: Failed to send message:', err);
      });
  }

  /**
   * Announce message to screen readers via live region
   */
  private _announce(message: string): void {
    if (this._liveRegion) {
      this._liveRegion.textContent = message;
      setTimeout(() => {
        if (this._liveRegion) {
          this._liveRegion.textContent = '';
        }
      }, 1000);
    }
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  /**
   * Setup event listeners
   */
  private _setupEventListeners(): void {
    if (!this.shadowRoot) return;

    const dragHandle = this.shadowRoot.querySelector('.drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', this._onDragStart as EventListener);
      dragHandle.addEventListener('touchstart', this._onDragStart as EventListener, {
        passive: false,
      });
    }

    document.addEventListener('mousemove', this._onDragMove as EventListener);
    document.addEventListener('mouseup', this._onDragEnd);
    document.addEventListener('touchmove', this._onDragMove as EventListener, { passive: false });
    document.addEventListener('touchend', this._onDragEnd);

    if (this._footerEl) {
      this._footerEl.addEventListener('keydown', this._onKeyDown);
    }

    this._attachButtonListeners();
  }

  /**
   * Attach button click listeners
   */
  private _attachButtonListeners(): void {
    if (!this.shadowRoot) return;

    const buttons = this.shadowRoot.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.action;
        if (action) {
          this._handleAction(action, e);
        }
      });
    });

    if (this._progressBar) {
      this._progressBar.addEventListener('click', (e: MouseEvent) => {
        const rect = this._progressBar!.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        this._handleAction('seek', { value: Math.max(0, Math.min(100, percent)) });
      });
    }

    const speedOptions = this.shadowRoot.querySelectorAll('.speed-option');
    speedOptions.forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const speed = parseFloat((option as HTMLElement).dataset.speed || '1.0');
        this._handleAction('speed', { value: speed });
        this._closeSpeedDropdown();
      });
    });
  }

  /**
   * Remove event listeners
   */
  private _removeEventListeners(): void {
    document.removeEventListener('mousemove', this._onDragMove as EventListener);
    document.removeEventListener('mouseup', this._onDragEnd);
    document.removeEventListener('touchmove', this._onDragMove as EventListener);
    document.removeEventListener('touchend', this._onDragEnd);
  }

  // ==========================================================================
  // Action Handlers
  // ==========================================================================

  /**
   * Handle action from button or keyboard
   */
  private _handleAction(action: string, data: Event | { value?: number } = {}): void {
    switch (action) {
      case 'playPause':
        {
          const actualAction = this.playbackState.status === 'playing' ? 'pause' : 'play';
          this._sendMessage('FOOTER_ACTION', { action: actualAction });
        }
        break;
      case 'prev':
      case 'next':
      case 'stop':
        this._sendMessage('FOOTER_ACTION', { action });
        break;
      case 'seek':
        if ('value' in data) {
          this._sendMessage('FOOTER_ACTION', { action: 'seek', value: data.value });
        }
        break;
      case 'speed':
        if ('value' in data && typeof data.value === 'number') {
          this.playbackState.speed = data.value;
          this._sendMessage('FOOTER_ACTION', { action: 'speed', value: data.value });
          this._render();
          this._announce(`Speed ${data.value}x`);
        }
        break;
      case 'toggleSpeed':
        this._toggleSpeedDropdown();
        break;
      case 'toggleMinimize':
        this.isMinimized = !this.isMinimized;
        this._render();
        this._adjustBodyPadding(true);
        this._sendMessage('FOOTER_VISIBILITY_CHANGED', { isMinimized: this.isMinimized });
        this._saveState();
        this._announce(this.isMinimized ? 'Player minimized' : 'Player expanded');
        break;
      case 'close':
        this._sendMessage('FOOTER_ACTION', { action: 'close' });
        break;
      case 'addToQueue':
        // T077: Send add to queue action to background
        this._sendMessage('FOOTER_ACTION', { action: 'addToQueue' });
        this._announce('Added to queue');
        break;
    }
  }

  /**
   * Toggle speed dropdown
   */
  private _toggleSpeedDropdown(): void {
    if (this._speedDropdown) {
      this._speedDropdown.classList.toggle('open');
    }
  }

  /**
   * Close speed dropdown
   */
  private _closeSpeedDropdown(): void {
    if (this._speedDropdown) {
      this._speedDropdown.classList.remove('open');
    }
  }

  // ==========================================================================
  // Drag Handlers
  // ==========================================================================

  /**
   * Handle drag start
   */
  private _handleDragStart(e: MouseEvent | TouchEvent): void {
    this.isDragging = true;
    this.dragStartY = e.type.includes('touch')
      ? (e as TouchEvent).touches[0].clientY
      : (e as MouseEvent).clientY;
    this.dragStartOffset = this.position.yOffset;
    e.preventDefault();
  }

  /**
   * Handle drag move
   */
  private _handleDragMove(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    const currentY = e.type.includes('touch')
      ? (e as TouchEvent).touches[0].clientY
      : (e as MouseEvent).clientY;
    const deltaY = this.dragStartY - currentY;
    const maxOffset = window.innerHeight / 3;
    this.position.yOffset = Math.max(0, Math.min(maxOffset, this.dragStartOffset + deltaY));
    if (this._footerEl) {
      this._footerEl.style.bottom = `${this.position.yOffset}px`;
    }
    e.preventDefault();
  }

  /**
   * Handle drag end
   */
  private _handleDragEnd(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this._sendMessage('FOOTER_POSITION_CHANGED', { position: this.position });
      this._saveState();
    }
  }

  /**
   * Handle keyboard events
   */
  private _handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case ' ':
      case 'Enter':
        if ((e.target as HTMLElement)?.dataset?.action) {
          e.preventDefault();
          this._handleAction((e.target as HTMLElement).dataset.action!);
        } else {
          e.preventDefault();
          this._handleAction('playPause');
        }
        break;
      case 'Escape':
        e.preventDefault();
        this._closeSpeedDropdown();
        break;
      case 'ArrowLeft':
        if ((e.target as HTMLElement)?.classList?.contains('progress-bar')) {
          e.preventDefault();
          this._handleAction('seek', { value: Math.max(0, this.playbackState.progress - 5) });
        }
        break;
      case 'ArrowRight':
        if ((e.target as HTMLElement)?.classList?.contains('progress-bar')) {
          e.preventDefault();
          this._handleAction('seek', { value: Math.min(100, this.playbackState.progress + 5) });
        }
        break;
      case 'ArrowUp':
        if ((e.target as HTMLElement)?.classList?.contains('progress-bar')) {
          e.preventDefault();
          this._handleAction('seek', { value: Math.min(100, this.playbackState.progress + 10) });
        }
        break;
      case 'ArrowDown':
        if ((e.target as HTMLElement)?.classList?.contains('progress-bar')) {
          e.preventDefault();
          this._handleAction('seek', { value: Math.max(0, this.playbackState.progress - 10) });
        }
        break;
    }
  }

  /**
   * Handle window resize
   */
  private _handleResize(): void {
    const maxOffset = window.innerHeight / 3;
    if (this.position.yOffset > maxOffset) {
      this.position.yOffset = maxOffset;
      if (this._footerEl) {
        this._footerEl.style.bottom = `${this.position.yOffset}px`;
      }
    }
  }

  // ==========================================================================
  // Observers
  // ==========================================================================

  /**
   * Setup resize observer
   */
  private _setupResizeObserver(): void {
    if (this._resizeObserver) return;
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    window.addEventListener('resize', this._onResize, { passive: true });
    this._resizeObserver.observe(document.documentElement);
  }

  /**
   * Disconnect resize observer
   */
  private _disconnectResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    window.removeEventListener('resize', this._onResize);
  }

  /**
   * Setup mutation observer (re-attach footer if removed from DOM)
   */
  private _setupMutationObserver(): void {
    if (this._mutationObserver || !this.container) return;
    this._mutationObserver = new MutationObserver(() => {
      if (!document.body.contains(this.container!)) {
        console.log('VoxPage: Footer was removed from DOM, re-attaching');
        try {
          document.body.appendChild(this.container!);
        } catch (e) {
          console.warn('VoxPage: Failed to re-attach footer:', e);
        }
      }
    });
    this._mutationObserver.observe(document.body, { childList: true, subtree: false });
  }

  /**
   * Disconnect mutation observer
   */
  private _disconnectMutationObserver(): void {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of StickyFooter
 */
export const stickyFooter = new StickyFooter();
