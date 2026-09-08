// Locates the Tizen Studio CLI and runs it. Node >=20 refuses to spawn .bat
// directly on Windows, so everything goes through cmd.exe.
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TIZEN_DIR = __dirname;
export const BUILD_DIR = join(__dirname, 'build');

const SDK = process.env.TIZEN_STUDIO || 'C:/tizen-studio';
const TIZEN_BAT = join(SDK, 'tools', 'ide', 'bin', 'tizen.bat');
const SDB_EXE = join(SDK, 'tools', 'sdb.exe');

export function requireSdk() {
  if (!existsSync(TIZEN_BAT)) {
    console.error(`[tizen] tizen CLI not found at ${TIZEN_BAT}`);
    console.error('[tizen] set TIZEN_STUDIO to the Tizen Studio install path');
    process.exit(1);
  }
}

// The package manager picks whatever `java` is first on PATH. Tizen tooling
// needs the bundled Java 8, so put it in front for child processes.
function envWithBundledJava() {
  const jdkBin = join(SDK, 'jdk', 'bin');
  if (!existsSync(jdkBin)) return process.env;
  return { ...process.env, PATH: `${jdkBin};${process.env.PATH}`, JAVA_HOME: join(SDK, 'jdk') };
}

function run(exe, args, opts = {}) {
  const cmd = process.env.ComSpec || 'cmd.exe';
  return spawnSync(cmd, ['/d', '/s', '/c', exe, ...args], {
    encoding: 'utf-8',
    env: envWithBundledJava(),
    ...opts,
  });
}

export function tizen(args, { inherit = true } = {}) {
  requireSdk();
  return run(TIZEN_BAT, args, { stdio: inherit ? 'inherit' : 'pipe' });
}

export function sdb(args, { inherit = false } = {}) {
  if (!existsSync(SDB_EXE)) {
    console.error(`[tizen] sdb not found at ${SDB_EXE}`);
    process.exit(1);
  }
  return run(SDB_EXE, args, { stdio: inherit ? 'inherit' : 'pipe' });
}

// First attached device from `sdb devices`, or null when nothing is connected.
export function pickTarget() {
  const res = sdb(['devices']);
  const lines = (res.stdout || '').split(/\r?\n/).slice(1);
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 2 && cols[1] === 'device') {
      return { serial: cols[0], name: cols[2] || cols[0] };
    }
  }
  return null;
}

// Reads the <tizen:application package="..."> value that config.xml declares.
export function packageId() {
  const config = readFileSync(join(TIZEN_DIR, 'config.xml'), 'utf-8');
  const m = config.match(/<tizen:application\b[^>]*\bpackage="([^"]+)"/);
  if (!m) {
    console.error('[tizen] could not read package id from config.xml');
    process.exit(1);
  }
  return m[1];
}
