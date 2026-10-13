#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const frontend = path.join(root, 'frontend');
const manifest = fs.readFileSync(path.join(frontend, 'kedco-page-routes.js'), 'utf8');
const paths = [...manifest.matchAll(/["'](\/pages\/[^"']+?\.html)["']/g)].map(m => m[1]);
const missing = [...new Set(paths)].filter(p => !fs.existsSync(path.join(frontend, p.slice(1))));
assert.equal(missing.length, 0, `Missing dashboard pages: ${missing.join(', ')}`);
assert.ok(fs.existsSync(path.join(frontend, 'index.html')));
console.log(`Local path verification OK: root index.html and ${new Set(paths).size} route targets.`);
if (process.argv[2]) {
 const url = process.argv[2].replace(/\/$/, '');
 for (const endpoint of ['/', '/health', '/pages/tmo/analyzer.html']) {
   const response = await fetch(url + endpoint, { redirect: 'follow' });
   assert.equal(response.status, 200, `Unexpected HTTP ${response.status} at ${endpoint}`);
   console.log(`${response.status} ${url}${endpoint}`);
 }
}
