import type { Channel } from '../domain/models.js';
import { makeChannelKey } from '../domain/models.js';

export interface ChannelReconciliationResult {
  added: readonly Channel[];
  updated: readonly Channel[];
  removed: readonly Channel[];
  retained: readonly Channel[];
}

function sameChannel(left: Channel, right: Channel): boolean {
  return left.providerId === right.providerId
    && left.id === right.id
    && left.name === right.name
    && left.categoryId === right.categoryId
    && left.logoUrl === right.logoUrl
    && left.number === right.number;
}

export function reconcileChannels(
  previous: readonly Channel[],
  next: readonly Channel[],
): ChannelReconciliationResult {
  const previousByKey = new Map(previous.map((channel) => [
    makeChannelKey(channel.providerId, channel.id),
    channel,
  ]));
  const nextByKey = new Map(next.map((channel) => [
    makeChannelKey(channel.providerId, channel.id),
    channel,
  ]));

  const added: Channel[] = [];
  const updated: Channel[] = [];
  const retained: Channel[] = [];

  for (const channel of next) {
    const key = makeChannelKey(channel.providerId, channel.id);
    const oldChannel = previousByKey.get(key);
    if (!oldChannel) {
      added.push(channel);
    } else if (sameChannel(oldChannel, channel)) {
      retained.push(channel);
    } else {
      updated.push(channel);
    }
  }

  const removed = previous.filter((channel) => !nextByKey.has(
    makeChannelKey(channel.providerId, channel.id),
  ));

  return { added, updated, removed, retained };
}
