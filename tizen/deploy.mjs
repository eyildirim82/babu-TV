// Installs and launches the staged .wgt on the first device sdb reports.
//
// `tizen install` is preferred, but some Tizen Studio 6.1 installs crash inside
// TargetUtil.getTargets before they reach the device. When that happens we fall
// back to the wascmd path the TV exposes over sdb, which does the same job.
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  BUILD_DIR,
  TV_TMP_DIR,
  applicationId,
  packageId,
  pickTarget,
  sdb,
  tizen,
} from './tizen-env.mjs';

const wgt = existsSync(BUILD_DIR) && readdirSync(BUILD_DIR).find((f) => f.endsWith('.wgt'));
if (!wgt) {
  console.error('[deploy] no .wgt in tizen/build; run: npm run tizen:package');
  process.exit(1);
}

const target = pickTarget();
if (!target) {
  console.error('[deploy] no device reported by sdb.');
  console.error('[deploy] emulator: start it first, then check: sdb devices');
  console.error('[deploy] physical TV: sdb connect <TV_IP>:26101');
  process.exit(1);
}
console.log(`[deploy] target ${target.name} (${target.serial})`);

const pkgId = packageId();
const appId = applicationId();

if (installWithCli() || installWithSdb()) {
  launch();
} else {
  process.exit(1);
}

function installWithCli() {
  const res = tizen(['install', '-n', wgt, '-s', target.serial, '--', BUILD_DIR]);
  if (res.status === 0) return true;
  console.warn(`[deploy] tizen install failed (exit ${res.status}); falling back to sdb`);
  return false;
}

function installWithSdb() {
  const remote = `${TV_TMP_DIR}/${wgt}`;
  console.log(`[deploy] sdb push ${wgt} -> ${TV_TMP_DIR}`);
  const push = sdb(['-s', target.serial, 'push', join(BUILD_DIR, wgt), `${TV_TMP_DIR}/`]);
  if (push.status !== 0) {
    console.error(`[deploy] sdb push failed (exit ${push.status})`);
    console.error(push.stderr || push.stdout || '');
    return false;
  }

  console.log(`[deploy] installing ${pkgId} via wascmd`);
  const install = sdb(['-s', target.serial, 'shell', '0', 'vd_appinstall', pkgId, remote]);
  const out = `${install.stdout || ''}${install.stderr || ''}`;
  // wascmd reports failure in its output while still exiting 0, so read the text.
  if (!out.includes('install completed')) {
    console.error('[deploy] install failed on device');
    console.error(out.trim());
    if (out.includes('Check certificate error')) {
      console.error('[deploy] a retail Samsung TV needs a Samsung certificate profile');
      console.error('[deploy] see SETUP.md, "Samsung sertifikası"');
    }
    return false;
  }
  console.log('[deploy] install completed');
  return true;
}

function launch() {
  console.log(`[deploy] launching ${appId}`);
  const run = tizen(['run', '-p', pkgId, '-s', target.serial]);
  if (run.status === 0) return;

  console.warn(`[deploy] tizen run failed (exit ${run.status}); falling back to sdb`);
  const exec = sdb(['-s', target.serial, 'shell', '0', 'was_execute', appId]);
  const out = `${exec.stdout || ''}${exec.stderr || ''}`;
  if (!out.includes('launched')) {
    console.error('[deploy] launch failed on device');
    console.error(out.trim());
    process.exit(1);
  }
  console.log('[deploy] launched');
}
