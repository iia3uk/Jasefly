#!/usr/bin/env node
/**
 * Auto-compute per-module status from behavior-runner results + inventory gates.
 * Writes docs/dual-runtime-parity-progress.md — NEVER set done manually.
 *
 * done <=> module has manifests AND fail=0 AND pass>0 AND at least one happy-get
 *         (or other non-auth) scenario passed in the last run.
 * Auth-only green runs leave modules as partial (security gate ≠ full behavior).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resultsPath = path.join(root, 'tmp/behavior-results/last.json');
const behaviorIndex = path.join(root, 'contracts/behavior/index.v1.json');
const outMd = path.join(root, 'docs/dual-runtime-parity-progress.md');
const outJson = path.join(root, 'contracts/behavior/module-status.v1.json');

const baseline = JSON.parse(fs.readFileSync(path.join(root, 'contracts/baseline/routes.v1.json'), 'utf8'));
const modules = [...new Set(baseline.routes.map((r) => r.module))].sort();
for (const extra of ['portfolio', 'template']) {
  if (!modules.includes(extra)) modules.push(extra);
}

let results = { byModule: {}, passed: 0, failed: 0, total: 0, results: [] };
if (fs.existsSync(resultsPath)) {
  results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
}

const bIndex = fs.existsSync(behaviorIndex)
  ? JSON.parse(fs.readFileSync(behaviorIndex, 'utf8'))
  : { modules: {}, count: 0 };

function moduleScenarioFlags(mod) {
  const mine = (results.results || []).filter((r) => r.module === mod);
  let authPass = 0;
  let authFail = 0;
  let deepPass = 0;
  let deepFail = 0;
  for (const r of mine) {
    const id = String(r.id);
    const isAuth = id.includes('::unauthenticated') || id.includes('::invalid-token');
    if (isAuth) {
      if (r.ok) authPass++;
      else authFail++;
    } else {
      if (r.ok) deepPass++;
      else deepFail++;
    }
  }
  return { authPass, authFail, deepPass, deepFail };
}

const rows = [];
let doneCount = 0;
let authGreenCount = 0;
for (const mod of modules) {
  const stats = results.byModule?.[mod] || { pass: 0, fail: 0 };
  const manifests = bIndex.modules?.[mod] || 0;
  const httpSurface = baseline.routes.some((r) => r.module === mod);
  const flags = moduleScenarioFlags(mod);
  let status = 'partial';
  if (!httpSurface) {
    status = 'n/a';
  } else if (
    manifests > 0 &&
    stats.fail === 0 &&
    stats.pass > 0 &&
    flags.deepPass > 0 &&
    flags.deepFail === 0 &&
    flags.authFail === 0
  ) {
    status = 'done';
    doneCount++;
  } else if (manifests > 0 && flags.authPass > 0 && flags.authFail === 0 && flags.deepPass === 0) {
    status = 'partial'; // auth-green only
    authGreenCount++;
  } else if (manifests === 0) {
    status = 'partial';
  } else {
    status = 'partial';
  }
  rows.push({
    module: mod,
    contract: manifests > 0 || !httpSurface,
    behavior_manifests: manifests,
    parity_pass: stats.pass,
    parity_fail: stats.fail,
    auth_pass: flags.authPass,
    auth_fail: flags.authFail,
    deep_pass: flags.deepPass,
    deep_fail: flags.deepFail,
    status,
  });
}

const doc = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: fs.existsSync(resultsPath) ? 'tmp/behavior-results/last.json' : null,
  done_count: doneCount,
  auth_green_only_count: authGreenCount,
  module_count: rows.filter((r) => r.status !== 'n/a').length,
  verdict_a_ready:
    doneCount === rows.filter((r) => r.status !== 'n/a').length &&
    results.failed === 0 &&
    results.total > 0 &&
    authGreenCount === 0,
  modules: rows,
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(doc, null, 2) + '\n');

let md = `# Dual-runtime parity progress (AUTO)\n\n`;
md += `**Generated:** ${doc.generated_at}  \n`;
md += `**Do not edit status by hand.** Source: behavior-runner → \`module-status.mjs\`.  \n`;
md += `**done modules:** ${doneCount}/${doc.module_count} (auth-green-only: ${authGreenCount})  \n`;
md += `**behavior cases (last run):** pass=${results.passed} fail=${results.failed} total=${results.total}  \n`;
md += `**verdict A ready (modules):** ${doc.verdict_a_ready ? 'YES' : 'NO'}\n\n`;
md += `| Module | Manifests | Auth pass/fail | Deep pass/fail | Status |\n`;
md += `| --- | ---: | --- | --- | --- |\n`;
for (const r of rows) {
  md += `| ${r.module} | ${r.behavior_manifests} | ${r.auth_pass}/${r.auth_fail} | ${r.deep_pass}/${r.deep_fail} | **${r.status}** |\n`;
}
md += `\n## Rules\n\n`;
md += `- \`done\` only when manifests>0, fail=0, and **deep** scenarios (happy-get / missing-resource / …) passed\n`;
md += `- Auth-only CI gate leaves modules \`partial\` even if auth_fail=0\n`;
md += `- \`n/a\` = no HTTP baseline surface (portfolio/template)\n`;
fs.writeFileSync(outMd, md);
console.log(`Wrote ${outMd}`);
console.log(`Wrote ${outJson}`);
console.log(`done=${doneCount}/${doc.module_count} auth_green_only=${authGreenCount} verdict_a_modules=${doc.verdict_a_ready}`);
