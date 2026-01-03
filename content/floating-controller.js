/**
 * @deprecated 020-code-quality-fix
 *
 * Floating Controller is deprecated as of version 1.1.0.
 * Use sticky-footer.js instead.
 *
 * This file is kept for backwards compatibility but is no longer
 * actively called. It will be removed in a future version.
 *
 * DO NOT add new features to this file.
 *
 * @module content/floating-controller
 * @see content/sticky-footer.js
 */

/**
 * VoxPage Floating Controller (DEPRECATED)
 * A persistent floating playback controller injected into web pages
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  // Storage key for position (matches background/constants.js)
  const FLOATING_CONTROLLER_POSITION_KEY = 'floatingControllerPosition';

  // Default position for the controller
  const DEFAULT_POSITION = { x: 20, y: 20 };

  // Controller dimensions
  const CONTROLLER_WIDTH = 280;
  const CONTROLLER_HEIGHT = 64;
  const EDGE_MARGIN = 16;

  // Z-index for maximum visibility
  const Z_INDEX = 2147483647;

  /**
   * FloatingController manages a floating playback control widget
   * that persists on the page independently of the extension popup.
   */
  class FloatingController {
    constructor() {
      this.container = null;
      this.shadowRoot = null;
      this.position = { ...DEFAULT_POSITION };
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this._actionCallback = null;
      this._positionCallback = null;
      this.playbackStatus = 'stopped';
      this.progress = 0;
      this.timeRemaining = '0:00';

      // T047/T050: ResizeObserver for viewport changes (011-highlight-playback-fix)
      this._resizeObserver = null;

      // T052: MutationObserver for DOM protection (011-highlight-playback-fix)
      this._mutationObserver = null;

      // Bind methods for event listeners
      this._onMouseDown = this._onMouseDown.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onMouseUp = this._onMouseUp.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onResize = this._onResize.bind(this);
    }

    getStyles() {
      return `
        :host {
          /*
           * Token values synced from styles/tokens.css
           * These must be duplicated here for Shadow DOM isolation
           * Last synced: 2026-01-01 (012-frontend-redesign)
           */

          /* Dark theme (default) - synced from :root in tokens.css */
          --voxpage-bg: #1a1a2e;           /* = --color-bg-primary */
          --voxpage-bg-secondary: #16213e; /* = --color-bg-secondary */
          --voxpage-bg-hover: #252540;     /* = --color-button-bg-hover (adjusted) */
          --voxpage-accent: #0D9488;       /* = --color-accent-primary */
          --voxpage-accent-hover: #14B8A6; /* = --color-accent-secondary */
          --voxpage-text: #ffffff;         /* = --color-text-primary */
          --voxpage-text-muted: #b8c5d6;   /* = --color-text-secondary */
          --voxpage-border: rgba(255, 255, 255, 0.1); /* = --color-border */
          --voxpage-focus-ring: rgba(13, 148, 136, 0.5); /* = --color-focus-ring */

          /* Controller dimensions */
          --voxpage-controller-width: ${CONTROLLER_WIDTH}px;
          --voxpage-controller-height: ${CONTROLLER_HEIGHT}px;
          --voxpage-border-radius: 12px;   /* = --radius-lg */
          --voxpage-button-size: 36px;
          --voxpage-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); /* = --shadow-lg (adjusted) */
          --voxpage-z-index: ${Z_INDEX};

          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* Light theme - synced from @media (prefers-color-scheme: light) in tokens.css */
        @media (prefers-color-scheme: light) {
          :host {
            --voxpage-bg: #ffffff;         /* = --color-bg-primary (light) */
            --voxpage-bg-secondary: #f8fafc; /* = --color-bg-secondary (light) */
            --voxpage-bg-hover: rgba(0, 0, 0, 0.06); /* = --color-button-bg-hover (light) */
            --voxpage-accent: #0F766E;     /* = --color-accent-primary (light) */
            --voxpage-accent-hover: #0D9488; /* = --color-accent-secondary (light) */
            --voxpage-text: #1e293b;       /* = --color-text-primary (light) */
            --voxpage-text-muted: #475569; /* = --color-text-secondary (light) */
            --voxpage-border: rgba(0, 0, 0, 0.1); /* = --color-border (light) */
            --voxpage-focus-ring: rgba(15, 118, 110, 0.3); /* = --color-focus-ring (light) */
            --voxpage-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); /* lighter shadow */
          }
        }
        .controller {
          position: fixed;
          z-index: var(--voxpage-z-index);
          width: var(--voxpage-controller-width);
          min-height: var(--voxpage-controller-height);
          background: var(--voxpage-bg);
          border: 1px solid var(--voxpage-border);
          border-radius: var(--voxpage-border-radius);
          box-shadow: var(--voxpage-shadow);
          color: var(--voxpage-text);
          padding: 12px;
          box-sizing: border-box;
          user-select: none;
        }
        .drag-handle {
          position: absolute;
          top: 0;
          left: 0;
          right: 40px;
          height: 20px;
          cursor: grab;
        }
        .drag-handle:active { cursor: grabbing; }
        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .btn {
          width: var(--voxpage-button-size);
          height: var(--voxpage-button-size);
          border: none;
          border-radius: 50%;
          background: var(--voxpage-bg-hover);
          color: var(--voxpage-text);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: background-color 0.15s ease, transform 0.1s ease;
        }
        .btn:hover { background: var(--voxpage-accent); }
        .btn:focus-visible { outline: 2px solid var(--voxpage-accent); outline-offset: 2px; box-shadow: 0 0 0 4px var(--voxpage-focus-ring); }
        .btn:focus:not(:focus-visible) { outline: none; }
        .btn:active { transform: scale(0.95); }
        .btn-play-pause {
          width: 44px;
          height: 44px;
          background: var(--voxpage-accent);
          font-size: 18px;
        }
        .btn-play-pause:hover { background: var(--voxpage-accent-hover); }
        .btn-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          font-size: 12px;
          background: transparent;
        }
        .btn-close:hover { background: rgba(255, 255, 255, 0.1); }
        .progress-container { display: flex; align-items: center; gap: 8px; }
        .progress-bar {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          cursor: pointer;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--voxpage-accent);
          border-radius: 3px;
          transition: width 0.1s linear;
          width: 0%;
        }
        .time-remaining {
          font-size: 12px;
          color: var(--voxpage-text-muted);
          min-width: 40px;
          text-align: right;
        }
        .loading .btn-play-pause::after {
          content: '';
          width: 20px;
          height: 20px;
          border: 2px solid transparent;
          border-top-color: var(--voxpage-text);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .btn { transition: none; }
          .progress-fill { transition: none; }
          @keyframes spin { to { transform: none; } }
        }
      `;
    }

    getTemplate() {
      const playPauseIcon = this.playbackStatus === 'playing' ? '⏸' : '▶';
      const playPauseLabel = this.playbackStatus === 'playing' ? 'Pause' : 'Play';

      return `
        <div class="controller ${this.playbackStatus === 'loading' ? 'loading' : ''}"
             role="toolbar"
             aria-label="VoxPage playback controls"
             tabindex="0">
          <div class="drag-handle"></div>
          <button class="btn btn-close" aria-label="Close controller" data-action="close">✕</button>
          <div class="controls">
            <button class="btn btn-prev" aria-label="Previous paragraph" data-action="prev">⏮</button>
            <button class="btn btn-play-pause"
                    aria-label="${playPauseLabel}"
                    aria-pressed="${this.playbackStatus === 'playing'}"
                    data-action="playPause">
              ${this.playbackStatus === 'loading' ? '' : playPauseIcon}
            </button>
            <button class="btn btn-next" aria-label="Next paragraph" data-action="next">⏭</button>
            <button class="btn btn-stop" aria-label="Stop playback" data-action="stop">⏹</button>
          </div>
          <div class="progress-container">
            <div class="progress-bar"
                 role="slider"
                 aria-label="Playback progress"
                 aria-valuenow="${Math.round(this.progress)}"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 tabindex="0"
                 data-action="seek">
              <div class="progress-fill" style="width: ${this.progress}%"></div>
            </div>
            <span class="time-remaining">${this.timeRemaining}</span>
          </div>
        </div>
      `;
    }

    async show(position) {
      if (this.container) return;

      if (position) {
        this.position = position;
      } else {
        await this._restorePosition();
      }

      this.container = document.createElement('div');
      this.container.id = 'voxpage-floating-controller';
      this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

      this._render();
      this._applyPosition();
      document.body.appendChild(this.container);
      this._setupEventListeners();
      this._setupResizeObserver();  // T047: Setup resize observer
      this._setupMutationObserver(); // T052: Setup mutation observer

      const controller = this.shadowRoot.querySelector('.controller');
      if (controller) controller.focus();
    }

    hide() {
      if (!this.container) return;
      this._removeEventListeners();
      this._disconnectResizeObserver();  // T050: Disconnect resize observer
      this._disconnectMutationObserver(); // T052: Disconnect mutation observer
      if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
      this.shadowRoot = null;
    }

    isVisible() { return this.container !== null; }
    getPosition() { return { ...this.position }; }

    setPosition(position) {
      this.position = this._constrainPosition(position);
      this._applyPosition();
    }

    updateState({ status, progress, timeRemaining }) {
      const statusChanged = this.playbackStatus !== status;
      this.playbackStatus = status;
      this.progress = progress;
      this.timeRemaining = timeRemaining;

      if (this.shadowRoot) {
        const progressFill = this.shadowRoot.querySelector('.progress-fill');
        if (progressFill) progressFill.style.width = `${progress}%`;

        const timeDisplay = this.shadowRoot.querySelector('.time-remaining');
        if (timeDisplay) timeDisplay.textContent = timeRemaining;

        const progressBar = this.shadowRoot.querySelector('.progress-bar');
        if (progressBar) progressBar.setAttribute('aria-valuenow', Math.round(progress).toString());

        if (statusChanged) {
          this._render();
          this._applyPosition();
        }
      }
    }

    onAction(callback) { this._actionCallback = callback; }
    onPositionChange(callback) { this._positionCallback = callback; }

    _render() {
      if (!this.shadowRoot) return;
      this.shadowRoot.innerHTML = `<style>${this.getStyles()}</style>${this.getTemplate()}`;
      this._attachButtonListeners();
    }

    _applyPosition() {
      if (!this.container) return;
      const controller = this.shadowRoot?.querySelector('.controller');
      if (controller) {
        controller.style.left = `${this.position.x}px`;
        controller.style.top = `${this.position.y}px`;
      }
    }

    _constrainPosition(position) {
      const maxX = window.innerWidth - CONTROLLER_WIDTH - EDGE_MARGIN;
      const maxY = window.innerHeight - CONTROLLER_HEIGHT - EDGE_MARGIN;
      return {
        x: Math.max(EDGE_MARGIN, Math.min(position.x, maxX)),
        y: Math.max(EDGE_MARGIN, Math.min(position.y, maxY))
      };
    }

    async _restorePosition() {
      try {
        const result = await browser.storage.local.get(FLOATING_CONTROLLER_POSITION_KEY);
        if (result[FLOATING_CONTROLLER_POSITION_KEY]) {
          this.position = this._constrainPosition(result[FLOATING_CONTROLLER_POSITION_KEY]);
        }
      } catch (e) {
        this.position = { ...DEFAULT_POSITION };
      }
    }

    async _savePosition() {
      try {
        await browser.storage.local.set({ [FLOATING_CONTROLLER_POSITION_KEY]: this.position });
      } catch (e) {}
      if (this._positionCallback) this._positionCallback(this.position);
    }

    _setupEventListeners() {
      if (!this.shadowRoot) return;
      const dragHandle = this.shadowRoot.querySelector('.drag-handle');
      if (dragHandle) dragHandle.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mouseup', this._onMouseUp);
      const controller = this.shadowRoot.querySelector('.controller');
      if (controller) controller.addEventListener('keydown', this._onKeyDown);
      this._attachButtonListeners();
    }

    _attachButtonListeners() {
      if (!this.shadowRoot) return;
      const buttons = this.shadowRoot.querySelectorAll('[data-action]');
      buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleAction(btn.dataset.action, e);
        });
      });
      const progressBar = this.shadowRoot.querySelector('.progress-bar');
      if (progressBar) {
        progressBar.addEventListener('click', (e) => {
          const rect = progressBar.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          this._handleAction('seek', { percent });
        });
      }
    }

    _removeEventListeners() {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('mouseup', this._onMouseUp);
    }

    _handleAction(action, data) {
      if (action === 'playPause') {
        action = this.playbackStatus === 'playing' ? 'pause' : 'play';
      }
      if (this._actionCallback) this._actionCallback(action, data);
    }

    _onMouseDown(e) {
      this.isDragging = true;
      const controller = this.shadowRoot?.querySelector('.controller');
      if (controller) {
        const rect = controller.getBoundingClientRect();
        this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      e.preventDefault();
    }

    _onMouseMove(e) {
      if (!this.isDragging) return;
      const newPosition = { x: e.clientX - this.dragOffset.x, y: e.clientY - this.dragOffset.y };
      this.position = this._constrainPosition(newPosition);
      this._applyPosition();
    }

    _onMouseUp() {
      if (this.isDragging) {
        this.isDragging = false;
        this._savePosition();
      }
    }

    _onKeyDown(e) {
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          this._handleAction(e.target.dataset?.action || 'playPause');
          break;
        case 'Escape':
          e.preventDefault();
          this._handleAction('close');
          break;
        case 'ArrowLeft':
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { percent: Math.max(0, this.progress - 5) });
          }
          break;
        case 'ArrowRight':
          if (e.target.classList?.contains('progress-bar')) {
            e.preventDefault();
            this._handleAction('seek', { percent: Math.min(100, this.progress + 5) });
          }
          break;
      }
    }

    /**
     * T047/T049: Handle window resize - clamp controller position to viewport
     * @private
     */
    _onResize() {
      if (!this.container || this.isDragging) return;
      // T048: Use _constrainPosition (equivalent to _clampPosition) on resize
      this.position = this._constrainPosition(this.position);
      this._applyPosition();
    }

    /**
     * T047: Setup ResizeObserver to watch for viewport changes
     * @private
     */
    _setupResizeObserver() {
      if (this._resizeObserver) return;

      // Use ResizeObserver on document.body to detect viewport changes
      this._resizeObserver = new ResizeObserver(() => {
        this._onResize();
      });

      // Also listen for window resize events as backup
      window.addEventListener('resize', this._onResize, { passive: true });

      // Observe document.documentElement for size changes
      this._resizeObserver.observe(document.documentElement);
    }

    /**
     * T050: Disconnect ResizeObserver when controller is hidden
     * @private
     */
    _disconnectResizeObserver() {
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      window.removeEventListener('resize', this._onResize);
    }

    /**
     * T052: Setup MutationObserver to protect controller from DOM removal
     * Re-attaches controller if it gets accidentally removed by page scripts
     * @private
     */
    _setupMutationObserver() {
      if (this._mutationObserver || !this.container) return;

      this._mutationObserver = new MutationObserver((mutations) => {
        // Check if our container was removed
        if (!document.body.contains(this.container)) {
          console.log('VoxPage: Controller was removed from DOM, re-attaching');
          // Re-attach to body
          try {
            document.body.appendChild(this.container);
          } catch (e) {
            console.warn('VoxPage: Failed to re-attach controller:', e);
          }
        }
      });

      // Watch for removals from body
      this._mutationObserver.observe(document.body, {
        childList: true,
        subtree: false // Only watch direct children for performance
      });
    }

    /**
     * T052: Disconnect MutationObserver when controller is hidden
     * @private
     */
    _disconnectMutationObserver() {
      if (this._mutationObserver) {
        this._mutationObserver.disconnect();
        this._mutationObserver = null;
      }
    }
  }

  // Create singleton instance
  window.VoxPage = window.VoxPage || {};
  try {
    window.VoxPage.floatingController = new FloatingController();
    console.log('VoxPage: floating-controller.js loaded');
  } catch (e) {
    console.error('VoxPage: Failed to create FloatingController:', e);
  }
})();
