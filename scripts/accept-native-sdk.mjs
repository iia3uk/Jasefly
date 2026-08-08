#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = [
  'webhooks', 'comments', 'analytics', 'notifications', 'newsletter', 'registration',
  'forms', 'automation', 'translate', 'support', 'blog', 'projects', 'products', 'orders', 'payments',
];

let hits = 0;
for (const s of DOMAINS) {
  for (const f of ['index.ts', 'domain.ts']) {
    const t = fs.readFileSync(path.join(root, 'modules-src', s, 'backend', 'node', f), 'utf8');
    if (/export\s+(async\s+)?function\s+registerLegacy/.test(t) || /export\s*\{[^}]*\bregisterLegacy\b/.test(t)) {
      console.log('LEGACY EXPORT', s, f);
      hits++;
    }
    if (/\bModuleContext\b/.test(t)) {
      console.log('ModuleContext', s, f);
      hits++;
    }
    if (t.includes('runtime-node/src/modules')) {
      console.log('host import', s, f);
      hits++;
    }
  }
}
console.log('package leftover hits', hits);
console.log(
  'legacyModuleBind exists',
  fs.existsSync(path.join(root, 'runtime-node/src/packages/legacyModuleBind.ts')),
);
console.log(
  'invoke exists',
  fs.existsSync(path.join(root, 'runtime-node/src/packages/invokePackageEntry.ts')),
);

const zip = path.join(root, 'release/modules/jasefly-module-webhooks-1.0.0.zip');
const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead('${zip.replace(/'/g, "''")}')
$z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()
`;
const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
const names = (r.stdout || '').split(/\r?\n/).filter(Boolean);
console.log('webhooks zip entries', names.length);
console.log('has node index', names.some((n) => n.replace(/\\/g, '/').endsWith('backend/node/index.ts')));
console.log('has sdk helpers', names.some((n) => n.replace(/\\/g, '/').includes('backend/node/sdk/helpers.ts')));
console.log('has entrypoints.node in module.json', (() => {
  // already known from modules-src; zip includes module.json
  return names.some((n) => n.replace(/\\/g, '/').endsWith('module.json'));
})());
