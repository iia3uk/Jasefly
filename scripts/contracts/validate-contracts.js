#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const C = path.join(ROOT, 'contracts');

/** @type {string[]} */
const errors = [];

function mustExist(rel) {
  const p = path.join(C, rel);
  if (!fs.existsSync(p)) errors.push(`missing: contracts/${rel}`);
  return p;
}

function readJson(rel) {
  const p = mustExist(rel);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`invalid JSON contracts/${rel}: ${e.message}`);
    return null;
  }
}

function main() {
  mustExist('openapi/jasefly.v1.yaml');
  mustExist('README.md');
  mustExist('baseline/routes.v1.json');

  const perms = readJson('permissions/permissions-core.v1.json');
  if (perms && !Array.isArray(perms.permissions)) {
    errors.push('permissions.permissions must be array');
  } else if (perms && perms.permissions.length < 5) {
    errors.push(`permissions.permissions too small (${perms.permissions.length}); likely drift/empty`);
  }

  const events = readJson('events/events-core.v1.json');
  if (events && !Array.isArray(events.events)) {
    errors.push('events.events must be array');
  } else if (events && events.events.length < 1) {
    errors.push('events.events must be non-empty');
  }

  const caps = readJson('capabilities/capabilities.v1.json');
  if (caps) {
    if (!Array.isArray(caps.baseline)) errors.push('capabilities.baseline must be array');
    if (!Array.isArray(caps.extended)) errors.push('capabilities.extended must be array');
    if ((caps.baseline || []).length < 1) errors.push('capabilities.baseline must be non-empty');
    const overlap = (caps.baseline || []).filter((c) => (caps.extended || []).includes(c));
    if (overlap.length) errors.push(`capabilities overlap baseline∩extended: ${overlap.join(',')}`);
  }

  const errs = readJson('errors/errors.v1.json');
  if (errs && (!errs.envelope || !errs.codes)) errors.push('errors must have envelope + codes');

  const res = readJson('resources/admin-resources.v1.json');
  if (res && (!res.tables || !res.singletons)) errors.push('resources must have tables + singletons');
  if (res && Object.keys(res.tables || {}).length < 3) {
    errors.push('resources.tables too small; likely drift/empty');
  }

  const mig = readJson('migrations/index.v1.json');
  if (mig) {
    for (const f of [...(mig.install_only || []), ...(mig.incremental || [])]) {
      if (!fs.existsSync(path.join(C, 'migrations', f))) {
        errors.push(`migration file missing: ${f}`);
      }
    }
  }

  mustExist('mcp/mcp-tools.v1.json');
  mustExist('builder/widget-types.v1.json');
  mustExist('platform/api-snapshot.v1.json');

  const modsDir = path.join(C, 'modules');
  const phpModules = new Set();
  const nodeModules = new Set();
  if (!fs.existsSync(modsDir)) {
    errors.push('missing: contracts/modules');
  } else {
    const manifests = fs.readdirSync(modsDir).filter((x) => x.endsWith('.manifest.json'));
    if (manifests.length < 1) errors.push('contracts/modules has no manifests');
    for (const f of manifests) {
      const m = JSON.parse(fs.readFileSync(path.join(modsDir, f), 'utf8'));
      if (!m.runtime || typeof m.runtime.baseline !== 'boolean') {
        errors.push(`${f}: runtime.baseline required`);
      }
      const rawName = (m.name || f.replace('.manifest.json', '')).toLowerCase();
      // Normalize PHP/contracts slug variants → Node file slug
      const name = rawName === 'modulemanager' ? 'module-manager' : rawName.replace(/_/g, '-');
      phpModules.add(name);
      if (m.runtime?.baseline === false) {
        const need = m.runtime.capabilities || [];
        const ext = new Set(caps?.extended || []);
        for (const cap of need) {
          if (!ext.has(cap) && !(caps?.baseline || []).includes(cap)) {
            errors.push(`${f}: unknown capability ${cap}`);
          }
        }
      }
    }
  }

  const baseline = readJson('baseline/routes.v1.json');
  if (!baseline || !Array.isArray(baseline.routes) || baseline.routes.length < 50) {
    errors.push('baseline/routes.v1.json missing or too small');
  }

  const openapi = fs.readFileSync(path.join(C, 'openapi/jasefly.v1.yaml'), 'utf8');
  for (const needle of ['/health', '/site', '/auth/login', '/auth/me', '/capabilities']) {
    if (!openapi.includes(needle)) errors.push(`openapi missing path ${needle}`);
  }

  // OpenAPI must cover 100% of baseline paths
  if (baseline?.routes) {
    const missingOas = [];
    for (const r of baseline.routes) {
      // YAML path keys are JSON-stringified
      const key = JSON.stringify(r.path);
      if (!openapi.includes(`${key}:`) && !openapi.includes(`  ${r.path}:`)) {
        missingOas.push(r.id);
      }
    }
    if (missingOas.length) {
      errors.push(`openapi missing ${missingOas.length}/${baseline.routes.length} baseline routes (e.g. ${missingOas.slice(0, 5).join(', ')})`);
    }
  }

  /** External domain packages — Node adapter lives in package source, not registerAll. */
  const catalogPackages = (() => {
    const p = path.join(ROOT, 'release/catalog/packages.json');
    if (!fs.existsSync(p)) return new Set();
    try {
      const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
      return new Set(
        (Array.isArray(doc.packages) ? doc.packages : [])
          .map((row) => (row && typeof row.slug === 'string' ? row.slug : ''))
          .filter(Boolean),
      );
    } catch {
      return new Set();
    }
  })();

  function resolvePackageNodeEntry(slug) {
    const roots = [
      path.join(ROOT, 'Jasefly-Modules', 'modules-src'),
      path.join(ROOT, 'modules-src'),
      path.join(ROOT, 'backend', 'tests', 'fixtures', 'modules'),
    ];
    for (const base of roots) {
      const dir = path.join(base, slug);
      const mfPath = path.join(dir, 'module.json');
      if (!fs.existsSync(mfPath)) continue;
      let mf;
      try {
        mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
      } catch {
        continue;
      }
      const declared = mf?.entrypoints?.node;
      const candidates = [
        typeof declared === 'string' ? declared : null,
        'backend/node/index.ts',
        'backend/node/index.js',
        'backend/node/domain.ts',
      ].filter(Boolean);
      for (const rel of candidates) {
        const abs = path.join(dir, rel);
        if (fs.existsSync(abs)) return abs;
      }
    }
    return null;
  }

  // Host modules must be in registerAll; catalog packages must have a Node package entry.
  const registerAll = path.join(ROOT, 'runtime-node/src/modules/registerAll.ts');
  if (fs.existsSync(registerAll)) {
    const src = fs.readFileSync(registerAll, 'utf8');
    for (const name of phpModules) {
      const fileHint = name === 'module-manager' ? 'module-manager' : name;
      if (catalogPackages.has(name)) {
        const identity = path.join(ROOT, 'release/catalog/manifests', `${name}.json`);
        if (!fs.existsSync(identity)) {
          errors.push(`catalog identity missing for package module: ${name}`);
        }
        if (!resolvePackageNodeEntry(name)) {
          errors.push(`package Node entry missing for catalog module: ${name}`);
        }
        nodeModules.add(name);
        continue;
      }
      if (!src.includes(`'./${fileHint}.js'`) && !src.includes(`"./${fileHint}.js"`) && !src.includes(`./${fileHint}`)) {
        if (!fs.existsSync(path.join(ROOT, 'runtime-node/src/modules', `${fileHint}.ts`))) {
          errors.push(`Node module file missing for contracts module: ${name}`);
        }
      }
      nodeModules.add(name);
    }
  }

  // Forbid PHP bridge remnants in Node transpile
  const transpile = path.join(ROOT, 'runtime-node/src/db/sqlTranspile.ts');
  if (fs.existsSync(transpile)) {
    const t = fs.readFileSync(transpile, 'utf8');
    if (/spawnSync|SqlTranspiler\.php|JASEFLY_USE_PHP_TRANSPILER/.test(t)) {
      errors.push('runtime-node sqlTranspile still references PHP bridge');
    }
  }

  // Behavior manifests must cover 100% of baseline routes
  const behaviorIndexPath = path.join(C, 'behavior/index.v1.json');
  if (!fs.existsSync(behaviorIndexPath)) {
    errors.push('missing contracts/behavior/index.v1.json — run scripts/behavior/extract-behavior.mjs');
  } else if (baseline?.routes) {
    const bIdx = JSON.parse(fs.readFileSync(behaviorIndexPath, 'utf8'));
    if ((bIdx.count || 0) !== baseline.routes.length) {
      errors.push(
        `behavior manifests ${bIdx.count || 0} ≠ baseline routes ${baseline.routes.length}`,
      );
    }
    const ids = new Set((bIdx.routes || []).map((r) => r.id));
    for (const r of baseline.routes) {
      if (!ids.has(r.id)) errors.push(`behavior missing route ${r.id}`);
    }
  }

  const genIndex = path.join(ROOT, 'tests/parity/generated/_index.json');
  if (!fs.existsSync(genIndex)) {
    errors.push('missing tests/parity/generated/_index.json — run scripts/behavior/generate-cases.mjs');
  } else {
    const g = JSON.parse(fs.readFileSync(genIndex, 'utf8'));
    if ((g.count || 0) < (baseline?.routes?.length || 0)) {
      errors.push(`generated parity cases ${g.count || 0} < baseline routes`);
    }
  }

  // schema directory must have at least envelope schema
  const schemaDir = path.join(C, 'schema');
  if (!fs.existsSync(schemaDir) || fs.readdirSync(schemaDir).filter((f) => f.endsWith('.json')).length < 1) {
    errors.push('contracts/schema/ must contain JSON Schema files');
  }

  // Optional hard gate: Node inventory must cover 100% of baseline route IDs
  if (process.env.BASELINE_REQUIRE_FULL === '1') {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'extract-node-routes.mjs'), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, BASELINE_REQUIRE_FULL: '1' },
    });
    if (r.status !== 0) {
      errors.push('Node↔baseline route inventory incomplete (BASELINE_REQUIRE_FULL=1)');
      if (r.stdout) errors.push(r.stdout.trim().split('\n').slice(-5).join(' | '));
      if (r.stderr) errors.push(r.stderr.trim().split('\n').slice(0, 5).join(' | '));
    }
  }

  if (errors.length) {
    console.error('contracts validation FAILED:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log(`contracts validation OK (baseline routes: ${baseline.routes.length})`);
}

main();
