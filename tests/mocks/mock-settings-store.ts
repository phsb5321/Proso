/**
 * Mock Settings Store
 *
 * Mock implementation of ISettingsStore for testing.
 * Uses in-memory storage with subscription support.
 *
 * @module tests/mocks/mock-settings-store
 */

import type { ISettingsStore, Settings } from '../../src/ports/settings-store.port';
import type { ProviderId } from '../../src/core/shared/errors';

/**
 * Default settings for mock store.
 */
const DEFAULT_SETTINGS: Settings = {
  mode: 'article',
  provider: 'elevenlabs',
  voice: null,
  speed: 1.0,
  showCostEstimate: true,
  cacheEnabled: true,
  maxCacheSize: 50,
  wordSyncEnabled: true,
  providerOverride: null,
};

/**
 * Configuration for mock settings store.
 */
export interface MockSettingsStoreConfig {
  /** Initial settings */
  initialSettings?: Partial<Settings>;
  /** Initial API keys */
  initialApiKeys?: Partial<Record<ProviderId, string>>;
  /** Simulate latency in ms */
  latencyMs?: number;
}

/**
 * Mock settings store for testing PlaybackService.
 */
export class MockSettingsStore implements ISettingsStore {
  private settings: Settings;
  private apiKeys: Map<ProviderId, string>;
  private subscribers: Set<(settings: Settings) => void>;
  private latencyMs: number;

  // Tracking for test assertions
  public getSettingsCalls: number = 0;
  public updateSettingsCalls: Array<Partial<Settings>> = [];
  public getApiKeyCalls: ProviderId[] = [];
  public setApiKeyCalls: Array<{ provider: ProviderId; key: string }> = [];
  public subscribeCalls: number = 0;

  constructor(config: MockSettingsStoreConfig = {}) {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...config.initialSettings,
    };
    this.apiKeys = new Map();
    if (config.initialApiKeys) {
      for (const [provider, key] of Object.entries(config.initialApiKeys)) {
        this.apiKeys.set(provider as ProviderId, key);
      }
    }
    this.subscribers = new Set();
    this.latencyMs = config.latencyMs ?? 0;
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      callback(this.settings);
    }
  }

  async getSettings(): Promise<Settings> {
    this.getSettingsCalls++;
    await this.simulateLatency();
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    this.updateSettingsCalls.push(updates);
    await this.simulateLatency();

    this.settings = {
      ...this.settings,
      ...updates,
    };

    this.notifySubscribers();
  }

  async getApiKey(provider: ProviderId): Promise<string | null> {
    this.getApiKeyCalls.push(provider);
    await this.simulateLatency();

    return this.apiKeys.get(provider) ?? null;
  }

  async setApiKey(provider: ProviderId, key: string): Promise<void> {
    this.setApiKeyCalls.push({ provider, key });
    await this.simulateLatency();

    this.apiKeys.set(provider, key);
  }

  subscribe(callback: (settings: Settings) => void): () => void {
    this.subscribeCalls++;
    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Test helpers

  /**
   * Reset all tracking counters and restore default settings.
   */
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.apiKeys.clear();
    this.subscribers.clear();
    this.getSettingsCalls = 0;
    this.updateSettingsCalls = [];
    this.getApiKeyCalls = [];
    this.setApiKeyCalls = [];
    this.subscribeCalls = 0;
  }

  /**
   * Set latency for simulated operations.
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Get current settings (synchronous, for testing).
   */
  getCurrentSettings(): Settings {
    return { ...this.settings };
  }

  /**
   * Set settings directly (bypass async, for testing).
   */
  setSettings(settings: Partial<Settings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };
    this.notifySubscribers();
  }

  /**
   * Get number of active subscribers.
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Trigger notification to all subscribers (for testing change propagation).
   */
  triggerNotification(): void {
    this.notifySubscribers();
  }
}

/**
 * Create a mock settings store with default configuration.
 */
export function createMockSettingsStore(
  config?: MockSettingsStoreConfig
): MockSettingsStore {
  return new MockSettingsStore(config);
}
