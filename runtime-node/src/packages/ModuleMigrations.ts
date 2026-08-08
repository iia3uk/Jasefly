/**
 * Apply package SQL migrations from storage/modules/{slug}/migrations.
 * Generic — no package slug whitelist. Tracked in module_migrations (+ optional _migrations mirror).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from '../db/Database.js';
import { transpileSql } from '../db/sqlTranspile.js';
import type { ModulePaths } from './ModulePaths.js';

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

async function ensureModuleMigrationsTable(db: Database): Promise<void> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS module_migrations (
      module_slug VARCHAR(80) NOT NULL,
      migration VARCHAR(190) NOT NULL,
      checksum VARCHAR(80) NULL,
      module_version VARCHAR(40) NULL,
      batch INT NOT NULL DEFAULT 1,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (module_slug, migration)
    )`,
  );
}

function sha256File(absPath: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
}

export type PackageMigrationResult = {
  ok: boolean;
  applied: string[];
  pending: string[];
  error?: string;
};

export function listPackageMigrationFiles(paths: ModulePaths, slug: string): string[] {
  paths.assertSlug(slug);
  const dir = path.join(paths.moduleRoot(slug), 'migrations');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.includes('..'))
    .sort();
}

export async function applyPackageMigrations(
  db: Database,
  paths: ModulePaths,
  slug: string,
  version = '0.0.0',
): Promise<PackageMigrationResult> {
  paths.assertSlug(slug);
  await ensureModuleMigrationsTable(db);

  const files = listPackageMigrationFiles(paths, slug);
  const appliedRows = await db.all(
    'SELECT migration FROM module_migrations WHERE module_slug=?',
    [slug],
  );
  const done = new Set(appliedRows.map((r) => String(r.migration)));
  const pending = files.filter((f) => !done.has(f));
  const applied: string[] = [];
  const migDir = path.join(paths.moduleRoot(slug), 'migrations');

  for (const file of pending) {
    const abs = path.join(migDir, file);
    paths.assertContained(migDir, abs);
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = fs.readFileSync(abs, 'utf8');
      for (const stmt of splitStatements(raw)) {
        for (const part of transpileSql(stmt, db.driver())) {
          try {
            await db.run(part);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/duplicate|already exists|exists/i.test(msg)) continue;
            throw new Error(`${file}: ${msg}`);
          }
        }
      }
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.run(
        `INSERT INTO module_migrations (module_slug, migration, checksum, module_version, batch, applied_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [slug, file, sha256File(abs), version, now],
      );
      try {
        if (await db.tableExists('_migrations')) {
          const id = `package:${slug}:${file}`;
          const exists = await db.one('SELECT id FROM _migrations WHERE id=?', [id]);
          if (!exists) {
            await db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [id, now]);
          }
        }
      } catch {
        /* ignore mirror failures */
      }
      applied.push(file);
    } catch (e) {
      return {
        ok: false,
        applied,
        pending: pending.filter((p) => !applied.includes(p)),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return { ok: true, applied, pending: [] };
}

/**
 * Apply package uninstall SQL from migrations/uninstall (or manifest uninstall_path).
 * Called only when keepData=false — destructive by contract.
 */
export async function applyPackageUninstallMigrations(
  db: Database,
  paths: ModulePaths,
  slug: string,
  uninstallRel = 'migrations/uninstall',
): Promise<PackageMigrationResult> {
  paths.assertSlug(slug);
  const cleaned = uninstallRel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  if (!cleaned || cleaned.includes('..')) {
    return { ok: false, applied: [], pending: [], error: 'Invalid uninstall path' };
  }
  const dir = path.join(paths.moduleRoot(slug), ...cleaned.split('/'));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { ok: true, applied: [], pending: [] };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.includes('..'))
    .sort();
  const applied: string[] = [];

  for (const file of files) {
    const abs = path.join(dir, file);
    paths.assertContained(dir, abs);
    try {
      const raw = fs.readFileSync(abs, 'utf8');
      for (const stmt of splitStatements(raw)) {
        for (const part of transpileSql(stmt, db.driver())) {
          try {
            await db.run(part);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/unknown table|no such table|doesn't exist|does not exist/i.test(msg)) continue;
            throw new Error(`${file}: ${msg}`);
          }
        }
      }
      applied.push(file);
    } catch (e) {
      return {
        ok: false,
        applied,
        pending: files.filter((p) => !applied.includes(p)),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    await db.run('DELETE FROM module_migrations WHERE module_slug=?', [slug]);
  } catch {
    /* ignore */
  }

  return { ok: true, applied, pending: [] };
}

/** Discover package migration files under storage/modules/{slug}/migrations for ops listing. */
export function discoverInstalledPackageMigrationPaths(paths: ModulePaths): Record<string, string> {
  const out: Record<string, string> = {};
  const root = paths.modulesRoot();
  if (!fs.existsSync(root)) return out;
  for (const slug of fs.readdirSync(root)) {
    try {
      paths.assertSlug(slug);
    } catch {
      continue;
    }
    const migDir = path.join(root, slug, 'migrations');
    if (!fs.existsSync(migDir)) continue;
    for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
      out[`package:${slug}:${f}`] = path.join(migDir, f);
    }
  }
  return out;
}
