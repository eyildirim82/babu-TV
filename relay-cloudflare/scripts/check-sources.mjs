// The Worker must never log request data and its sources must stay plain text.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const problems = [];
for (const name of readdirSync(srcDir)) {
  const bytes = readFileSync(`${srcDir}/${name}`);
  if (bytes.includes(0)) problems.push(`${name}: NUL byte`);
  if (/\bconsole\./.test(bytes.toString('utf8'))) problems.push(`${name}: console usage`);
}
if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('relay-cloudflare sources: no console usage, no NUL bytes\n');
