import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const destination = path.join(root, 'www');

// These are project/build files, not web-app assets. In particular,
// package.json must stay at the project root for electron-builder.
const excluded = new Set([
  'node_modules',
  'android',
  'dist',
  'www',
  '.git',
  'packaging',
  'tests',
  'release-docs',
  'README.md',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json'
]);

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

function copyDirectory(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;

    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

copyDirectory(root, destination);

// Defensive check: prevent electron-builder from treating www as a nested
// application package with its own unsupported build configuration.
for (const metadataFile of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json']) {
  const copiedMetadata = path.join(destination, metadataFile);
  if (fs.existsSync(copiedMetadata)) {
    fs.rmSync(copiedMetadata, { force: true });
  }
}

console.log(`Web app copied to ${destination}`);
