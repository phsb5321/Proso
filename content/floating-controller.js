/**
 * VoxPage Floating Controller
 * A persistent floating playback controller injected into web pages
 */

// Storage key for position (matches background/constants.js)
const FLOATING_CONTROLLER_POSITION_KEY = 'floatingControllerPosition';

/**
 * Default position for the controller
 */
const DEFAULT_POSITION = { x: 20, y: 20 };

/**
 * Controller dimensions
 */
const CONTROLLER_WIDTH = 280;
const CONTROLLER_HEIGHT = 64;
const EDGE_MARGIN = 16;

/**
 * Z-index for maximum visibility
 */
const Z_INDEX = 2147483647;

/**
 * FloatingController manages a floating playback control widget
 * that persists on the page independently of the extension popup.
 */
class FloatingController {
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;

    /** @type {ShadowRoot|null} */
    this.shadowRoot = null;

    /** @type {{x: number, y: number}} */
    this.position = { ...DEFAULT_POSITION };

    /** @type {boolean} */
    this.isDragging = false;

    /** @type {{x: number, y: number}} */
    this.dragOffset = { x: 0, y: 0 };

    /** @type {Function|null} */
    this._actionCallback = null;

    /** @type {Function|null} */
    this._positionCallback = null;

    /** @type {'playing'|'paused'|'loading'|'stopped'} */
    this.playbackStatus = 'stopped';

    /** @type {number} */
    this.progress = 0;

    /** @type {string} */
    this.timeRemaining = '0:00';

    // Bind methods for event listeners
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /**
   * Get the CSS styles for the controller
   * @returns {string}
   */
  getStyles() {
    return `
      :host {
        --voxpage-bg: #1a1a2e;
        --voxpage-bg-hover: #252540;
        --voxpage-accent: #0D9488;
        --voxpage-accent-hover: #14B8A6;
        --voxpage-text: #ffffff;
        --voxpage-text-muted: #a0a0a0;
        --voxpage-controller-width: ${CONTROLLER_WIDTH}px;
        --voxpage-controller-height: ${CONTROLLER_HEIGHT}px;
        --voxpage-border-radius: 12px;
        --voxpage-button-size: 36px;
        --voxpage-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        --voxpage-z-index: ${Z_INDEX};

        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .controller {
        position: fixed;
        z-index: var(--voxpage-z-index);
        width: var(--voxpage-controller-width);
        min-height: var(--voxpage-controller-height);
        background: var(--voxpage-bg);
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

      .drag-handle:active {
        cursor: grabbing;
      }

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

      .btn:hover {
        background: var(--voxpage-accent);
      }

      .btn:focus {
        outline: 2px solid var(--voxpage-accent);
        outline-offset: 2px;
      }

      .btn:active {
        transform: scale(0.95);
      }

      .btn-play-pause {
        width: 44px;
        height: 44px;
        background: var(--voxpage-accent);
        font-size: 18px;
      }

      .btn-play-pause:hover {
        background: var(--voxpage-accent-hover);
      }

      .btn-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 24px;
        height: 24px;
        font-size: 12px;
        background: transparent;
      }

      .btn-close:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .progress-container {
        display: flex;
        align-items: center;
        gap: 8px;
      }

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

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        .btn {
          transition: none;
        }
        .progress-fill {
          transition: none;
        }
        @keyframes spin {
          to { transform: none; }
        }
      }
    `;
  }

  /**
   * Get the HTML template for the controller
   * @returns {string}
   */
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

  /**
   * Show the floating controller
   * @param {{x: number, y: number}} [position] - Initial position
   */
  async show(position) {
    if (this.container) return;

    // Restore position from storage or use provided/default
    if (position) {
      this.position = position;
    } else {
      await this._restorePosition();
    }

    // Create container element
    this.container = document.createElement('div');
    this.container.id = 'voxpage-floating-controller';

    // Attach shadow DOM (closed for isolation)
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

    // Render content
    this._render();

    // Apply position
    this._applyPosition();

    // Add to page
    document.body.appendChild(this.container);

    // Setup event listeners
    this._setupEventListeners();

    // Focus the controller for keyboard navigation
    const controller = this.shadowRoot.querySelector('.controller');
    if (controller) {
      controller.focus();
    }
  }

  /**
   * Hide and remove the controller
   */
  hide() {
    if (!this.container) return;

    this._removeEventListeners();

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.shadowRoot = null;
  }

  /**
   * Check if controller is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.container !== null;
  }

  /**
   * Get current position
   * @returns {{x: number, y: number}}
   */
  getPosition() {
    return { ...this.position };
  }

  /**
   * Set position
   * @param {{x: number, y: number}} position
   */
  setPosition(position) {
    this.position = this._constrainPosition(position);
    this._applyPosition();
  }

