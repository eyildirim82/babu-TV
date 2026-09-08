// Tails the device log, filtered to this app plus the Tizen web runtime.
import { packageId, pickTarget, sdb } from './tizen-env.mjs';

const target = pickTarget();
if (!target) {
  console.error('[dlog] no device reported by sdb; start the emulator first');
  process.exit(1);
}

// Extra tags can be appended: npm run tizen:log -- MyTag:D
const tags = process.argv.slice(2);
const filters = tags.length
  ? tags
  : [`${packageId()}:D`, 'ConsoleMessage:D', 'WRT:D', 'CHROMIUM:D', 'crosswalk:D', '*:E'];

console.log(`[dlog] ${target.name} (${target.serial}) filters: ${filters.join(' ')}`);
const res = sdb(['-s', target.serial, 'dlog', '-v', 'time', ...filters], { inherit: true });
process.exit(res.status ?? 0);
