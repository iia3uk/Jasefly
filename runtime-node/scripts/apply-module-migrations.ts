/**
 * Apply first-party module SQL migrations under backend/src/Modules to DB_PATH.
 * Invoked by scripts/behavior/apply-module-migrations.mjs / seed-dual-db.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/Database.js';
import { transpileSql } from '../src/db/sqlTranspile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error('DB_PATH required');
  process.exit(2);
}

const modulesRoot = path.join(root, 'backend/src/Modules');
const files: { key: string; abs: string }[] = [];
for (const mod of fs.readdirSync(modulesRoot)) {
  const migDir = path.join(modulesRoot, mod, 'migrations');
  if (!fs.existsSync(migDir)) continue;
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    files.push({ key: `${mod}/${f}`, abs: path.join(migDir, f) });
  }
}

function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const line of sql.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('--') || t.startsWith('#')) continue;
    buf += `${line}\n`;
    if (t.endsWith(';')) {
      const stmt = buf.trim().replace(/;\s*$/, '');
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim().replace(/;\s*$/, ''));
  return out.filter(Boolean);
}

const db = await createDatabase({
  name: 't',
  url: 'http://127.0.0.1',
  env: 'test',
  timezone: 'UTC',
  port: 3081,
  jwtSecret: process.env.JWT_SECRET || 'x'.repeat(32),
  jwtTtl: 3600,
  refreshTtl: 86400,
  mcpApiToken: process.env.MCP_API_TOKEN || 'x',
  corsOrigins: ['*'],
  storagePath: process.env.STORAGE_PATH || '.',
  runtime: 'node-vps',
  db: {
    driver: 'sqlite',
    host: '',
    port: 0,
    name: '',
    user: '',
    pass: '',
    path: dbPath,
    charset: 'utf8mb4',
  },
});

await db.run(`CREATE TABLE IF NOT EXISTS _module_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration VARCHAR(255) NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
)`);

const done = new Set(
  (await db.all('SELECT migration FROM _module_migrations')).map((r) => String(r.migration)),
);
let applied = 0;
let skipped = 0;
const errors: string[] = [];
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

for (const f of files) {
  if (done.has(f.key)) continue;
  const raw = fs.readFileSync(f.abs, 'utf8');
  let okFile = true;
  for (const stmt of splitStatements(raw)) {
    for (const p of transpileSql(stmt, 'sqlite')) {
      try {
        await db.run(p);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/duplicate|already exists|exists/i.test(msg)) continue;
        // Tolerate MySQL-only leftovers so seed still creates most tables.
        okFile = false;
        errors.push(`${f.key}: ${msg.slice(0, 160)}`);
        break;
      }
    }
    if (!okFile) break;
  }
  if (okFile) {
    await db.run('INSERT INTO _module_migrations (migration, applied_at) VALUES (?, ?)', [f.key, now]);
    applied++;
  } else {
    skipped++;
  }
}

await db.close();
process.stdout.write(
  JSON.stringify({ module_migrations_applied: applied, skipped, total: files.length, errors: errors.slice(0, 20) }) +
    '\n',
);
