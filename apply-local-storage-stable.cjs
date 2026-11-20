'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) throw new Error('Run this helper from the Habit Builder Tracker project root.');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.name !== 'habit-builder-tracker') throw new Error('Safety check failed: this folder is not a Habit Builder Tracker project.');
const remove = [
  'js/workspace-repository.js',
  'css/workspace-repository.css',
  'packaging/electron/preload.cjs',
  'tests/workspace-repository-roundtrip.cjs',
  'tests/firefox-compatibility.cjs',
  'tests/electron-storage-smoke.cjs',
  'WORKSPACE-REPOSITORY-ARCHITECTURE.md',
  'INSTALL-v1.5.35.txt',
  'INSTALL-v1.5.36.txt',
  'RELEASE_NOTES_v1.5.35.md',
  'RELEASE_NOTES_v1.5.36.md',
  'RELEASE_NOTES_v1.5.37.md',
  'TEST-RESULTS-v1.5.36.md',
  'www'
];
for (const rel of remove) fs.rmSync(path.join(root, rel), { recursive: true, force: true });
for (const rel of ['release-docs/INSTALL-STABLE-v1.5.38.md','release-docs/STABLE-RELEASE-NOTES-v1.5.38.md','release-docs/TEST-RESULTS-v1.5.38.md','release-docs/WORKSPACE-STORAGE-ARCHITECTURE-v1.5.38.md']) {
  fs.rmSync(path.join(root, rel), { recursive: true, force: true });
}
console.log('Cleanup complete. Shared-workspace files are removed. Run npm install, then npm test; the test command rebuilds the local-only www app shell.');
