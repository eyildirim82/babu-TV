// Stage the Vite build into tizen/build/ for the official Tizen CLI pipeline.
// Leaves package.mjs (the OpenSSL/Python pipeline) untouched.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'player', 'dist');
const BUILD = join(__dirname, 'build');

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

// Call vite's JS entry directly: Node >=20 refuses to spawn npm.cmd (EINVAL on Windows).
const viteBin = [
  join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
  join(ROOT, 'player', 'node_modules', 'vite', 'bin', 'vite.js'),
].find(existsSync);
if (!viteBin) {
  console.error('[stage] vite not found; run: npm ci');
  process.exit(1);
}

// 1. Build with relative asset paths so the WGT can serve from its own root.
console.log(`[stage] vite build --base=./  (v${version})`);
execFileSync(process.execPath, [viteBin, 'build', '--base=./'], {
  cwd: join(ROOT, 'player'),
  stdio: 'inherit',
});

if (!existsSync(DIST)) {
  console.error(`[stage] build output missing: ${DIST}`);
  process.exit(1);
}

// 2. Reset the staging dir.
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// 3. App files.
cpSync(DIST, BUILD, { recursive: true });

// 4. config.xml with the widget version synced to package.json.
const config = readFileSync(join(__dirname, 'config.xml'), 'utf-8')
  .replace(/(<widget\b[\s\S]*?\bversion=")[^"]*(")/, `$1${version}$2`);
writeFileSync(join(BUILD, 'config.xml'), config);

// 5. Icon referenced by config.xml as icon.png.
cpSync(join(__dirname, 'icons', 'icon_128.png'), join(BUILD, 'icon.png'));

const indexHtml = join(BUILD, 'index.html');
if (!existsSync(indexHtml)) {
  console.error('[stage] index.html missing from staged build');
  process.exit(1);
}
if (/(?:src|href)="\//.test(readFileSync(indexHtml, 'utf-8'))) {
  console.error('[stage] index.html still has absolute asset paths; --base=./ did not apply');
  process.exit(1);
}

console.log(`[stage] ready: ${BUILD}`);
