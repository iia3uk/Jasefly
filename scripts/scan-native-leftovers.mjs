#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = [
  'webhooks', 'comments', 'analytics', 'notifications', 'newsletter', 'registration',
  'forms', 'automation', 'translate', 'support', 'blog', 'projects', 'products', 'orders', 'payments',
];

const checks = [
  [/ctx\.db\b/, 'ctx.db'],
  [/typeof fail/, 'typeof fail'],
  [/(?<![.\w])fail\s*\(/, 'bare fail('],
  [/(?<![.\w])ok\s*\(/, 'bare ok('],
  [/ModuleContext/, 'ModuleContext'],
  [/registerLegacy/, 'registerLegacy'],
  [/safeFetch/, 'safeFetch'],
  [/Parameters<typeof/, 'Parameters<typeof'],
  [/\bapp\.(get|post|put|delete|patch)\(/, 'app.METHOD'],
  [/\bcrud\./, 'crud.'],
  [/hashPassword/, 'hashPassword'],
  [/moduleSettings\(/, 'moduleSettings'],
  [/softRespond|softDecide|isModuleEnabled/, 'soft-gate remnant'],
];

for (const slug of DOMAINS) {
  const p = path.join(root, 'modules-src', slug, 'backend', 'node', 'domain.ts');
  if (!fs.existsSync(p)) {
    console.log('MISSING', slug);
    continue;
  }
  const lines = fs.readFileSync(p, 'utf8').split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [re, label] of checks) {
      if (re.test(line)) {
        console.log(`${slug}:${i + 1} [${label}] ${line.trim().slice(0, 140)}`);
        break;
      }
    }
  }
}

console.log('--- host modules ---');
for (const slug of DOMAINS) {
  const p = path.join(root, 'runtime-node', 'src', 'modules', `${slug}.ts`);
  console.log(fs.existsSync(p) ? `EXISTS ${slug}` : `gone ${slug}`);
}
