import type { EpgSourceProgram } from './contracts.js';

export function parseXmltvTimestamp(value: string): number | null {
  const match = value.trim().match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s+([+-])(\d{2})(\d{2})$/,
  );
  if (!match) return null;

  const [, y, mo, d, h, mi, s = '00', sign, oh, om] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const offsetHour = Number(oh);
  const offsetMinute = Number(om);

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) {
    return null;
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);

  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }

  const localLikeUtc = local.getTime();
  const offsetMs = (offsetHour * 60 + offsetMinute) * 60_000 * (sign === '+' ? 1 : -1);
  const epochMs = localLikeUtc - offsetMs;
  return Number.isFinite(epochMs) ? epochMs : null;
}

export function decodeXmlText(value: string): string {
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  const text = cdata ? cdata[1] ?? '' : value;

  return text.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,
    (entity, body: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      const namedValue = named[body.toLowerCase()];
      if (namedValue !== undefined) return namedValue;

      const codePoint = body[0] === '#'
        ? body[1]?.toLowerCase() === 'x'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
        : Number.NaN;

      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    },
  );
}
