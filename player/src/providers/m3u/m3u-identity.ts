export interface M3uIdentityInput {
  tvgId: string | null;
  name: string;
  group: string | null;
  streamUrl: string;
}

export function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeLabel(value: string | null): string {
  if (value === null) return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function makeM3uChannelId(input: M3uIdentityInput): string {
  const tvgId = input.tvgId?.trim() ?? '';
  if (tvgId.length > 0) return `tvg:${tvgId}`;

  const identityMaterial = [
    input.streamUrl.trim(),
    normalizeLabel(input.name),
    normalizeLabel(input.group),
  ].join('\n');

  return `fallback:${fnv1a32(identityMaterial)}`;
}

export function makeM3uCategoryId(group: string): string {
  return `group:${fnv1a32(normalizeLabel(group))}`;
}
