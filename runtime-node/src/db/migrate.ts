import fs from 'node:fs';
import path from 'node:path';
import { CONTRACTS_ROOT, REPO_ROOT } from '../config.js';
import type { Database } from './Database.js';
import { transpileSql } from './sqlTranspile.js';

interface MigIndex {
  install_only: string[];
  incremental: string[];
}

/** PHP MigrationService::FILES — incremental only (001 is install). */
export const PHP_MIGRATION_FILES = [
  '002_enterprise.sql',
  '003_site_templates.sql',
  '004_project_media.sql',
  '005_page_layouts.sql',
  '006_page_revisions.sql',
  '007_plugins.sql',
  '008_security_2fa.sql',
  '009_commerce_catalog.sql',
  '010_maintenance_settings.sql',
  '011_project_status_cancelled.sql',
  '012_activity_source.sql',
  '013_blog_project_link.sql',
  '014_project_media_url.sql',
  '015_path_redirects.sql',
  '016_cookie_consent.sql',
  '017_admin_base_path.sql',
  '018_harden_role_permissions.sql',
  '019_seo_target_regions.sql',
  '020_installed_modules.sql',
  '021_platform_sdk.sql',
  '022_platform_capabilities_ext.sql',
  '023_theme_header_style.sql',
  '024_admin_access_layer.sql',
  '025_demo_sandbox.sql',
  '026_project_featured_priority.sql',
  '027_project_cover_orientations.sql',
  '028_plugin_default_off_seed.sql',
  '029_core_module_manager_on.sql',
  '030_mcp_nonces.sql',
] as const;

/**
 * Match PHP MigrationService meta table: id = migration filename (VARCHAR PK).
 */
export async function ensureMigrationsMeta(db: Database): Promise<void> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id VARCHAR(120) NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );
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

export async function runMigrations(
  db: Database,
  opts: { install?: boolean } = {},
): Promise<{
  applied: string[];
  pending: string[];
  just_applied: string[];
}> {
  await ensureMigrationsMeta(db);
  const index = JSON.parse(
    fs.readFileSync(path.join(CONTRACTS_ROOT, 'migrations/index.v1.json'), 'utf8'),
  ) as MigIndex;

  const files = [...(opts.install ? index.install_only : []), ...index.incremental];
  // Plugin SQL (Support/Forms/…) — same discovery as PHP MigrationService when modulesDir set.
  const pluginFiles = pluginMigrationFiles();

  const doneRows = await db.all('SELECT id FROM _migrations');
  const done = new Set(doneRows.map((r) => String(r.id)));
  const pendingCore = files.filter((f) => !done.has(f));
  const pendingPlugin = Object.keys(pluginFiles).filter((id) => !done.has(id));
  const just: string[] = [];

  const applyFile = async (id: string, absPath: string) => {
    const raw = fs.readFileSync(absPath, 'utf8');
    const statements = splitStatements(raw);
    for (const stmt of statements) {
      const parts = transpileSql(stmt, db.driver());
      for (const p of parts) {
        try {
          await db.run(p);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/duplicate|already exists|exists/i.test(msg)) continue;
          throw new Error(`Migration ${id} failed: ${msg}\nSQL: ${p.slice(0, 200)}`);
        }
      }
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [id, now]);
    just.push(id);
  };

  for (const file of pendingCore) {
    await applyFile(file, path.join(CONTRACTS_ROOT, 'migrations', file));
  }
  for (const id of pendingPlugin.sort()) {
    await applyFile(id, pluginFiles[id]!);
  }

  const appliedRows = await db.all('SELECT id FROM _migrations ORDER BY applied_at, id');
  return {
    applied: appliedRows.map((r) => String(r.id)),
    pending: [],
    just_applied: just,
  };
}

/**
 * Host-bundled module SQL still living under backend/src/Modules (Lab/Access/…).
 * ZIP package migrations are NOT discovered here — they apply from
 * storage/modules/{slug}/migrations via packages/ModuleMigrations.ts at install/enable.
 */
export function pluginMigrationFiles(): Record<string, string> {
  const modulesDir = path.join(REPO_ROOT, 'backend/src/Modules');
  const out: Record<string, string> = {};
  if (!fs.existsSync(modulesDir)) return out;
  for (const mod of fs.readdirSync(modulesDir)) {
    const migDir = path.join(modulesDir, mod, 'migrations');
    if (!fs.existsSync(migDir)) continue;
    for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
      out[`plugin:${mod}:${f}`] = path.join(migDir, f);
    }
  }
  return out;
}

export function migrationsDir(): string {
  // PHP: dirname(...) . '/migrations' → Windows drive path + forward-slash suffix
  return path.join(REPO_ROOT, 'backend') + '/migrations';
}

export async function markMigrationApplied(db: Database, id: string): Promise<void> {
  await ensureMigrationsMeta(db);
  const row = await db.one('SELECT id FROM _migrations WHERE id=?', [id]);
  if (row) return;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [id, now]);
}
