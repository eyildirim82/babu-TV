// Signs tizen/build/ into a .wgt using the official Tizen CLI and the "dev"
// security profile. Requires `npm run tizen:build` to have staged the app.
import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { BUILD_DIR, tizen } from './tizen-env.mjs';

const PROFILE = process.env.TIZEN_PROFILE || 'dev';

if (!existsSync(join(BUILD_DIR, 'index.html'))) {
  console.error('[wgt] tizen/build is not staged; run: npm run tizen:build');
  process.exit(1);
}

// Drop any .wgt left over from an earlier run so the glob below stays unambiguous.
for (const f of readdirSync(BUILD_DIR)) {
  if (f.endsWith('.wgt')) rmSync(join(BUILD_DIR, f), { force: true });
}

console.log(`[wgt] tizen package -t wgt -s ${PROFILE}`);
const res = tizen(['package', '-t', 'wgt', '-s', PROFILE, '--', BUILD_DIR]);
if (res.status !== 0) {
  console.error(`[wgt] tizen package failed (exit ${res.status})`);
  process.exit(res.status || 1);
}

const wgt = readdirSync(BUILD_DIR).find((f) => f.endsWith('.wgt'));
if (!wgt) {
  console.error('[wgt] tizen package reported success but produced no .wgt');
  process.exit(1);
}
const size = (statSync(join(BUILD_DIR, wgt)).size / 1024).toFixed(1);
console.log(`[wgt] ${wgt} (${size} KB)`);
