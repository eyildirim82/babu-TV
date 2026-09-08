import type { PlaybackErrorCode } from './contracts.js';

interface M3FailureSentinel {
  m3Code?: unknown;
}

export function classifyShakaFailure(error: unknown): PlaybackErrorCode {
  const sentinel = error as M3FailureSentinel | null;
  if (
    sentinel?.m3Code === 'AUTH'
    || sentinel?.m3Code === 'NETWORK'
    || sentinel?.m3Code === 'TIMEOUT'
    || sentinel?.m3Code === 'STREAM_NOT_FOUND'
    || sentinel?.m3Code === 'UNSUPPORTED_CODEC'
    || sentinel?.m3Code === 'ENGINE_FAILURE'
  ) {
    return sentinel.m3Code;
  }

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
