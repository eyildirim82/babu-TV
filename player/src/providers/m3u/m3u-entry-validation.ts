import type { M3uCredential } from '../../credentials/contracts.js';

export interface M3uEntryInput {
  playlistUrl: string;
}

export type M3uEntryValidationErrorCode =
  | 'REQUIRED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL';

export type M3uEntryValidationResult =
  | { ok: true; credential: M3uCredential }
  | { ok: false; code: M3uEntryValidationErrorCode; input: M3uEntryInput };

export function validateM3uEntry(input: M3uEntryInput): M3uEntryValidationResult {
  const raw = input.playlistUrl;
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, code: 'REQUIRED', input: { ...input } };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: 'INVALID_URL', input: { ...input } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_PROTOCOL', input: { ...input } };
  }

  parsed.hash = '';
  return {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: parsed.toString() },
  };
}
