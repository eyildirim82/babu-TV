// Signs tizen/build/ into a .wgt using the official Tizen CLI and the "dev"
// security profile. Requires `npm run tizen:build` to have staged the app.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { artifactName } from './product-identity.mjs';
import { BUILD_DIR, tizen } from './tizen-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROFILE = process.env.TIZEN_PROFILE || 'dev';

if (!existsSync(join(BUILD_DIR, 'index.html'))) {
  console.error('[wgt] tizen/build is not staged; run: npm run tizen:build');
  process.exit(1);
}

for (const f of readdirSync(BUILD_DIR)) {
  if (f.endsWith('.wgt')) rmSync(join(BUILD_DIR, f), { force: true });
}

console.log(`[wgt] tizen package -t wgt -s ${PROFILE}`);
const res = tizen(['package', '-t', 'wgt', '-s', PROFILE, '--', BUILD_DIR]);
if (res.status !== 0) {
  console.error(`[wgt] tizen package failed (exit ${res.status})`);
  process.exit(res.status || 1);
}

const wgts = readdirSync(BUILD_DIR).filter((f) => f.endsWith('.wgt'));
if (wgts.length !== 1) {
  console.error(`[wgt] expected exactly one .wgt after packaging, found ${wgts.length}`);
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim();
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim();
const channel = branch === 'main' ? 'stable' : 'beta';
const name = artifactName({ version, commit, channel });

const produced = join(BUILD_DIR, wgts[0]);
const output = join(BUILD_DIR, name);
if (produced !== output) renameSync(produced, output);

const size = (statSync(output).size / 1024).toFixed(1);
console.log(`[wgt] ${name} (${size} KB)`);
