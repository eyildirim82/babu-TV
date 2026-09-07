import type { Channel } from '../domain/models.js';

export interface ChannelReconciliationResult {
  added: readonly Channel[];
  updated: readonly Channel[];
  removed: readonly Channel[];
  retained: readonly Channel[];
}

export function reconcileChannels(
  _previous: readonly Channel[],
  _next: readonly Channel[],
): ChannelReconciliationResult {
  return {
    added: [],
    updated: [],
    removed: [],
    retained: [],
  };
}
