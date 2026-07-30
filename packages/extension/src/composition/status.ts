/**
 * Read-only composition status used by diagnostics.
 *
 * @module composition/status
 */

import { getContainer, isContainerInitialized } from './index';

export interface ContainerStatus {
  readonly initialized: boolean;
  readonly adapters: string[];
  readonly services: string[];
  readonly handlers: string[];
}

export function getContainerStatus(handlerNames: readonly string[]): ContainerStatus {
  if (!isContainerInitialized()) {
    return {
      initialized: false,
      adapters: [],
      services: [],
      handlers: [],
    };
  }

  const container = getContainer();
  const adapters = Object.entries(container.adapters)
    .filter(([, value]) => value !== null)
    .map(([key]) => key);
  const services = Object.entries(container.services)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  return {
    initialized: true,
    adapters,
    services,
    handlers: [...handlerNames],
  };
}
