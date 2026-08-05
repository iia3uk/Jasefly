#!/usr/bin/env node
/**
 * Behavioral parity runner — generated cases against PHP_BASE + NODE_BASE.
 *
 * Usage:
 *   PHP_BASE=... NODE_BASE=... node tests/parity/behavior-runner.mjs
 *   BEHAVIOR_META=tmp/behavior-xxx/meta.json node tests/parity/behavior-runner.mjs  (uses meta tokens)
 *
 * Compares: HTTP status, envelope, deep JSON (scrubbed), optional DB table snapshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeEnvelope, scrub } from './scrub.mjs';
import { scrubRows } from './db-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const generatedDir = path.join(__dirname, 'generated');
const filterModule = process.env.BEHAVIOR_MODULE || '';
const maxCases = Number(process.env.BEHAVIOR_MAX || 0);
const caseOffset = Number(process.env.BEHAVIOR_OFFSET || 0);
const caseLimit = Number(process.env.BEHAVIOR_LIMIT || 0);
const failFast = process.env.BEHAVIOR_FAIL_FAST === '1';
/** Comma list of scenario suffixes: unauthenticated,invalid-token,happy-get,… or empty=all */
const scenarioFilter = (process.env.BEHAVIOR_SCENARIOS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** auth = fail only on unauthenticated/invalid-token; all = any failure */
const requireMode = process.env.BEHAVIOR_REQUIRE || 'all';
/** When set, merge this chunk into an existing summary (chunked run-all). */
const mergePath = process.env.BEHAVIOR_MERGE_INTO || '';

function loadMeta() {
  const p = process.env.BEHAVIOR_META;
  if (!p || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const meta = loadMeta();
const PHP_BASE = (process.env.PHP_BASE || '').replace(/\/$/, '');
const NODE_BASE = (process.env.NODE_BASE || '').replace(/\/$/, '');
if (!PHP_BASE || !NODE_BASE) {
  console.error('Set PHP_BASE and NODE_BASE (or use scripts/behavior/run-all.mjs)');
  process.exit(2);
}

let adminToken = process.env.BEHAVIOR_ADMIN_TOKEN || '';
const mcpToken = process.env.BEHAVIOR_MCP_TOKEN || meta?.mcpToken || 'behavior-mcp-token';

async function loginAdmin() {
  if (adminToken) return adminToken;
  const email = meta?.adminEmail || 'admin@parity.local';
  const password = meta?.adminPassword || 'Admin123!';
  const res = await fetch(`${NODE_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  adminToken = json?.data?.access_token || '';
  if (!adminToken) {
    console.warn('WARN: admin login failed on Node — auth=admin scenarios may 401');
  }
  return adminToken;
}

/**
 * Structural fingerprint for happy-get shape parity.
 * Compares envelope type + top-level data keys / array emptiness.
 * Nested value types (null vs {}) are module-depth work, not gate infra.
 */
function jsonShape(value, depth = 0) {
  if (value === null || value === undefined) return { t: 'null' };
  if (Array.isArray(value)) {
    return {
      t: 'array',
      empty: value.length === 0,
      e: value.length && depth < 2 ? jsonShape(value[0], depth + 1) : null,
    };
  }
  if (typeof value === 'object') {
    if (value._csv) return { t: 'csv' };
    const keys = Object.keys(value).sort();
    // Only key sets at depth 0–1 (envelope + data); skip deep field typing.
    if (depth >= 1) return { t: 'object', k: keys };
    return { t: 'object', k: keys };
  }
  return { t: typeof value };
}

function applyPath(template, params) {
  let p = template;
  for (const [k, v] of Object.entries(params || {})) {
    p = p.replace(`{${k}}`, encodeURIComponent(String(v)));
  }
  return p;
}

function truncateJson(json, max = 600) {
  try {
    const s = JSON.stringify(json);
    return s.length > max ? s.slice(0, max) + '…' : json;
  } catch {
    return null;
  }
}

async function hit(base, c, token) {
  const pth = applyPath(c.path, c.path_params);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(c.headers || {}),
  };
  if (c.auth === 'admin' && token) headers.Authorization = `Bearer ${token}`;
  if (c.auth === 'invalid') headers.Authorization = 'Bearer totally-invalid-token';
  if (c.auth === 'mcp') headers.Authorization = `Bearer ${mcpToken}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(process.env.BEHAVIOR_FETCH_MS || 20000));
  try {
    const res = await fetch(base + pth, {
      method: c.method || 'GET',
      headers,
      body: c.body !== undefined && c.method !== 'GET' ? JSON.stringify(c.body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    const ct = res.headers.get('content-type') || '';
    let json = null;
    if (/text\/csv|octet-stream/i.test(ct) || (text.startsWith('\uFEFF') && text.includes(','))) {
      json = { _csv: true, _bytes: text.length, success: true, data: null };
    } else if (!String(text || '').trim()) {
      // PHP media stream / bare exits: empty body — success only for 2xx.
      json = { success: res.status >= 200 && res.status < 300, data: null };
    } else if (/Fatal error|Uncaught Error/i.test(text)) {
      json = { success: false, error: 'php_fatal', data: null, _raw: text.slice(0, 240) };
    } else {
      try {
        json = JSON.parse(text);
      } catch {
        // PHP may emit JSON with notices before payload — try last {...} object
        const m = String(text).match(/\{[\s\S]*\}\s*$/);
        if (m) {
          try {
            json = JSON.parse(m[0]);
          } catch {
            json = { _raw: text.slice(0, 400), success: res.status < 400, data: null };
          }
        } else {
          json = { _raw: text.slice(0, 400), success: res.status < 400, data: null };
        }
      }
    }
    return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
  } finally {
    clearTimeout(timer);
  }
}

function dumpTables(dbPath, tables) {
  if (!dbPath || !tables?.length || !fs.existsSync(dbPath)) return null;
  const script = `
const Database = require('better-sqlite3');
const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
const tables = ${JSON.stringify(tables)};
const out = {};
for (const t of tables) {
  try {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    out[t] = exists ? db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid LIMIT 200').all() : null;
  } catch (e) { out[t] = { _error: String(e.message) }; }
}
db.close();
process.stdout.write(JSON.stringify(out));
`;
  const r = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(root, 'runtime-node'),
    encoding: 'utf8',
    timeout: 15000,
  });
  if (r.status !== 0) return { _error: r.stderr || 'dump failed' };
  try {
    return JSON.parse(r.stdout || '{}');
  } catch {
    return { _error: 'parse dump' };
  }
}

function compareCase(c, php, node, phpDbBefore, phpDbAfter, nodeDbBefore, nodeDbAfter) {
  const problems = [];
  const cmp = c.compare || {};

  if (cmp.http_status !== false) {
    if (Array.isArray(c.expect?.status) && c.expect.status.length) {
      if (!c.expect.status.includes(php.status)) problems.push(`php status ${php.status} not in ${c.expect.status}`);
      if (!c.expect.status.includes(node.status)) problems.push(`node status ${node.status} not in ${c.expect.status}`);
    }
    if (php.status !== node.status) problems.push(`status php=${php.status} node=${node.status}`);
  }

  const pj = normalizeEnvelope(php.json);
  const nj = normalizeEnvelope(node.json);

  if (cmp.json_envelope !== false) {
    if (typeof pj?.success === 'boolean' && typeof nj?.success === 'boolean' && pj.success !== nj.success) {
      problems.push(`success php=${pj.success} node=${nj.success}`);
    }
  }

  if (cmp.error_code !== false && pj?.success === false && nj?.success === false) {
    // Same failure class is enough for auth/MCP probes (localized PHP strings vs English Node).
    const pe = String(pj?.error ?? '');
    const ne = String(nj?.error ?? '');
    const notFound = (s) => /Not found|не найден|не найдена|missing|does not exist/i.test(s);
    const sameClass =
      pe === ne ||
      (!pe && !ne) ||
      (/MCP|mcp/.test(pe) && /MCP|mcp/.test(ne)) ||
      (/Unauthorized|не авториз/i.test(pe) && /Unauthorized|Invalid refresh/i.test(ne)) ||
      (/Unauthorized|Invalid refresh/i.test(pe) && /Unauthorized|Invalid refresh/i.test(ne)) ||
      (notFound(pe) && notFound(ne)) ||
      // PHP sometimes omits error string on 404 while Node sends "Not found"
      ((!pe || notFound(pe)) && (!ne || notFound(ne)) && (php.status === 404 || node.status === 404)) ||
      // Localized client errors (RU PHP copy vs EN Node) — same status + both failed is enough.
      (php.status === node.status && php.status >= 400 && php.status < 500 && pj?.success === false && nj?.success === false);
    if (!sameClass) problems.push(`error php=${JSON.stringify(pj?.error)} node=${JSON.stringify(nj?.error)}`);
  }

  if (cmp.deep_json === 'shape' || cmp.deep_json === 'soft') {
    const envelopeShape = (j) => {
      const data = j?.data;
      let dt = 'null';
      if (data !== null && data !== undefined) dt = Array.isArray(data) ? 'array' : typeof data;
      // Treat empty object as null-ish for singleton endpoints.
      if (dt === 'object' && data && Object.keys(data).length === 0) dt = 'null';
      // List wrappers still present after normalize.
      if (dt === 'object' && data && Array.isArray(data.items)) dt = 'array';
      return {
        // Prefer explicit success; otherwise infer from presence of data key.
        success: j?.success === false ? false : true,
        data: dt,
        error: j?.success === false && j?.error ? 'err' : null,
      };
    };
    const ps = envelopeShape(pj);
    const ns = envelopeShape(nj);
    const dataCompat =
      ps.data === ns.data ||
      (ps.success &&
        ns.success &&
        ((ps.data === 'null' && (ns.data === 'object' || ns.data === 'array')) ||
          (ns.data === 'null' && (ps.data === 'object' || ps.data === 'array'))));
    // error string presence is covered by error_code sameClass; shape = success + data kind
    if (ps.success !== ns.success || !dataCompat) {
      problems.push(`JSON shape diverge php=${JSON.stringify(ps)} node=${JSON.stringify(ns)}`);
    }
  } else if (cmp.deep_json) {
    if (JSON.stringify(scrub(pj)) !== JSON.stringify(scrub(nj))) {
      problems.push('deep JSON diverge after scrub');
    }
  }

  if (cmp.db && c.database_tables?.length && phpDbAfter && nodeDbAfter) {
    for (const t of c.database_tables) {
      const a = scrubRows(phpDbAfter[t] || []);
      const b = scrubRows(nodeDbAfter[t] || []);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        problems.push(`db table ${t} diverge (rows php=${a.length} node=${b.length})`);
      }
    }
  }

  return problems;
}

function loadCases() {
  if (!fs.existsSync(generatedDir)) {
    console.error('No tests/parity/generated — run scripts/behavior/generate-cases.mjs');
    process.exit(2);
  }
  let files = fs
    .readdirSync(generatedDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort();
  let cases = files.map((f) => JSON.parse(fs.readFileSync(path.join(generatedDir, f), 'utf8')));
  if (filterModule) cases = cases.filter((c) => c.module === filterModule);
  if (scenarioFilter.length) {
    cases = cases.filter((c) => scenarioFilter.some((s) => c.id.endsWith('::' + s) || c.id.includes('::' + s)));
  }
  if (maxCases > 0) cases = cases.slice(0, maxCases);
  if (caseOffset > 0 || caseLimit > 0) {
    cases = cases.slice(caseOffset, caseLimit > 0 ? caseOffset + caseLimit : undefined);
  }
  return cases;
}

async function main() {
  await loginAdmin();
  const cases = loadCases();
  let failed = 0;
  let passed = 0;
  const byModule = {};
  const results = [];

  console.log(`behavior-runner: ${cases.length} cases php=${PHP_BASE} node=${NODE_BASE}`);

  const progressEvery = Number(process.env.BEHAVIOR_PROGRESS_EVERY || 50);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    byModule[c.module] ||= { pass: 0, fail: 0 };
    const tables = c.compare?.db ? c.database_tables || [] : [];
    const phpDbBefore = tables.length ? dumpTables(meta?.phpDb, tables) : null;
    const nodeDbBefore = tables.length ? dumpTables(meta?.nodeDb, tables) : null;

    let php;
    let node;
    try {
      // Sequential — PHP built-in server is single-threaded; retry once on abort.
      const once = async (base) => {
        try {
          return await hit(base, c, adminToken);
        } catch (e) {
          const msg = String(e.message || e);
          if (/abort|fetch failed|ECONNRESET|socket/i.test(msg)) {
            await new Promise((r) => setTimeout(r, 400));
            return hit(base, c, adminToken);
          }
          throw e;
        }
      };
      php = await once(PHP_BASE);
      node = await once(NODE_BASE);
    } catch (e) {
      failed++;
      byModule[c.module].fail++;
      results.push({ id: c.id, ok: false, problems: [String(e.message || e)] });
      console.error(`[FAIL] ${c.id}: ${e.message || e}`);
      if (failFast) break;
      continue;
    }

    const phpDbAfter = tables.length ? dumpTables(meta?.phpDb, tables) : null;
    const nodeDbAfter = tables.length ? dumpTables(meta?.nodeDb, tables) : null;

    const problems = compareCase(c, php, node, phpDbBefore, phpDbAfter, nodeDbBefore, nodeDbAfter);
    if (problems.length) {
      failed++;
      byModule[c.module].fail++;
      results.push({
        id: c.id,
        module: c.module,
        ok: false,
        problems,
        php: php.status,
        node: node.status,
        phpBody: truncateJson(php.json),
        nodeBody: truncateJson(node.json),
      });
      console.error(`[FAIL] ${c.id}: ${problems.join('; ')}`);
      if (failFast) break;
    } else {
      passed++;
      byModule[c.module].pass++;
      results.push({ id: c.id, module: c.module, ok: true });
      if (process.env.BEHAVIOR_VERBOSE === '1') console.log(`[OK] ${c.id}`);
    }
    if (progressEvery > 0 && (i + 1) % progressEvery === 0) {
      console.log(`behavior-runner progress ${i + 1}/${cases.length} pass=${passed} fail=${failed}`);
    }
  }

  const outDir = path.join(root, 'tmp', 'behavior-results');
  fs.mkdirSync(outDir, { recursive: true });
  let summary = {
    at: new Date().toISOString(),
    passed,
    failed,
    total: cases.length,
    byModule,
    results,
  };
  const outFile = mergePath || path.join(outDir, 'last.json');
  if (mergePath && fs.existsSync(mergePath)) {
    const prev = JSON.parse(fs.readFileSync(mergePath, 'utf8'));
    const mergedBy = { ...(prev.byModule || {}) };
    for (const [mod, st] of Object.entries(byModule)) {
      mergedBy[mod] ||= { pass: 0, fail: 0 };
      mergedBy[mod].pass += st.pass;
      mergedBy[mod].fail += st.fail;
    }
    summary = {
      at: new Date().toISOString(),
      passed: (prev.passed || 0) + passed,
      failed: (prev.failed || 0) + failed,
      total: (prev.total || 0) + cases.length,
      byModule: mergedBy,
      results: [...(prev.results || []), ...results],
      chunks: [...(prev.chunks || []), { offset: caseOffset, limit: cases.length, passed, failed }],
    };
  }
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  if (outFile !== path.join(outDir, 'last.json')) {
    fs.copyFileSync(outFile, path.join(outDir, 'last.json'));
  }
  console.log(`behavior-runner done: passed=${passed} failed=${failed} total=${cases.length}`);
  console.log(`summary → ${outFile}`);
  const authFailed = summary.results.filter(
    (r) => !r.ok && (String(r.id).includes('::unauthenticated') || String(r.id).includes('::invalid-token')),
  );
  if (requireMode === 'auth') {
    console.log(`BEHAVIOR_REQUIRE=auth → auth_failed=${authFailed.length}`);
    process.exit(authFailed.length ? 1 : 0);
  }
  process.exit(summary.failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
