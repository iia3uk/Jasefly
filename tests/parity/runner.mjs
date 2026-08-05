#!/usr/bin/env node
/**
 * Parity harness: run cases against PHP_BASE and/or NODE_BASE.
 * Usage:
 *   NODE_BASE=http://127.0.0.1:3080/api/v1 node tests/parity/runner.mjs
 *   PHP_BASE=... NODE_BASE=... node tests/parity/runner.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEnvelope, scrub } from './scrub.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(__dirname, 'cases');

async function hit(base, c) {
  const url = base.replace(/\/$/, '') + c.path + (c.query || '');
  const res = await fetch(url, {
    method: c.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(c.headers || {}),
    },
    body: c.body ? JSON.stringify(c.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

function loadCases() {
  return fs
    .readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8')));
}

function assertCase(name, result, expect) {
  const problems = [];
  if (expect.status != null && result.status !== expect.status) {
    problems.push(`status ${result.status} != ${expect.status}`);
  }
  if (expect.success != null && result.json?.success !== expect.success) {
    problems.push(`success ${result.json?.success} != ${expect.success}`);
  }
  if (expect.error != null && result.json?.error !== expect.error) {
    problems.push(`error ${JSON.stringify(result.json?.error)} != ${JSON.stringify(expect.error)}`);
  }
  if (expect.data_is_array) {
    const data = result.json?.data;
    if (!Array.isArray(data) || data.length === 0) {
      problems.push(`data is not a non-empty array`);
    }
  }
  if (expect.data_contains) {
    const data = result.json?.data ?? {};
    for (const [k, v] of Object.entries(expect.data_contains)) {
      if (JSON.stringify(data[k]) !== JSON.stringify(v) && data[k] !== v) {
        if (v === true && data[k] != null) continue;
        problems.push(`data.${k} mismatch: got ${JSON.stringify(data[k])}`);
      }
    }
  }
  return problems;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const bases = [];
  if (process.env.PHP_BASE) bases.push({ name: 'php', base: process.env.PHP_BASE });
  if (process.env.NODE_BASE) bases.push({ name: 'node', base: process.env.NODE_BASE });
  if (!bases.length) {
    console.error('Set PHP_BASE and/or NODE_BASE');
    process.exit(2);
  }

  const cases = loadCases();
  /** @type {Record<string, Record<string, {status:number, json:any}>>} */
  const byRuntime = {};
  let failed = 0;

  for (const b of bases) {
    byRuntime[b.name] = {};
    for (const c of cases) {
      const result = await hit(b.base, c);
      byRuntime[b.name][c.id] = result;
      const problems = assertCase(c.id, result, c.expect || {});
      if (problems.length) {
        failed++;
        console.error(`[FAIL] ${b.name}/${c.id}: ${problems.join('; ')}`);
      } else {
        console.log(`[OK] ${b.name}/${c.id}`);
      }
    }
  }

  if (bases.length === 2) {
    for (const c of cases) {
      if (c.parity === false) {
        console.log(`[PARITY SKIP] ${c.id}`);
        continue;
      }
      const a = scrub(normalizeEnvelope(byRuntime.php[c.id]));
      const b = scrub(normalizeEnvelope(byRuntime.node[c.id]));
      if (!deepEqual(a, b)) {
        failed++;
        console.error(`[PARITY] ${c.id}: scrubbed response diverge`);
        console.error(' php', JSON.stringify(a));
        console.error(' node', JSON.stringify(b));
      } else {
        console.log(`[PARITY OK] ${c.id}`);
      }
    }
  }

  if (failed) {
    console.error(`parity failed: ${failed}`);
    process.exit(1);
  }
  console.log('parity runner OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { scrub, normalizeEnvelope, deepEqual, assertCase, loadCases, hit };
