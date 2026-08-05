#!/usr/bin/env node
/**
 * Generate parity cases from contracts/behavior/** → tests/parity/generated/
 * One JSON case file per behavior scenario (auto; do not hand-edit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorRoot = path.join(root, 'contracts/behavior');
const outDir = path.join(root, 'tests/parity/generated');

if (!fs.existsSync(path.join(behaviorRoot, 'index.v1.json'))) {
  console.error('Run scripts/behavior/extract-behavior.mjs first');
  process.exit(2);
}

const index = JSON.parse(fs.readFileSync(path.join(behaviorRoot, 'index.v1.json'), 'utf8'));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let n = 0;
for (const entry of index.routes) {
  const man = JSON.parse(fs.readFileSync(path.join(root, entry.file), 'utf8'));
  for (const sc of man.scenarios || []) {
    const caseId = `${man.id}::${sc.id}`.replace(/\s+/g, '_');
    const fileName = `${String(++n).padStart(4, '0')}-${slug(caseId)}.json`;
    const c = {
      id: caseId,
      source: entry.file,
      module: man.module,
      method: man.method,
      path: man.path,
      path_params: sc.path_params || {},
      auth: sc.auth || 'none',
      body: sc.body,
      headers: sc.headers || {},
      expect: sc.expect || {},
      compare: sc.compare || { http_status: true, json_envelope: true, deep_json: true },
      database_tables: man.database_tables || [],
      events: man.events || [],
      behavior_hash: man.content_hash,
      generated: true,
    };
    fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(c, null, 2) + '\n');
  }
}

fs.writeFileSync(
  path.join(outDir, '_index.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), count: n, from_routes: index.count }, null, 2) + '\n',
);
console.log(`Generated ${n} parity cases → tests/parity/generated/`);

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}
