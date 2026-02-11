/**
 * Core Domain Layer
 *
 * Exports all domain entities, services, and shared types.
 * The core layer contains pure business logic with no external dependencies.
 *
 * @module core
 */

// Shared utilities (Result type, errors)
export * from './shared';

// Playback domain
export * from './playback';

// Content extraction domain
export * from './content-extraction';
