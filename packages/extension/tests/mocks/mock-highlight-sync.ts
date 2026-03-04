/**
 * Mock Highlight Synchronizer
 *
 * Mock implementation of IHighlightSynchronizer for testing.
 * Tracks all highlight operations without actual DOM manipulation.
 *
 * @module tests/mocks/mock-highlight-sync
 */

import type { HighlightError } from '../../src/core/shared/errors';
import { highlightError } from '../../src/core/shared/errors';
import type { Result } from '../../src/core/shared/result';
import { Err, Ok } from '../../src/core/shared/result';
import type { FooterState, IHighlightSynchronizer } from '../../src/ports/highlight-sync.port';

/**
 * Configuration for mock highlight synchronizer.
 */
export interface MockHighlightSyncConfig {
  /** Force specific error on next operation */
  forceError?: HighlightError | null;
  /** Simulate latency in ms */
  latencyMs?: number;
  /** Valid tab IDs (others will return tab_not_found) */
  validTabIds?: number[];
}

/**
 * Recorded paragraph highlight call.
 */
export interface ParagraphHighlightCall {
  tabId: number;
  paragraphIndex: number;
  scroll: boolean;
  timestamp: number;
}

/**
 * Recorded word highlight call.
 */
export interface WordHighlightCall {
  tabId: number;
  paragraphIndex: number;
  wordIndex: number;
  timestamp: number;
}

/**
 * Recorded footer state update.
 */
export interface FooterStateUpdateCall {
  tabId: number;
  state: FooterState;
  timestamp: number;
}

/**
 * Mock highlight synchronizer for testing PlaybackService.
 */
export class MockHighlightSync implements IHighlightSynchronizer {
  private forceError: HighlightError | null;
  private latencyMs: number;
  private validTabIds: Set<number>;

  // Current state per tab
  private currentParagraphIndex = new Map<number, number>();
  private currentWordIndex = new Map<number, number>();
  private footerVisible = new Map<number, boolean>();
  private footerState = new Map<number, FooterState>();

  // Tracking for test assertions
  public highlightParagraphCalls: ParagraphHighlightCall[] = [];
  public highlightWordCalls: WordHighlightCall[] = [];
  public clearHighlightsCalls: number[] = [];
  public showFooterCalls: number[] = [];
  public hideFooterCalls: number[] = [];
  public updateFooterStateCalls: FooterStateUpdateCall[] = [];

  constructor(config: MockHighlightSyncConfig = {}) {
    this.forceError = config.forceError ?? null;
    this.latencyMs = config.latencyMs ?? 0;
    this.validTabIds = new Set(config.validTabIds ?? []);
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  private validateTabId(tabId: number): HighlightError | null {
    if (this.validTabIds.size > 0 && !this.validTabIds.has(tabId)) {
      return highlightError.tabNotFound(tabId);
    }
    return null;
  }

  async highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean,
    _text?: string,
    _timestamp?: number,
  ): Promise<Result<void, HighlightError>> {
    this.highlightParagraphCalls.push({
      tabId,
      paragraphIndex,
      scroll,
      timestamp: Date.now(),
    });
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.currentParagraphIndex.set(tabId, paragraphIndex);
    this.currentWordIndex.delete(tabId); // Clear word highlight on paragraph change

    return Ok(undefined);
  }

  async setWordTimeline(
    tabId: number,
    paragraphIndex: number,
    _wordTimeline: ReadonlyArray<{
      word: string;
      charOffset: number;
      charLength: number;
      startTimeMs: number;
      endTimeMs: number;
    }>,
  ): Promise<Result<void, HighlightError>> {
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.currentParagraphIndex.set(tabId, paragraphIndex);
    return Ok(undefined);
  }

  async highlightWord(
    tabId: number,
    paragraphIndex: number,
    wordIndex: number,
  ): Promise<Result<void, HighlightError>> {
    this.highlightWordCalls.push({
      tabId,
      paragraphIndex,
      wordIndex,
      timestamp: Date.now(),
    });
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.currentParagraphIndex.set(tabId, paragraphIndex);
    this.currentWordIndex.set(tabId, wordIndex);

    return Ok(undefined);
  }

  public sendAudioPositionCalls: Array<{
    tabId: number;
    currentTimeMs: number;
    isPlaying: boolean;
    speed: number;
    timestamp: number;
  }> = [];

  async sendAudioPosition(
    tabId: number,
    currentTimeMs: number,
    isPlaying: boolean,
    speed: number,
  ): Promise<Result<void, HighlightError>> {
    this.sendAudioPositionCalls.push({
      tabId,
      currentTimeMs,
      isPlaying,
      speed,
      timestamp: Date.now(),
    });
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    return Ok(undefined);
  }

  async clearHighlights(tabId: number): Promise<Result<void, HighlightError>> {
    this.clearHighlightsCalls.push(tabId);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.currentParagraphIndex.delete(tabId);
    this.currentWordIndex.delete(tabId);

    return Ok(undefined);
  }

  async showFooter(tabId: number): Promise<Result<void, HighlightError>> {
    this.showFooterCalls.push(tabId);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.footerVisible.set(tabId, true);

    return Ok(undefined);
  }

  async hideFooter(tabId: number): Promise<Result<void, HighlightError>> {
    this.hideFooterCalls.push(tabId);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.footerVisible.set(tabId, false);

    return Ok(undefined);
  }

  async updateFooterState(
    tabId: number,
    state: FooterState,
  ): Promise<Result<void, HighlightError>> {
    this.updateFooterStateCalls.push({
      tabId,
      state,
      timestamp: Date.now(),
    });
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const tabError = this.validateTabId(tabId);
    if (tabError) {
      return Err(tabError);
    }

    this.footerState.set(tabId, state);

    return Ok(undefined);
  }

  // Test helpers

  /**
   * Reset all tracking counters and state.
   */
  reset(): void {
    this.highlightParagraphCalls = [];
    this.highlightWordCalls = [];
    this.sendAudioPositionCalls = [];
    this.clearHighlightsCalls = [];
    this.showFooterCalls = [];
    this.hideFooterCalls = [];
    this.updateFooterStateCalls = [];
    this.currentParagraphIndex.clear();
    this.currentWordIndex.clear();
    this.footerVisible.clear();
    this.footerState.clear();
    this.forceError = null;
  }

  /**
   * Set forced error for next operations.
   */
  setForceError(error: HighlightError | null): void {
    this.forceError = error;
  }

  /**
   * Set latency for simulated operations.
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Add valid tab ID.
   */
  addValidTabId(tabId: number): void {
    this.validTabIds.add(tabId);
  }

  /**
   * Remove valid tab ID.
   */
  removeValidTabId(tabId: number): void {
    this.validTabIds.delete(tabId);
  }

  /**
   * Get current paragraph index for a tab.
   */
  getCurrentParagraphIndex(tabId: number): number | undefined {
    return this.currentParagraphIndex.get(tabId);
  }

  /**
   * Get current word index for a tab.
   */
  getCurrentWordIndex(tabId: number): number | undefined {
    return this.currentWordIndex.get(tabId);
  }

  /**
   * Check if footer is visible for a tab.
   */
  isFooterVisible(tabId: number): boolean {
    return this.footerVisible.get(tabId) ?? false;
  }

  /**
   * Get current footer state for a tab.
   */
  getFooterState(tabId: number): FooterState | undefined {
    return this.footerState.get(tabId);
  }
}

/**
 * Create a mock highlight synchronizer with default configuration.
 */
export function createMockHighlightSync(config?: MockHighlightSyncConfig): MockHighlightSync {
  return new MockHighlightSync(config);
}
