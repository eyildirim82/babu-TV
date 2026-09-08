// Installs and launches the staged .wgt on the first device sdb reports.
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { BUILD_DIR, packageId, pickTarget, tizen } from './tizen-env.mjs';

const wgt = existsSync(BUILD_DIR) && readdirSync(BUILD_DIR).find((f) => f.endsWith('.wgt'));
if (!wgt) {
  console.error('[deploy] no .wgt in tizen/build; run: npm run tizen:package');
  process.exit(1);
}

const target = pickTarget();
if (!target) {
  console.error('[deploy] no device reported by sdb.');
  console.error('[deploy] start the emulator first, then check: sdb devices');
  process.exit(1);
}
console.log(`[deploy] target ${target.name} (${target.serial})`);

const install = tizen(['install', '-n', wgt, '-s', target.serial, '--', BUILD_DIR]);
if (install.status !== 0) {
  console.error(`[deploy] tizen install failed (exit ${install.status})`);
  process.exit(install.status || 1);
}

const pkgId = packageId();
console.log(`[deploy] launching ${pkgId}`);
const run = tizen(['run', '-p', pkgId, '-s', target.serial]);
if (run.status !== 0) {
  console.error(`[deploy] tizen run failed (exit ${run.status})`);
  process.exit(run.status || 1);
}
