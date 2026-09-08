import type { PlaybackErrorCode } from './contracts.js';

export function classifyShakaFailure(error: unknown): PlaybackErrorCode {
  if (error instanceof TypeError) return 'ENGINE_FAILURE';

  const value = error as { code?: unknown; data?: unknown[] } | null;
  if (!value || typeof value.code !== 'number') return 'UNKNOWN';

  if (value.code === 1001) {
    const status = Array.isArray(value.data) ? value.data[1] : null;
    if (status === 401 || status === 403) return 'AUTH';
    if (status === 404) return 'STREAM_NOT_FOUND';
    if (status === 408) return 'TIMEOUT';
    return 'NETWORK';
  }
  if (value.code === 1002) return 'NETWORK';
  if (value.code === 1003) return 'TIMEOUT';
  if (value.code === 4032) return 'UNSUPPORTED_CODEC';
  if ([3014, 3015, 3016, 3018].includes(value.code)) return 'ENGINE_FAILURE';
  return 'UNKNOWN';
}
