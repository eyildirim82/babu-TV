import type { ChannelId, EpgProgram } from '../domain/models.js';
import type { EpgSourceProgram } from './contracts.js';

export function normalizeEpgProgram(
  channelId: ChannelId,
  source: EpgSourceProgram,
): EpgProgram | null {
  if (!Number.isFinite(source.startMs) || !Number.isFinite(source.endMs)) return null;
  if (source.startMs >= source.endMs) return null;

  const title = source.title.trim();
  if (title.length === 0) return null;

  const description = source.description?.trim() ?? null;
  return {
    channelId,
    startMs: source.startMs,
    endMs: source.endMs,
    title,
    description: description && description.length > 0 ? description : null,
  };
}

export function normalizeEpgPrograms(
  channelId: ChannelId,
  sources: readonly EpgSourceProgram[],
): readonly EpgProgram[] {
  const seen = new Set<string>();
  const normalized: EpgProgram[] = [];

  for (const source of sources) {
    const program = normalizeEpgProgram(channelId, source);
    if (!program) continue;
    const key = `${program.startMs}\u0000${program.endMs}\u0000${program.title}\u0000${program.description ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(program);
  }

  return normalized.sort((a, b) =>
    a.startMs - b.startMs || a.endMs - b.endMs || a.title.localeCompare(b.title),
  );
}
