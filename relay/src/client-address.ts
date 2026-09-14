// Pure address parsing shared by the Node relay and the Cloudflare Worker, which has no node:net.

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;

function parseIpv6(value: string): string[] | null {
  const lastColon = value.lastIndexOf(':');
  if (value.length > 45 || lastColon === -1) return null;

  let head = value;
  let embedded: string[] = [];
  const tail = value.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!IPV4_PATTERN.test(tail)) return null;
    const [a, b, c, d] = tail.split('.').map(Number) as [number, number, number, number];
    embedded = [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    head = value.slice(0, lastColon + 1);
    if (!head.endsWith('::')) head = head.slice(0, -1);
  }

  const groupCount = 8 - embedded.length;
  const compressed = head.indexOf('::');
  if (compressed !== head.lastIndexOf('::')) return null;

  if (compressed === -1) {
    const parts = head.split(':');
    if (parts.length !== groupCount || !parts.every((part) => HEXTET_PATTERN.test(part))) return null;
    return [...parts, ...embedded];
  }

  const left = head.slice(0, compressed);
  const right = head.slice(compressed + 2);
  const leftParts = left === '' ? [] : left.split(':');
  const rightParts = right === '' ? [] : right.split(':');
  if (![...leftParts, ...rightParts].every((part) => HEXTET_PATTERN.test(part))) return null;
  const missing = groupCount - leftParts.length - rightParts.length;
  if (missing < 1) return null;
  return [...leftParts, ...new Array<string>(missing).fill('0'), ...rightParts, ...embedded];
}

/**
 * Rate-limit identity for an address: IPv4 as-is (including every IPv4-mapped IPv6 form), IPv6
 * grouped by /64 because a single subscriber usually controls a whole /64. Proxy-appended ports
 * are stripped. Returns null for anything that is not an IP address.
 */
export function normalizeClientAddress(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let value = raw.trim();
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(value);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(value);
  if (bracketed !== null) value = bracketed[1] as string;
  else if (ipv4WithPort !== null) value = ipv4WithPort[1] as string;
  value = value.toLowerCase();

  if (IPV4_PATTERN.test(value)) return value;
  if (value.includes(':')) value = value.split('%')[0] ?? '';

  const groups = parseIpv6(value);
  if (groups === null) return null;
  const hextets = groups.map((group) => Number.parseInt(group, 16).toString(16));
  if (hextets.slice(0, 5).every((part) => part === '0') && hextets[5] === 'ffff') {
    const high = Number.parseInt(hextets[6] as string, 16);
    const low = Number.parseInt(hextets[7] as string, 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }
  return `${hextets.slice(0, 4).join(':')}::/64`;
}
