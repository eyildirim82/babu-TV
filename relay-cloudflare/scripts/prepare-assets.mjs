// Copies the player build into ./public/babustv so the phone pairing route is served over HTTPS.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../player/dist', import.meta.url));
const target = fileURLToPath(new URL('../public/babustv', import.meta.url));
const indexPath = `${source}/index.html`;

if (!existsSync(indexPath) || !readFileSync(indexPath, 'utf8').includes('/babustv/assets/')) {
  process.stderr.write('player/dist is missing or was not built with the /babustv/ base. Run `npm run build` at the repository root first.\n');
  process.exit(1);
}

rmSync(fileURLToPath(new URL('../public', import.meta.url)), { recursive: true, force: true });
cpSync(source, target, { recursive: true });
process.stdout.write('Copied player/dist to relay-cloudflare/public/babustv\n');
