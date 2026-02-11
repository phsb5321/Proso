/**
 * Adapters Barrel Export
 *
 * Exports all adapter implementations for the hexagonal architecture.
 *
 * @module adapters
 */

// Audio adapters (TTS providers)
export * from './audio';

// Cache adapters (audio caching)
export * from './cache';

// Messaging adapters (content script communication)
export * from './messaging';

// Storage adapters (browser.storage.local)
export * from './storage';

// Content adapters (text extraction and scoring)
export * from './content';

// API adapters (VoxPage server communication)
export * from './api';
