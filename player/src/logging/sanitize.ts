const REDACTED = '[REDACTED]';

const SENSITIVE_QUERY_KEYS = new Set([
  'username',
  'user',
  'password',
  'pass',
  'token',
  'auth',
  'authorization',
  'apikey',
  'api_key',
  'key',
]);

export function sanitizeUrlForLog(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  url.username = '';
  url.password = '';

  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, REDACTED);
    }
  }

  return url.toString();
}

export function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeUrlForLog(value);
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (!value || typeof value !== 'object') return value;

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    sanitized[key] = sanitizeLogValue((value as Record<string, unknown>)[key]);
  }
  return sanitized;
}
