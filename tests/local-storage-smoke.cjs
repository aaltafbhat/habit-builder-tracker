'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
assert(pkg.version === '1.5.39', 'package.json version must be 1.5.39');
assert(lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, 'package-lock version mismatch');

const html = read('index.html');
const profileManager = read('js/profile-manager.js');
const database = read('js/database.js');
const dataTools = read('js/data-tools.js');
const serviceWorker = read('service-worker.js');
const electronMain = read('packaging/electron/main.cjs');

for (const forbidden of [
  'Shared Workspace Repository',
  'Connect shared workspace location',
  'workspace-repository',
  'HBTWorkspaceRepository',
  'workspace-repository-connect',
  'workspace-repository-publish'
]) {
  assert(!html.includes(forbidden), `Shared workspace UI reference remains in index.html: ${forbidden}`);
  assert(!profileManager.includes(forbidden), `Shared workspace logic remains in profile-manager.js: ${forbidden}`);
  assert(!dataTools.includes(forbidden), `Shared workspace logic remains in data-tools.js: ${forbidden}`);
  assert(!serviceWorker.includes(forbidden), `Shared workspace asset remains in service-worker.js: ${forbidden}`);
}

assert(html.includes('id="profile-import-panel"'), 'Standalone profile backup import panel missing');
assert(html.includes('js/database.js') && html.includes('js/profile-manager.js') && html.includes('js/data-tools.js'), 'Local profile/database modules are not loaded');
assert(database.includes('indexedDB.open'), 'IndexedDB initialization missing');
assert(database.includes('AES-GCM') && database.includes('PBKDF2'), 'Profile encryption primitives missing');
assert(database.includes('function switchProfileDatabase') || database.includes('switchProfileDatabase'), 'Per-profile database switching missing');
assert(profileManager.includes('async function createProfile'), 'Profile creation flow missing');
assert(profileManager.includes('async function switchToProfile'), 'Profile switching flow missing');
assert(profileManager.includes('async function submitUnlock'), 'Password unlock flow missing');
assert(profileManager.includes('async function signOut'), 'Profile sign-out flow missing');
assert(dataTools.includes('async function buildBackup'), 'Local backup export missing');
assert(dataTools.includes('async function handleRestoreFile'), 'Local backup restore missing');
assert(dataTools.includes('async function inspectWorkspaceBackupFile'), 'Separate-profile backup import missing');
assert(dataTools.includes('createAutomaticWorkspaceBackup'), 'Automatic local safety backup missing');
assert(dataTools.includes('restoreFocusWorkspaceData'), 'Focus Mode backup restoration missing');
assert(serviceWorker.includes('habit-builder-tracker-v1.5.39'), 'Service worker cache version not bumped');
assert(electronMain.includes('contextIsolation: true') && electronMain.includes('nodeIntegration: false') && electronMain.includes('sandbox: true'), 'Electron renderer security settings are missing');
assert(!electronMain.includes('HBTNativeWorkspaceStorage') && !electronMain.includes('repository:'), 'Electron shared-folder bridge remains enabled');

for (const rel of ['js/workspace-repository.js', 'css/workspace-repository.css', 'packaging/electron/preload.cjs']) {
  assert(!fs.existsSync(path.join(root, rel)), `Shared-folder-only file still exists: ${rel}`);
}

console.log('PASS local storage smoke: local IndexedDB, profile switching, AES-GCM/PBKDF2, backup/restore, import-as-new-profile, PWA cache and no shared-workspace code.');
