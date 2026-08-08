#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = [
  'webhooks', 'comments', 'analytics', 'notifications', 'newsletter', 'registration',
  'forms', 'automation', 'translate', 'support', 'blog', 'projects', 'products', 'orders', 'payments',
];
const FACADES = [
  'events', 'http', 'database', 'jobs', 'scheduler', 'settings', 'capabilities',
  'mail', 'notifications', 'plugins', 'passwords', 'adminResources',
];

for (const slug of DOMAINS) {
  const p = path.join(root, 'modules-src', slug, 'backend', 'node', 'domain.ts');
  let t = fs.readFileSync(p, 'utf8');
  let changed = false;
  for (const f of FACADES) {
    const re = new RegExp(`ctx\\.${f}\\.([a-zA-Z])`, 'g');
    const next = t.replace(re, `ctx.${f}().$1`);
    if (next !== t) {
      t = next;
      changed = true;
    }
  }
  if (slug === 'newsletter' && !t.includes('async function subscriberTable')) {
    t = t.replace(
      'async function requireTable(',
      `async function subscriberTable(db: { tableExists(t: string): Promise<boolean> }): Promise<string | null> {
  if (await db.tableExists('subscribers')) return 'subscribers';
  if (await db.tableExists('newsletter_subscribers')) return 'newsletter_subscribers';
  return null;
}

async function requireTable(`,
    );
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(p, t);
    console.log('fixed', slug);
  } else {
    console.log('skip', slug);
  }
}
