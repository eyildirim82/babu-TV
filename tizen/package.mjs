import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { artifactName } from './product-identity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'player', 'dist');
const TIZEN = __dirname;

const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const APP_VERSION = rootPkg.version;

const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
const channel = branch === 'main' ? 'stable' : 'beta';
const WGT_NAME = artifactName({ version: APP_VERSION, commit: commitHash, channel });
const OUTPUT_DIR = join(ROOT, channel);
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

function findOpenSSL() {
  const candidates = [
    'openssl',
    '"C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe"',
    '"C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe"',
    '"C:\\Program Files\\Git\\usr\\bin\\openssl.exe"',
  ];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} version`, { stdio: 'pipe' });
      return cmd;
    } catch {}
  }
  return null;
}

function findSDB() {
  const candidates = [
    'TizenSdb_v1.1.0.exe',
    '"C:\\Program Files\\TizenSDB\\TizenSdb_v1.1.0.exe"',
  ];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} 2>nul`, { stdio: 'pipe' });
      return cmd;
    } catch {
      try {
        execSync(`${cmd} 2>&1`, { stdio: 'pipe' });
        return cmd;
      } catch {}
    }
  }
  return null;
}

const OPENSSL = findOpenSSL();
if (!OPENSSL) {
  console.log('\n OpenSSL not found.\n  winget install OpenSSL.OpenSSL\n');
  process.exit(1);
}

const SDB = findSDB();
if (!SDB) {
  console.log('\n TizenSdb not found — skipping SDB check (packaging only)\n');
}

console.log(` OpenSSL: ${OPENSSL}`);
console.log(` SDB: ${SDB}`);

if (!existsSync(DIST)) {
  console.log('\n dist/ not found. Run: npm run build\n');
  process.exit(1);
}

const KEY_FILE = join(TIZEN, 'author-key.pem');
const CERT_FILE = join(TIZEN, 'author-cert.pem');

if (!existsSync(KEY_FILE) || !existsSync(CERT_FILE)) {
  console.log('\n Generating developer certificate...');
  execSync(`${OPENSSL} genrsa -out "${KEY_FILE}" 2048`, { stdio: 'inherit' });
  execSync(
    `${OPENSSL} req -new -x509 -key "${KEY_FILE}" -out "${CERT_FILE}" ` +
    `-days 36500 -subj "/CN=BabusTVApp/O=BabusTV/OU=Development"`,
    { stdio: 'inherit' }
  );
} else {
  console.log(' Certificate found');
}

const TEMP = join(TIZEN, 'temp-wgt');
const OUTPUT = join(OUTPUT_DIR, WGT_NAME);
const UNSIGNED = join(TIZEN, 'unsigned.zip');

for (const p of [TEMP, OUTPUT]) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

console.log('\n Building .wgt...');
mkdirSync(TEMP, { recursive: true });

const configXml = readFileSync(join(TIZEN, 'config.xml'), 'utf-8')
  .replace(/(<widget\b[\s\S]*?\bversion=")[^"]*(")/, `$1${APP_VERSION}$2`);
writeFileSync(join(TEMP, 'config.xml'), configXml);

cpSync(DIST, TEMP, { recursive: true });

const htmlPath = join(TEMP, 'index.html');
let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/\/babustv\//g, '/');
writeFileSync(htmlPath, html);

cpSync(join(TIZEN, 'icons', 'icon_128.png'), join(TEMP, 'icon.png'));

const ZIP_HELPER = join(TIZEN, 'ziphelper.py');
execSync(`python "${ZIP_HELPER}" unsigned "${TEMP}" "${UNSIGNED}"`, { stdio: 'inherit' });

if (!existsSync(UNSIGNED)) {
  console.log(' Failed to create unsigned package');
  process.exit(1);
}

console.log(' Signing...');
const SIG_FILE = join(TEMP, 'signature.xml');
execSync(
  `${OPENSSL} smime -sign -signer "${CERT_FILE}" -inkey "${KEY_FILE}" ` +
  `-outform DER -binary -in "${UNSIGNED}" -out "${SIG_FILE}"`,
  { stdio: 'inherit' }
);

execSync(`python "${ZIP_HELPER}" signed "${TEMP}" "${OUTPUT}" "${SIG_FILE}"`, { stdio: 'inherit' });

rmSync(TEMP, { recursive: true, force: true });
rmSync(UNSIGNED, { force: true });

const size = (readFileSync(OUTPUT).length / 1024).toFixed(1);
console.log(`\n Done!  ${WGT_NAME}  (${size} KB)`);
console.log(`   ${OUTPUT}\n`);
