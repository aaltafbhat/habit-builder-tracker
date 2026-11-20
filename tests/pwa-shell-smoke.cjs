'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'www');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(fs.existsSync(path.join(root, 'index.html')), 'www/index.html was not generated');
const html = read('index.html');
const sw = read('service-worker.js');
assert(!html.includes('workspace-repository') && !html.includes('Shared Workspace Repository'), 'Shared workspace UI copied into PWA shell');
assert(!sw.includes('workspace-repository'), 'Shared workspace module remains in PWA cache list');
const shellMatch = sw.match(/const APP_SHELL = \[(.*?)\];/s);
assert(shellMatch, 'Service-worker APP_SHELL list missing');
const assets = [...shellMatch[1].matchAll(/"(\.\/[^"]+)"/g)].map(m => m[1]).filter(p => p !== './');
const missing = assets.filter(p => !fs.existsSync(path.join(root, p.slice(2))));
assert(missing.length === 0, `Missing service-worker assets: ${missing.join(', ')}`);
for (const rel of ['js/database.js','js/profile-manager.js','js/data-tools.js','js/focus-mode.js','css/workspace-import.css']) {
  assert(fs.existsSync(path.join(root, rel)), `Local app-shell asset missing: ${rel}`);
}
assert(fs.existsSync(path.join(root, 'js/workspace-repository.js')) === false, 'Repository module copied into PWA shell');
console.log(`PASS PWA shell smoke: ${assets.length} cached app-shell references resolve; local-only assets present.`);
