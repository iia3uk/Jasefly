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

/** undici keep-alive wedges php -S after ~130 requests on Linux CI — force close. */
const NO_KEEPALIVE = { Connection: 'close' };

async function loginAdmin() {
  if (adminToken) return adminToken;
  const email = meta?.adminEmail || 'admin@parity.local';
  const password = meta?.adminPassword || 'Admin123!';
  // Login both runtimes so activity/last_login side effects stay mirrored.
  const body = JSON.stringify({ email, password });
  const headers = { 'Content-Type': 'application/json', ...NO_KEEPALIVE };
  await fetch(`${PHP_BASE}/auth/login`, { method: 'POST', headers, body }).catch(() => null);
  const res = await fetch(`${NODE_BASE}/auth/login`, { method: 'POST', headers, body });
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

function truncateJson(json, max = 12000) {
  try {
    const s = JSON.stringify(json);
    if (s.length <= max) return json;
    // Keep parseable object for offline analysis (not used by compare).
    return { _truncated: true, _bytes: s.length, data: json?.data ?? null, error: json?.error ?? null, success: json?.success };
  } catch {
    return null;
  }
}

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const msg = String(err.message || err);
  return /This operation was aborted|The operation was aborted|aborted/i.test(msg);
}

function isTransportError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|UND_ERR_/i.test(msg);
}

/**
 * Infrastructure failure — not a PHP↔Node behavioral diverge.
 * Runner exits 2; run-all must not count these as parity fails.
 */
function infraError(code, message, details = {}) {
  const e = new Error(message);
  e.name = 'InfraError';
  e.infra = true;
  e.code = code;
  e.details = details;
  return e;
}

