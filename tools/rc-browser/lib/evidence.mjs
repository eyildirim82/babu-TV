import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RC_SECRET_CANARIES } from '../fixtures/common.mjs';

const STATUS = new Set(['PASS', 'RED', 'NOT-AVAILABLE']);
const SENSITIVE_QUERY_KEY = /(user(name)?|pass(word)?|token|auth(orization)?|secret|key|credential)/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

function walkStrings(value, visit) {
  if (typeof value === 'string') {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) walkStrings(item, visit);
  }
}

export function assertNoSecretCanaries(value, canaries = RC_SECRET_CANARIES) {
  let leaked = false;
  walkStrings(value, (text) => {
    if (canaries.some((canary) => canary && text.includes(canary))) leaked = true;
  });
  if (leaked) {
    throw new Error('RC browser evidence rejected: synthetic secret canary detected.');
  }
}

export function sanitizeUrlForEvidence(raw) {
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }

    const segments = parsed.pathname.split('/');
    const liveIndex = segments.findIndex((segment) => segment === 'live');
    if (liveIndex >= 0 && segments.length > liveIndex + 2) {
      segments[liveIndex + 1] = '[REDACTED]';
      segments[liveIndex + 2] = '[REDACTED]';
      parsed.pathname = segments.join('/');
    }
    return parsed.toString();
  } catch {
    return '[REDACTED-URL]';
  }
}

export function sanitizeTextForEvidence(value) {
  let text = String(value ?? '');
  for (const canary of RC_SECRET_CANARIES) {
    if (canary) text = text.split(canary).join('[REDACTED]');
  }
  text = text.replace(URL_PATTERN, (match) => sanitizeUrlForEvidence(match));
  return text;
}

function sanitizeValue(value) {
  if (typeof value === 'string') return sanitizeTextForEvidence(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  }
  return value;
}

function requireField(input, key) {
  if (!(key in input)) throw new Error(`RC browser evidence missing required field: ${key}`);
}

export function createEvidenceRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('RC browser evidence must be an object.');
  }

  for (const key of [
    'scenarioId',
    'productionSha',
    'startingState',
    'actions',
    'expectedState',
    'observedState',
    'console',
    'pageErrors',
    'requestFailures',
    'reloadPersistence',
    'leakage',
    'artifacts',
    'status',
  ]) requireField(input, key);

  if (!STATUS.has(input.status)) throw new Error('RC browser evidence has an invalid status.');
  assertNoSecretCanaries(input);

  const record = sanitizeValue({
    scenarioId: input.scenarioId,
    productionSha: input.productionSha,
    startingState: input.startingState,
    actions: input.actions,
    expectedState: input.expectedState,
    observedState: input.observedState,
    console: input.console,
    pageErrors: input.pageErrors,
    requestFailures: input.requestFailures,
    reloadPersistence: input.reloadPersistence,
    leakage: input.leakage,
    artifacts: input.artifacts,
    status: input.status,
  });
  assertNoSecretCanaries(record);
  return Object.freeze(record);
}

function safeScenarioFileName(scenarioId) {
  return String(scenarioId).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
}

export async function writeEvidence(record, { outputDir = 'rc-browser-artifacts' } = {}) {
  assertNoSecretCanaries(record);
  const sanitized = sanitizeValue(record);
  const serialized = `${JSON.stringify(sanitized, null, 2)}\n`;
  assertNoSecretCanaries(serialized);

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${safeScenarioFileName(record.scenarioId)}.json`);
  await writeFile(outputPath, serialized, 'utf8');
  return outputPath;
}
