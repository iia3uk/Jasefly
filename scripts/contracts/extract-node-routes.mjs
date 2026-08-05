#!/usr/bin/env node
/**
 * Static inventory of Node Hono route registrations.
 * Emits contracts/baseline/node-routes.v1.json and optionally checks coverage vs PHP baseline.
 *
 * Usage:
 *   node scripts/contracts/extract-node-routes.mjs
 *   node scripts/contracts/extract-node-routes.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = process.argv.includes('--check');
const outPath = path.join(root, 'contracts/baseline/node-routes.v1.json');
const modulesDir = path.join(root, 'runtime-node/src/modules');
const appFile = path.join(root, 'runtime-node/src/app.ts');

/** Hono uses :param; PHP baseline uses {param} — normalize for parity inventory. */
function normalizeRoutePath(pth) {
  return pth.replace(/:(\w+)/g, '{$1}');
}

function extractFromSource(src, file) {
  const routes = [];
  // `${p}/path` pattern
  const re1 = /ctx\.app\.(get|post|put|patch|delete)\(\s*`\$\{p\}([^`]+)`/g;
  const re2 = /app\.(get|post|put|patch|delete)\(\s*`\$\{p\}([^`]+)`/g;
  const re3 = /app\.(get|post|put|patch|delete)\(\s*['"`](\/api\/v1[^'"`]*)['"`]/g;
  for (const re of [re1, re2, re3]) {
    let m;
    while ((m = re.exec(src))) {
      const method = m[1].toUpperCase();
      let pth = m[2];
      if (pth.startsWith('/api/v1')) pth = pth.slice('/api/v1'.length) || '/';
      if (!pth.startsWith('/')) pth = '/' + pth;
      pth = normalizeRoutePath(pth);
      routes.push({
        id: `${method} ${pth}`,
        method,
        path: pth,
        file: path.relative(root, file).replace(/\\/g, '/'),
      });
    }
  }
  return routes;
}

const files = [
  appFile,
  ...fs.readdirSync(modulesDir).filter((f) => f.endsWith('.ts')).map((f) => path.join(modulesDir, f)),
];

let routes = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  routes.push(...extractFromSource(src, f));
}

// Dedupe
const map = new Map();
for (const r of routes) map.set(r.id, r);
routes = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));

const doc = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  generator: 'scripts/contracts/extract-node-routes.mjs',
  route_count: routes.length,
  routes,
};

// Expand generic AdminCrud `/admin/:resource` into concrete resources from contracts
const resources = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts/resources/admin-resources.v1.json'), 'utf8'),
);
const expanded = [...routes];
const hasGeneric = routes.some((r) => r.path.includes('/admin/:resource'));
if (hasGeneric || routes.some((r) => r.file?.includes('app.ts'))) {
  for (const key of Object.keys(resources.tables || {})) {
    for (const method of ['GET', 'POST']) {
      expanded.push({
        id: `${method} /admin/${key}`,
        method,
        path: `/admin/${key}`,
        file: 'runtime-node/src/app.ts#AdminCrud',
        via: 'AdminCrud',
      });
    }
    for (const method of ['GET', 'PUT', 'DELETE']) {
      expanded.push({
        id: `${method} /admin/${key}/{id}`,
        method,
        path: `/admin/${key}/{id}`,
        file: 'runtime-node/src/app.ts#AdminCrud',
        via: 'AdminCrud',
      });
    }
  }
  for (const key of Object.keys(resources.singletons || {})) {
    expanded.push({
      id: `GET /admin/${key}`,
      method: 'GET',
      path: `/admin/${key}`,
      file: 'runtime-node/src/app.ts#AdminCrud',
      via: 'AdminCrud',
    });
    expanded.push({
      id: `PUT /admin/${key}`,
      method: 'PUT',
      path: `/admin/${key}`,
      file: 'runtime-node/src/app.ts#AdminCrud',
      via: 'AdminCrud',
    });
  }
}
const map2 = new Map();
for (const r of expanded) map2.set(r.id, r);
routes = [...map2.values()].sort((a, b) => a.id.localeCompare(b.id));
doc.routes = routes;
doc.route_count = routes.length;

if (check) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'contracts/baseline/routes.v1.json'), 'utf8'));
  const exclusionsPath = path.join(root, 'contracts/baseline/exclusions.v1.json');
  let excludedIds = new Set();
  if (fs.existsSync(exclusionsPath)) {
    const exclusions = JSON.parse(fs.readFileSync(exclusionsPath, 'utf8'));
    excludedIds = new Set((exclusions.routes || []).map((r) => r.id));
  }
  const phpIds = new Set(baseline.routes.map((r) => r.id));
  const nodeIds = new Set(routes.map((r) => r.id));
  const missingInNode = [...phpIds].filter((id) => !nodeIds.has(id) && !excludedIds.has(id));
  const excludedMissing = [...phpIds].filter((id) => !nodeIds.has(id) && excludedIds.has(id));
  const extraInNode = [...nodeIds].filter((id) => !phpIds.has(id));
  const coverage = ((phpIds.size - missingInNode.length - excludedMissing.length) / phpIds.size) * 100;
  console.log(`node routes: ${nodeIds.size}; php baseline: ${phpIds.size}; coverage: ${coverage.toFixed(1)}%`);
  console.log(`missingInNode: ${missingInNode.length}; excluded: ${excludedMissing.length}; extraInNode: ${extraInNode.length}`);
  fs.writeFileSync(outPath, JSON.stringify({ ...doc, coverage_pct: coverage, missing_count: missingInNode.length }, null, 2) + '\n');
  if (process.env.BASELINE_REQUIRE_FULL === '1' && missingInNode.length) {
    console.error('BASELINE_REQUIRE_FULL: Node missing routes:');
    for (const id of missingInNode.slice(0, 40)) console.error(' -', id);
    if (missingInNode.length > 40) console.error(` ... +${missingInNode.length - 40} more`);
    process.exit(1);
  }
  if (routes.length < 20) {
    console.error('node route inventory too small');
    process.exit(1);
  }
  console.log('node routes inventory OK');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${outPath} (${routes.length} routes)`);