  /**
   * Update the playback state display
   * @param {Object} state
   * @param {'playing'|'paused'|'loading'|'stopped'} state.status
   * @param {number} state.progress - 0-100
   * @param {string} state.timeRemaining - Formatted time
   */
  updateState({ status, progress, timeRemaining }) {
    const statusChanged = this.playbackStatus !== status;
    this.playbackStatus = status;
    this.progress = progress;
    this.timeRemaining = timeRemaining;

    if (this.shadowRoot) {
      // Update progress bar
      const progressFill = this.shadowRoot.querySelector('.progress-fill');
      if (progressFill) {
        progressFill.style.width = `${progress}%`;
      }

      // Update time remaining
      const timeDisplay = this.shadowRoot.querySelector('.time-remaining');
      if (timeDisplay) {
        timeDisplay.textContent = timeRemaining;
      }

      // Update progress bar ARIA
      const progressBar = this.shadowRoot.querySelector('.progress-bar');
      if (progressBar) {
        progressBar.setAttribute('aria-valuenow', Math.round(progress).toString());
      }

      // Update play/pause button if status changed
      if (statusChanged) {
        this._render();
        this._applyPosition();
      }
    }
  }

  /**
   * Register callback for user actions
   * @param {Function} callback - Called with action name
   */
  onAction(callback) {
    this._actionCallback = callback;
  }

  /**
   * Register callback for position changes
   * @param {Function} callback - Called with new position
   */
  onPositionChange(callback) {
    this._positionCallback = callback;
  }

  /**
   * Render the controller content
   * @private
   */
  _render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;

    // Re-attach event listeners to new elements
    this._attachButtonListeners();
  }

  /**
   * Apply current position to container
   * @private
   */
  _applyPosition() {
    if (!this.container) return;

    const controller = this.shadowRoot?.querySelector('.controller');
    if (controller) {
      controller.style.left = `${this.position.x}px`;
      controller.style.top = `${this.position.y}px`;
    }
  }

  /**
   * Constrain position to viewport bounds
   * @private
   * @param {{x: number, y: number}} position
   * @returns {{x: number, y: number}}
   */
  _constrainPosition(position) {
    const maxX = window.innerWidth - CONTROLLER_WIDTH - EDGE_MARGIN;
    const maxY = window.innerHeight - CONTROLLER_HEIGHT - EDGE_MARGIN;

    return {
      x: Math.max(EDGE_MARGIN, Math.min(position.x, maxX)),
      y: Math.max(EDGE_MARGIN, Math.min(position.y, maxY))
    };
  }

  /**
   * Restore position from browser storage
   * @private
   */
  async _restorePosition() {
    try {
      const result = await browser.storage.local.get(FLOATING_CONTROLLER_POSITION_KEY);
      if (result[FLOATING_CONTROLLER_POSITION_KEY]) {
        this.position = this._constrainPosition(result[FLOATING_CONTROLLER_POSITION_KEY]);
      }
    } catch (e) {
      console.warn('VoxPage: Could not restore controller position:', e);
      this.position = { ...DEFAULT_POSITION };
    }
  }

  /**
   * Save position to browser storage
   * @private
   */
  async _savePosition() {
    try {
      await browser.storage.local.set({
        [FLOATING_CONTROLLER_POSITION_KEY]: this.position
      });
    } catch (e) {
      console.warn('VoxPage: Could not save controller position:', e);
    }

    if (this._positionCallback) {
      this._positionCallback(this.position);
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
      dragHandle.addEventListener('mousedown', this._onMouseDown);
    }

    // Global listeners for drag
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);

    // Keyboard navigation
    const controller = this.shadowRoot.querySelector('.controller');
    if (controller) {
      controller.addEventListener('keydown', this._onKeyDown);
    }

    this._attachButtonListeners();
  }

  /**
   * Attach click listeners to buttons
   * @private
   */
  _attachButtonListeners() {
    if (!this.shadowRoot) return;

    const buttons = this.shadowRoot.querySelectorAll('[data-action]');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        this._handleAction(action, e);
      });
    });

    // Progress bar click for seeking
    const progressBar = this.shadowRoot.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        this._handleAction('seek', { percent });
      });
    }
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }

  /**
   * Handle button actions
   * @private
   * @param {string} action
   * @param {*} [data]
   */
  _handleAction(action, data) {
    if (action === 'playPause') {
      action = this.playbackStatus === 'playing' ? 'pause' : 'play';
    }

    if (this._actionCallback) {
      this._actionCallback(action, data);
    }
  }

  /**
   * Handle mouse down on drag handle
   * @private
   * @param {MouseEvent} e
   */
  _onMouseDown(e) {
    this.isDragging = true;
    const controller = this.shadowRoot?.querySelector('.controller');
    if (controller) {
      const rect = controller.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
    e.preventDefault();
  }

  /**
   * Handle mouse move for dragging
   * @private
   * @param {MouseEvent} e
   */
  _onMouseMove(e) {
    if (!this.isDragging) return;

    const newPosition = {
      x: e.clientX - this.dragOffset.x,
      y: e.clientY - this.dragOffset.y
    };

    this.position = this._constrainPosition(newPosition);
    this._applyPosition();
  }

  /**
   * Handle mouse up to end dragging
   * @private
   */
  _onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this._savePosition();
    }
  }

  /**
   * Handle keyboard navigation
   * @private
   * @param {KeyboardEvent} e
   */
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

      case 'Tab':
        // Allow default tab behavior for focus navigation
        break;
    }
  }
}

// Create singleton instance (available globally for content scripts)
// Using window.VoxPage namespace to avoid polluting global scope
console.log('VoxPage: floating-controller.js creating singleton');
window.VoxPage = window.VoxPage || {};
try {
  window.VoxPage.floatingController = new FloatingController();
  console.log('VoxPage: FloatingController instance created');
} catch (e) {
  console.error('VoxPage: Failed to create FloatingController:', e);
}
