import fs from 'node:fs';
import path from 'node:path';
import { CONTRACTS_ROOT } from '../config.js';
import type { Database } from './Database.js';
import { transpileSql } from './sqlTranspile.js';

interface MigIndex {
  install_only: string[];
  incremental: string[];
}

async function ensureMeta(db: Database): Promise<void> {
  const driver = db.driver();
  if (driver === 'sqlite') {
    await db.run(
      `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, migration VARCHAR(255) NOT NULL UNIQUE, applied_at TEXT NOT NULL)`,
    );
  } else if (driver === 'pgsql') {
    await db.run(
      `CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, migration VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
  } else {
    await db.run(
      `CREATE TABLE IF NOT EXISTS _migrations (id INT AUTO_INCREMENT PRIMARY KEY, migration VARCHAR(255) NOT NULL UNIQUE, applied_at DATETIME NOT NULL)`,
    );
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
      const stmt = buf.trim();
      if (stmt && stmt !== ';') out.push(stmt.replace(/;\s*$/, ''));
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim().replace(/;\s*$/, ''));
  return out.filter(Boolean);
}

export async function runMigrations(db: Database, opts: { install?: boolean } = {}): Promise<{
  applied: string[];
  pending: string[];
  just_applied: string[];
}> {
  await ensureMeta(db);
  const index = JSON.parse(
    fs.readFileSync(path.join(CONTRACTS_ROOT, 'migrations/index.v1.json'), 'utf8'),
  ) as MigIndex;

  const files = [
    ...(opts.install ? index.install_only : []),
    ...index.incremental,
  ];

  const doneRows = await db.all('SELECT migration FROM _migrations');
  const done = new Set(doneRows.map((r) => String(r.migration)));
  const pending = files.filter((f) => !done.has(f));
  const just: string[] = [];

  for (const file of pending) {
    const raw = fs.readFileSync(path.join(CONTRACTS_ROOT, 'migrations', file), 'utf8');
    const statements = splitStatements(raw);
    for (const stmt of statements) {
      const parts = transpileSql(stmt, db.driver());
      for (const p of parts) {
        try {
          await db.run(p);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // tolerate duplicate column/key on re-run edge cases
          if (/duplicate|already exists|exists/i.test(msg)) continue;
          throw new Error(`Migration ${file} failed: ${msg}\nSQL: ${p.slice(0, 200)}`);
        }
      }
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.run('INSERT INTO _migrations (migration, applied_at) VALUES (?, ?)', [file, now]);
    just.push(file);
  }

  const appliedRows = await db.all('SELECT migration FROM _migrations ORDER BY id');
  return {
    applied: appliedRows.map((r) => String(r.migration)),
    pending: [],
    just_applied: just,
  };
}
