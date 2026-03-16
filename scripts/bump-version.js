import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionFile = resolve(__dirname, '../src/config/version.js');

const content = readFileSync(versionFile, 'utf8');
const match = content.match(/APP_VERSION\s*=\s*'(\d+)\.(\d+)'/);

if (!match) {
  console.error('Could not parse version from version.js');
  process.exit(1);
}

const major = parseInt(match[1]);
const minor = parseInt(match[2]) + 1;
const newVersion = `${major}.${String(minor).padStart(3, '0')}`;

writeFileSync(versionFile, `export const APP_VERSION = '${newVersion}';\n`);
console.log(`Version bumped: ${match[1]}.${match[2]} → ${newVersion}`);
