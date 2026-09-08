import type { Platform } from './contracts.js';
import { BrowserPlatform } from './browser-platform.js';
import { TizenPlatform, type PlatformWindowLike } from './tizen-platform.js';

export const LEGACY_OPTIONAL_TIZEN_KEYS = [
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'ChannelUp',
  'ChannelDown',
] as const;

export const M3_NUMERIC_TIZEN_KEYS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
] as const;

export function createPlatform(windowLike: PlatformWindowLike): Platform {
  if (windowLike.tizen) {
    return new TizenPlatform(windowLike);
  }
  return new BrowserPlatform();
}