async function hit(base, c, token, runtimeLabel = 'runtime') {
  const pth = applyPath(c.path, c.path_params);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...NO_KEEPALIVE,
    ...(c.headers || {}),
  };
  if (c.auth === 'admin' && token) headers.Authorization = `Bearer ${token}`;
  if (c.auth === 'invalid') headers.Authorization = 'Bearer totally-invalid-token';
  if (c.auth === 'mcp') headers.Authorization = `Bearer ${mcpToken}`;

  const fetchMs = Number(process.env.BEHAVIOR_FETCH_MS || 20000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), fetchMs);
  const started = Date.now();
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
    return {
      status: res.status,
      json,
      headers: Object.fromEntries(res.headers.entries()),
      elapsed_ms: Date.now() - started,
      runtime: runtimeLabel,
    };
  } catch (err) {
    const elapsed = Date.now() - started;
    if (isAbortError(err)) {
      throw infraError(
        'FETCH_TIMEOUT',
        `INFRA FETCH_TIMEOUT runtime=${runtimeLabel} ${c.method || 'GET'} ${pth} elapsed_ms=${elapsed} limit_ms=${fetchMs}`,
        { runtime: runtimeLabel, path: pth, method: c.method || 'GET', elapsed_ms: elapsed, limit_ms: fetchMs },
      );
    }
    if (isTransportError(err)) {
      throw infraError(
        'RUNTIME_TRANSPORT',
        `INFRA RUNTIME_TRANSPORT runtime=${runtimeLabel} ${c.method || 'GET'} ${pth} elapsed_ms=${elapsed} err=${err.message || err}`,
        { runtime: runtimeLabel, path: pth, method: c.method || 'GET', elapsed_ms: elapsed, err: String(err.message || err) },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function probeHealth(base, label) {
  const fetchMs = 5000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), fetchMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      signal: ac.signal,
      headers: { ...NO_KEEPALIVE, Accept: 'application/json' },
    });
    return { label, ok: res.status === 200, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { label, ok: false, status: 0, ms: Date.now() - started, error: String(e.message || e) };
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
    const pe = String(pj?.error ?? '');
    const ne = String(nj?.error ?? '');
    if (pe !== ne) {
      problems.push(`error php=${JSON.stringify(pj?.error)} node=${JSON.stringify(nj?.error)}`);
    }
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
  let infra = 0;
  const byModule = {};
  const results = [];
  let infraHalt = null;

  const nodePid = process.env.BEHAVIOR_NODE_PID || '?';
  const phpPid = process.env.BEHAVIOR_PHP_PID || '?';
  const fetchMs = Number(process.env.BEHAVIOR_FETCH_MS || 20000);
  const healthEvery = Number(process.env.BEHAVIOR_HEALTH_EVERY || 25);

  console.log(
    `behavior-runner: ${cases.length} cases php=${PHP_BASE} node=${NODE_BASE} fetch_ms=${fetchMs} health_every=${healthEvery} pids node=${nodePid} php=${phpPid}`,
  );

  const progressEvery = Number(process.env.BEHAVIOR_PROGRESS_EVERY || 50);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    byModule[c.module] ||= { pass: 0, fail: 0 };
    const tables = c.compare?.db ? c.database_tables || [] : [];
    const phpDbBefore = tables.length ? dumpTables(meta?.phpDb, tables) : null;
    const nodeDbBefore = tables.length ? dumpTables(meta?.nodeDb, tables) : null;
    const scenario = String(c.id).split('::').pop() || '';

    if (healthEvery > 0 && i > 0 && i % healthEvery === 0) {
      const [ph, nh] = await Promise.all([probeHealth(PHP_BASE, 'php'), probeHealth(NODE_BASE, 'node')]);
      console.log(
        `behavior-runner health @${i}: php=${ph.status}/${ph.ms}ms node=${nh.status}/${nh.ms}ms pids node=${nodePid} php=${phpPid}`,
      );
      if (!ph.ok || !nh.ok) {
        infraHalt = infraError(
          'HEALTH_FAIL',
          `INFRA HEALTH_FAIL at case_index=${i} php=${JSON.stringify(ph)} node=${JSON.stringify(nh)} pids node=${nodePid} php=${phpPid}`,
          { php: ph, node: nh, case_index: i },
        );
        break;
      }
    }

    if (process.env.BEHAVIOR_VERBOSE === '1') {
      console.log(`[>] ${c.method || 'GET'} ${c.path} ::${scenario} module=${c.module}`);
    }

    let php;
    let node;
    try {
      // Sequential — PHP built-in server is single-threaded.
      // On PHP timeout: do NOT health-probe the same process (worker still busy after
      // client abort) — signal PHP_STALL (exit 3) so run-all can kill/restart and resume.
      const once = async (base, label) => {
        try {
          return await hit(base, c, adminToken, label);
        } catch (e) {
          if (!e?.infra) throw e;
          if (label === 'php') {
            throw infraError(
              'PHP_STALL',
              `INFRA PHP_STALL ${c.method || 'GET'} ${applyPath(c.path, c.path_params)} after ${e.code || 'error'} elapsed_ms=${e.details?.elapsed_ms ?? '?'} — php -S worker likely wedged; run-all should restart PHP and resume`,
              {
                runtime: 'php',
                cause: e.code,
                path: applyPath(c.path, c.path_params),
                method: c.method || 'GET',
                elapsed_ms: e.details?.elapsed_ms,
                resume_hint: true,
              },
            );
          }
          // Node can usually accept a second connection — probe + one retry.
          await new Promise((r) => setTimeout(r, 400));
          const health = await probeHealth(base, label);
          if (!health.ok) {
            throw infraError(
              'RUNTIME_DOWN',
              `INFRA RUNTIME_DOWN runtime=${label} after ${e.code || 'error'}; health=${JSON.stringify(health)} pids node=${nodePid} php=${phpPid}`,
              { cause: e.details || e.message, health, runtime: label },
            );
          }
          console.error(
            `[infra-retry] runtime=${label} case=${c.id} code=${e.code} elapsed_ms=${e.details?.elapsed_ms ?? '?'} health_ok=${health.ok}`,
          );
          return hit(base, c, adminToken, label);
        }
      };
      php = await once(PHP_BASE, 'php');
      node = await once(NODE_BASE, 'node');
    } catch (e) {
      if (e?.infra) {
        infra++;
        infraHalt = e;
        console.error(`[INFRA] ${c.id}: ${e.message}`);
        console.error(
          `[INFRA] details=${JSON.stringify({
            code: e.code,
            ...(e.details || {}),
            pids: { node: nodePid, php: phpPid },
          })}`,
        );
        // Do NOT count as behavioral fail — stop the chunk immediately.
        break;
      }
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
      if (process.env.BEHAVIOR_VERBOSE === '1') {
        console.log(`[OK] ${c.id} php_ms=${php.elapsed_ms} node_ms=${node.elapsed_ms}`);
      }
    }
    if (progressEvery > 0 && (i + 1) % progressEvery === 0) {
      console.log(
        `behavior-runner progress ${i + 1}/${cases.length} pass=${passed} fail=${failed} infra=${infra}`,
      );
    }
  }

  const outDir = path.join(root, 'tmp', 'behavior-results');
  fs.mkdirSync(outDir, { recursive: true });
  // Count only completed parity comparisons (infra aborts are not behavioral totals).
  const completed = passed + failed;
  let summary = {
    at: new Date().toISOString(),
    passed,
    failed,
    infra,
    total: completed,
    planned: cases.length,
    byModule,
    results,
    infra_halt: infraHalt
      ? { code: infraHalt.code, message: infraHalt.message, details: infraHalt.details || null }
      : null,
  };
  const outFile = mergePath || path.join(outDir, 'last.json');
  const chunkMeta = { offset: caseOffset, limit: cases.length, passed, failed, infra, completed };
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
      infra: (prev.infra || 0) + infra,
      total: (prev.total || 0) + completed,
      planned: (prev.planned || 0) + cases.length,
      byModule: mergedBy,
      results: [...(prev.results || []), ...results],
      chunks: [...(prev.chunks || []), chunkMeta],
      infra_halt: summary.infra_halt || prev.infra_halt || null,
    };
  } else {
    summary.chunks = [chunkMeta];
  }
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  if (outFile !== path.join(outDir, 'last.json')) {
    fs.copyFileSync(outFile, path.join(outDir, 'last.json'));
  }
  console.log(
    `behavior-runner done: passed=${passed} failed=${failed} infra=${infra} total=${completed} planned=${cases.length}`,
  );
  console.log(`summary → ${outFile}`);

  if (infraHalt) {
    // Exit 3 = recoverable PHP stall (run-all restarts php -S and resumes offset).
    // Exit 2 = hard infrastructure failure.
    const stall =
      infraHalt.code === 'PHP_STALL' ||
      (infraHalt.details?.runtime === 'php' &&
        ['FETCH_TIMEOUT', 'RUNTIME_TRANSPORT', 'RUNTIME_DOWN'].includes(String(infraHalt.code)));
    console.error(`INFRA: ${infraHalt.message}`);
    process.exit(stall ? 3 : 2);
  }

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
  if (e?.infra) {
    const stall = e.code === 'PHP_STALL' || e.details?.runtime === 'php';
    console.error(`INFRA: ${e.message}`);
    process.exit(stall ? 3 : 2);
  }
  console.error(e);
  process.exit(1);
});
