export interface ParsedM3uEntry {
  tvgId: string | null;
  name: string;
  group: string | null;
  logoUrl: string | null;
  channelNumber: number | null;
  streamUrl: string;
  userAgent: string | null;
  headers: Readonly<Record<string, string>>;
  drm: { keyId: string; key: string } | null;
  useProxy: boolean;
  proxyUrl: string | null;
}

export class M3uParseError extends Error {
  constructor() {
    super('M3U document is malformed.');
    this.name = 'M3uParseError';
  }
}

function findNameSeparator(line: string): number {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ',' && !inQuotes) {
      return index;
    }
  }
  return -1;
}

function attributeValue(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]*)"`));
  if (!match) return null;
  const value = match[1]?.trim() ?? '';
  return value.length > 0 ? value : null;
}

function positiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseProxy(value: string | null): { useProxy: boolean; proxyUrl: string | null } {
  if (value === null) return { useProxy: false, proxyUrl: null };
  const normalized = value.toLowerCase();
  if (normalized === 'false' || normalized === 'no' || normalized === '0') {
    return { useProxy: false, proxyUrl: null };
  }
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
    return { useProxy: true, proxyUrl: null };
  }
  return { useProxy: true, proxyUrl: value };
}

function processStreamUrl(rawUrl: string): {
  url: string;
  headers: Record<string, string>;
} {
  const pipeIndex = rawUrl.indexOf('|');
  if (pipeIndex === -1) return { url: rawUrl, headers: {} };

  const baseUrl = rawUrl.slice(0, pipeIndex);
  const suffix = rawUrl.slice(pipeIndex + 1);
  const headers: Record<string, string> = {};
  const queryParts: string[] = [];

  for (const part of suffix.split('&')) {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = part.slice(0, equalsIndex);
    const value = part.slice(equalsIndex + 1);
    if (key.startsWith('edge-')) {
      queryParts.push(`${key}=${value}`);
    } else {
      headers[key.toLowerCase()] = value;
    }
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = queryParts.length > 0
    ? `${baseUrl}${separator}${queryParts.join('&')}`
    : baseUrl;
  return { url, headers };
}

function parseClearKey(line: string): { keyId: string; key: string } | null {
  const match = line.match(/license_key=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
  if (!match) return null;
  return { keyId: match[1] ?? '', key: match[2] ?? '' };
}

function parseUrlClearKey(url: string): { keyId: string; key: string } | null {
  const match = url.match(/[?&]drmLicense=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
  if (!match) return null;
  return {
    keyId: (match[1] ?? '').toLowerCase(),
    key: (match[2] ?? '').toLowerCase(),
  };
}

function mergeExtHttpHeaders(line: string, headers: Record<string, string>): void {
  try {
    const parsed: unknown = JSON.parse(line.slice('#EXTHTTP:'.length));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    for (const [key, value] of Object.entries(parsed)) {
      headers[key] = String(value);
    }
  } catch {
    // One malformed metadata line must not reject the whole playlist.
  }
}

export function parseM3uDocument(text: string): readonly ParsedM3uEntry[] {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new M3uParseError();

  const lines = text.split(/\r?\n/);
  const entries: ParsedM3uEntry[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]?.trim() ?? '';
    if (!line.startsWith('#EXTINF:')) continue;

    const separatorIndex = findNameSeparator(line);
    const attributes = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const displayName = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : '';
    const name = displayName.length > 0 ? displayName : `Channel ${entries.length + 1}`;

    const tvgId = attributeValue(attributes, 'tvg-id');
    const logoUrl = attributeValue(attributes, 'tvg-logo');
    const group = attributeValue(attributes, 'group-title');
    const channelNumber = positiveInteger(
      attributeValue(attributes, 'tvg-chno') ?? attributeValue(attributes, 'channel-number'),
    );
    const proxy = parseProxy(attributeValue(attributes, 'proxy'));

    let drm: { keyId: string; key: string } | null = null;
    let userAgent: string | null = null;
    const metadataHeaders: Record<string, string> = {};
    let urlIndex = lineIndex + 1;

    while (urlIndex < lines.length) {
      const next = lines[urlIndex]?.trim() ?? '';
      if (next.length === 0) {
        urlIndex += 1;
        continue;
      }
      if (next.startsWith('#KODIPROP:')) {
        drm = parseClearKey(next) ?? drm;
        urlIndex += 1;
        continue;
      }
      if (next.startsWith('#EXTSYS')) {
        urlIndex += 1;
        continue;
      }
      if (next.startsWith('#EXTVLCOPT:')) {
        const userAgentMatch = next.match(/http-user-agent=(.+)/);
        if (userAgentMatch?.[1]) userAgent = userAgentMatch[1].trim();
        urlIndex += 1;
        continue;
      }
      if (next.startsWith('#EXTHTTP:')) {
        mergeExtHttpHeaders(next, metadataHeaders);
        urlIndex += 1;
        continue;
      }
      break;
    }

    const rawUrl = lines[urlIndex]?.trim() ?? '';
    if (rawUrl.length === 0 || rawUrl.startsWith('#')) continue;

    const processed = processStreamUrl(rawUrl);
    if (drm === null) drm = parseUrlClearKey(processed.url);

    entries.push({
      tvgId,
      name,
      group,
      logoUrl,
      channelNumber,
      streamUrl: processed.url,
      userAgent,
      headers: { ...metadataHeaders, ...processed.headers },
      drm,
      useProxy: proxy.useProxy,
      proxyUrl: proxy.proxyUrl,
    });
    lineIndex = urlIndex;
  }

  return entries;
}
