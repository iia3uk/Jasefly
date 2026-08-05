#!/usr/bin/env node
/**
 * Frontend dual parity smoke — same API client calls against PHP_BASE and NODE_BASE.
 * Fails if response shapes diverge. No runtime-specific branches in assertions.
 *
 * Usage: PHP_BASE=... NODE_BASE=... node scripts/behavior/frontend-dual-smoke.mjs
 */
import { scrub, normalizeEnvelope } from '../../tests/parity/scrub.mjs';

const PHP_BASE = (process.env.PHP_BASE || '').replace(/\/$/, '');
const NODE_BASE = (process.env.NODE_BASE || '').replace(/\/$/, '');
if (!PHP_BASE || !NODE_BASE) {
  console.error('Set PHP_BASE and NODE_BASE');
  process.exit(2);
}

/** Same calls the SPA public shell makes (no if-php / if-node adapters). */
const CALLS = [
  { id: 'health', path: '/health', mode: 'full' },
  { id: 'capabilities', path: '/capabilities', mode: 'capabilities' },
  { id: 'site', path: '/site', mode: 'site' },
];

async function hit(base, path) {
  const res = await fetch(base + path, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: normalizeEnvelope(json) };
}

/** Contract projection FE relies on — same function for both runtimes. */
function project(mode, payload) {
  const env = scrub(payload.json);
  if (mode === 'full') return { status: payload.status, json: env };
  if (mode === 'capabilities') {
    const d = env?.data || {};
    return {
      status: payload.status,
      baseline: [...(d.baseline || [])].sort(),
      extended: [...(d.extended || [])].sort(),
      available: [...(d.available || [])].sort(),
    };
  }
  // site: structural + plugin set (deep plugin settings may still diverge by module depth)
  const d = env?.data || {};
  // Plugin set may differ slightly (template off, newsletter seed row) — compare gates FE uses.
  return {
    status: payload.status,
    keys: Object.keys(d).sort(),
    has_home: !!d.home_page,
    has_lazy: d.lazy_loader_page != null,
    portfolio_on: d.portfolio != null,
    translate_on: d.translate != null,
    hero_on: d.hero != null,
  };
}

let failed = 0;
for (const c of CALLS) {
  const php = await hit(PHP_BASE, c.path);
  const node = await hit(NODE_BASE, c.path);
  const a = project(c.mode, php);
  const b = project(c.mode, node);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`[FAIL] frontend-dual ${c.id}`);
    console.error(' php', JSON.stringify(a));
    console.error(' node', JSON.stringify(b));
    failed++;
  } else {
    console.log(`[OK] frontend-dual ${c.id}`);
  }
}
process.exit(failed ? 1 : 0);
