/**
 * VoxPage Sticky Footer
 * A persistent footer player that appears at the bottom of the page during playback.
 * Replaces the floating controller with a more stable, accessible design.
 *
 * Feature: 018-ui-redesign
 *
 * @module content/sticky-footer
 */

// Wrap in IIFE to avoid variable name collisions
(function() {
  'use strict';

  // Storage key for footer state (matches background/constants.js)
  const FOOTER_STATE_KEY = 'footerState';

  // Footer dimensions (matches styles/tokens.css)
  const FOOTER_HEIGHT = 64;
  const FOOTER_HEIGHT_MINIMIZED = 48;
  const FOOTER_PILL_WIDTH = 160;
  const FOOTER_MAX_WIDTH = 600;
  const Z_INDEX = 2147483647;

  // Speed options
  const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  /**
   * Create an SVG element from path data
   * @param {string} name - Icon name
   * @returns {SVGElement}
   */
  function createSvgIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const icons = {
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
      }
    };

    if (icons[name]) {
      icons[name]();
    }

    return svg;
  }

  /**
   * Create a button element
   * @param {Object} options - Button options
   * @returns {HTMLButtonElement}
   */
  function createButton(options) {
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
      btn.appendChild(createSvgIcon(options.icon));
    }
    if (options.text) {
      btn.textContent = options.text;
    }
    return btn;
  }

  /**
   * Get CSS styles for the footer
   */
  function getStyles() {
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

  /**
   * StickyFooter manages a sticky footer playback control bar
   */
  class StickyFooter {
    constructor() {
      this.container = null;
      this.shadowRoot = null;
      this.isVisible = false;
      this.isMinimized = false;
      this.position = { x: 'center', yOffset: 0 };
      this.isDragging = false;
      this.dragStartY = 0;
      this.dragStartOffset = 0;

      this.playbackState = {
        status: 'stopped',
        progress: 0,
        currentTime: '0:00',
        totalTime: '0:00',
        currentParagraph: 0,
        totalParagraphs: 0,
        speed: 1.0
      };

      this._originalBodyPadding = null;
      this._resizeObserver = null;
      this._mutationObserver = null;

      // Cached DOM references
      this._footerEl = null;
      this._progressFill = null;
      this._timeDisplays = [];
      this._progressBar = null;
      this._paragraphIndicator = null;
      this._liveRegion = null;
      this._playPauseBtn = null;
      this._speedDropdown = null;

      this._onDragStart = this._onDragStart.bind(this);
      this._onDragMove = this._onDragMove.bind(this);
      this._onDragEnd = this._onDragEnd.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onResize = this._onResize.bind(this);
    }

    /**
     * Build the footer DOM structure using safe DOM methods
     * @returns {DocumentFragment}
     */
    _buildDOM() {
      const { status, progress, currentTime, totalTime, currentParagraph, totalParagraphs, speed } = this.playbackState;
      const isPlaying = status === 'playing';
      const isLoading = status === 'loading';

      const fragment = document.createDocumentFragment();

      // Footer container
      const footer = document.createElement('div');
      footer.className = 'footer';
      if (this.isMinimized) footer.classList.add('minimized');
      if (this.position.x !== 'center') footer.classList.add(this.position.x);
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
        icon: 'skip-back'
      });
      controls.appendChild(prevBtn);

      const playPauseBtn = createButton({
        className: 'btn btn-play-pause',
        ariaLabel: isPlaying ? 'Pause' : 'Play',
        ariaPressed: isPlaying,
        action: 'playPause',
        icon: isPlaying ? 'pause' : 'play'
      });
      this._playPauseBtn = playPauseBtn;
      controls.appendChild(playPauseBtn);

      const nextBtn = createButton({
        className: 'btn btn-sm',
        ariaLabel: 'Next paragraph',
        action: 'next',
        icon: 'skip-forward'
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
        text: `${speed}x`
      });
      speedControl.appendChild(speedBtn);

      const speedDropdown = document.createElement('div');
      speedDropdown.className = 'speed-dropdown';
      speedDropdown.setAttribute('role', 'listbox');
      speedDropdown.setAttribute('aria-label', 'Select playback speed');
      this._speedDropdown = speedDropdown;

      SPEED_OPTIONS.forEach(s => {
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

      const minimizeBtn = createButton({
        className: 'btn btn-sm btn-minimize',
        ariaLabel: this.isMinimized ? 'Expand player' : 'Minimize player',
        action: 'toggleMinimize',
        icon: this.isMinimized ? 'maximize-2' : 'minimize-2'
      });
      actions.appendChild(minimizeBtn);

      const closeBtn = createButton({
        className: 'btn btn-sm',
        ariaLabel: 'Close player',
        action: 'close',
        icon: 'x'
      });
      actions.appendChild(closeBtn);
      footer.appendChild(actions);

      fragment.appendChild(footer);
      return fragment;
    }

    /**
     * Render the footer
     * @private
     */
    _render() {
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

    /**
     * Show the footer
     * @param {Object} initialState - Initial state from storage
     */
    async show(initialState) {
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
    hide() {
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
     * @param {Object} state - New playback state
     */
    updateState(state) {
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
          this._progressBar.setAttribute('aria-valuetext', `${Math.round(this.playbackState.progress)}% complete`);
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
        if (previousParagraph !== this.playbackState.currentParagraph && this.playbackState.totalParagraphs > 0) {
          this._announce(`Paragraph ${this.playbackState.currentParagraph} of ${this.playbackState.totalParagraphs}`);
        }
      }
    }

    /**
     * Adjust body padding (FR-003)
     * @private
     */
    _adjustBodyPadding(show) {
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

    /**
     * Restore state from storage
     * @private
     */
    async _restoreState() {
      try {
        const result = await browser.storage.local.get(FOOTER_STATE_KEY);
        if (result[FOOTER_STATE_KEY]) {
          this.isMinimized = result[FOOTER_STATE_KEY].isMinimized || false;
          this.position = result[FOOTER_STATE_KEY].position || { x: 'center', yOffset: 0 };
        }
      } catch (e) {
        console.warn('VoxPage: Failed to restore footer state:', e);
      }
    }

    /**
     * Save state to storage
     * @private
     */
    async _saveState() {
      try {
        await browser.storage.local.set({
          [FOOTER_STATE_KEY]: {
            isMinimized: this.isMinimized,
            position: this.position
          }
        });
      } catch (e) {
        console.warn('VoxPage: Failed to save footer state:', e);
      }
    }

    /**
     * Send message to background
     * @private
     */
    _sendMessage(type, payload = {}) {
      browser.runtime.sendMessage({
        type: type,
        ...payload
      }).catch(err => {
        console.error('VoxPage: Failed to send message:', err);
      });
    }

    /**
     * Announce message to screen readers
     * @private
     */
    _announce(message) {
      if (this._liveRegion) {
        this._liveRegion.textContent = message;
        setTimeout(() => {
          if (this._liveRegion) {
            this._liveRegion.textContent = '';
          }
        }, 1000);
      }
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
      if (!this.shadowRoot) return;

      const dragHandle = this.shadowRoot.querySelector('.drag-handle');
      if (dragHandle) {
        dragHandle.addEventListener('mousedown', this._onDragStart);
        dragHandle.addEventListener('touchstart', this._onDragStart, { passive: false });
      }

      document.addEventListener('mousemove', this._onDragMove);
      document.addEventListener('mouseup', this._onDragEnd);
      document.addEventListener('touchmove', this._onDragMove, { passive: false });
      document.addEventListener('touchend', this._onDragEnd);

      if (this._footerEl) {
        this._footerEl.addEventListener('keydown', this._onKeyDown);
      }

      this._attachButtonListeners();
    }

    /**
     * Attach button click listeners
     * @private
     */
    _attachButtonListeners() {
      if (!this.shadowRoot) return;

      const buttons = this.shadowRoot.querySelectorAll('[data-action]');
      buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleAction(btn.dataset.action, e);
        });
      });

      if (this._progressBar) {
        this._progressBar.addEventListener('click', (e) => {
          const rect = this._progressBar.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          this._handleAction('seek', { value: Math.max(0, Math.min(100, percent)) });
        });
      }

      const speedOptions = this.shadowRoot.querySelectorAll('.speed-option');
      speedOptions.forEach(option => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const speed = parseFloat(option.dataset.speed);
          this._handleAction('speed', { value: speed });
          this._closeSpeedDropdown();
        });
      });
    }

    /**
     * Remove event listeners
     * @private
     */
    _removeEventListeners() {
      document.removeEventListener('mousemove', this._onDragMove);
      document.removeEventListener('mouseup', this._onDragEnd);
      document.removeEventListener('touchmove', this._onDragMove);
      document.removeEventListener('touchend', this._onDragEnd);
    }

    /**
     * Handle action
     * @private
     */
    _handleAction(action, data = {}) {
      switch (action) {
        case 'playPause':
          const actualAction = this.playbackState.status === 'playing' ? 'pause' : 'play';
          this._sendMessage('FOOTER_ACTION', { action: actualAction });
          break;
        case 'prev':
        case 'next':
        case 'stop':
          this._sendMessage('FOOTER_ACTION', { action: action });
          break;
        case 'seek':
          this._sendMessage('FOOTER_ACTION', { action: 'seek', value: data.value });
          break;
        case 'speed':
          this.playbackState.speed = data.value;
          this._sendMessage('FOOTER_ACTION', { action: 'speed', value: data.value });
          this._render();
          this._announce(`Speed ${data.value}x`);
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
      }
    }

    _toggleSpeedDropdown() {
      if (this._speedDropdown) {
        this._speedDropdown.classList.toggle('open');
      }
    }

    _closeSpeedDropdown() {
      if (this._speedDropdown) {
        this._speedDropdown.classList.remove('open');
      }
    }

    _onDragStart(e) {
      this.isDragging = true;
      this.dragStartY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      this.dragStartOffset = this.position.yOffset;
      e.preventDefault();
    }

    _onDragMove(e) {
      if (!this.isDragging) return;
      const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      const deltaY = this.dragStartY - currentY;
      const maxOffset = window.innerHeight / 3;
      this.position.yOffset = Math.max(0, Math.min(maxOffset, this.dragStartOffset + deltaY));
      if (this._footerEl) {
        this._footerEl.style.bottom = `${this.position.yOffset}px`;
      }
      e.preventDefault();
    }

    _onDragEnd() {
      if (this.isDragging) {
        this.isDragging = false;
        this._sendMessage('FOOTER_POSITION_CHANGED', { position: this.position });
        this._saveState();
      }
    }

    _onKeyDown(e) {
      switch (e.key) {
        case ' ':
        case 'Enter':
          if (e.target.dataset?.action) {
            e.preventDefault();
            this._handleAction(e.target.dataset.action);
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
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { value: Math.max(0, this.playbackState.progress - 5) });
          }
          break;
        case 'ArrowRight':
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { value: Math.min(100, this.playbackState.progress + 5) });
          }
          break;
        case 'ArrowUp':
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { value: Math.min(100, this.playbackState.progress + 10) });
          }
          break;
        case 'ArrowDown':
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { value: Math.max(0, this.playbackState.progress - 10) });
          }
          break;
      }
    }

    _onResize() {
      const maxOffset = window.innerHeight / 3;
      if (this.position.yOffset > maxOffset) {
        this.position.yOffset = maxOffset;
        if (this._footerEl) {
          this._footerEl.style.bottom = `${this.position.yOffset}px`;
        }
      }
    }

    _setupResizeObserver() {
      if (this._resizeObserver) return;
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      window.addEventListener('resize', this._onResize, { passive: true });
      this._resizeObserver.observe(document.documentElement);
    }

    _disconnectResizeObserver() {
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      window.removeEventListener('resize', this._onResize);
    }

    _setupMutationObserver() {
      if (this._mutationObserver || !this.container) return;
      this._mutationObserver = new MutationObserver(() => {
        if (!document.body.contains(this.container)) {
          console.log('VoxPage: Footer was removed from DOM, re-attaching');
          try {
            document.body.appendChild(this.container);
          } catch (e) {
            console.warn('VoxPage: Failed to re-attach footer:', e);
          }
        }
      });
      this._mutationObserver.observe(document.body, { childList: true, subtree: false });
    }

    _disconnectMutationObserver() {
      if (this._mutationObserver) {
        this._mutationObserver.disconnect();
        this._mutationObserver = null;
      }
    }

    isFooterVisible() {
      return this.isVisible;
    }
  }

  // Create singleton instance
  window.VoxPage = window.VoxPage || {};
  try {
    window.VoxPage.stickyFooter = new StickyFooter();
    console.log('VoxPage: sticky-footer.js loaded');
  } catch (e) {
    console.error('VoxPage: Failed to create StickyFooter:', e);
  }
})();
