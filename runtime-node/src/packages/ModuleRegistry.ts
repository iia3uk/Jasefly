import type { Database } from '../db/Database.js';
import fs from 'node:fs';
import type { ModulePaths } from './ModulePaths.js';

export type InstalledModuleRow = Record<string, unknown>;

export class ModuleRegistry {
  constructor(
    private db: Database,
    private paths: ModulePaths,
  ) {}

  async listAll(): Promise<InstalledModuleRow[]> {
    if (!(await this.db.tableExists('installed_modules'))) return [];
    return this.db.all('SELECT * FROM installed_modules ORDER BY slug');
  }

  async getBySlug(slug: string): Promise<InstalledModuleRow | null> {
    if (!(await this.db.tableExists('installed_modules'))) return null;
    return this.db.one('SELECT * FROM installed_modules WHERE slug=? LIMIT 1', [slug]);
  }

  async insert(row: {
    slug: string;
    name: string;
    installed_version: string;
    status: string;
    manifest_json?: string | null;
    frontend_manifest_json?: string | null;
    package_checksum?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await this.db.run(
      `INSERT INTO installed_modules (
        slug, name, installed_version, status, source, manifest_json,
        frontend_manifest_json, package_checksum, signature_status,
        health_status, data_retention, installed_at, updated_at
      ) VALUES (?, ?, ?, ?, 'package', ?, ?, ?, 'unsigned', 'unknown', 'preserve', ?, ?)`,
      [
        row.slug,
        row.name,
        row.installed_version,
        row.status,
        row.manifest_json ?? null,
        row.frontend_manifest_json ?? null,
        row.package_checksum ?? null,
        now,
        now,
      ],
    );
  }

  async setStatus(slug: string, status: string, lastError: string | null = null, healthStatus: string | null = null): Promise<void> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const cols = ['status=?', 'updated_at=?'];
    const params: unknown[] = [status, now];
    if (lastError !== null) {
      cols.push('last_error=?');
      params.push(lastError);
    }
    if (healthStatus !== null) {
      cols.push('health_status=?');
      params.push(healthStatus);
    }
    if (status === 'enabled') {
      cols.push('enabled_at=?');
      params.push(now);
    }
    if (status === 'disabled') {
      cols.push('disabled_at=?');
      params.push(now);
    }
    params.push(slug);
    await this.db.run(`UPDATE installed_modules SET ${cols.join(', ')} WHERE slug=?`, params);
  }

  async hasRollbackSnapshot(slug: string): Promise<boolean> {
    const backup = await this.findLatestBackupPath(slug);
    return backup !== null;
  }

  async findLatestBackupPath(slug: string): Promise<string | null> {
    if (await this.db.tableExists('module_operations')) {
      const ops = await this.db.all(
        `SELECT backup_path, file_rollback_available, status FROM module_operations
         WHERE module_slug=? ORDER BY id DESC LIMIT 20`,
        [slug],
      );
      for (const op of ops) {
        if (String(op.status ?? '') !== 'success') continue;
        if (!op.file_rollback_available && op.file_rollback_available !== 1) continue;
        const p = String(op.backup_path ?? '');
        if (p && fs.existsSync(p)) return p;
      }
    }
    const backupsRoot = this.paths.backupsRoot();
    if (!fs.existsSync(backupsRoot)) return null;
    const matches = fs
      .readdirSync(backupsRoot)
      .filter((f) => f.startsWith(`${slug}-`) && f.endsWith('.zip'))
      .map((f) => pathJoin(backupsRoot, f))
      .filter((p) => fs.existsSync(p))
      .sort()
      .reverse();
    return matches[0] ?? null;
  }

  async listOperations(moduleSlug: string | null, limit = 50): Promise<InstalledModuleRow[]> {
    if (!(await this.db.tableExists('module_operations'))) return [];
    const lim = Math.max(1, Math.min(200, limit));
    if (moduleSlug) {
      return this.db.all(
        `SELECT * FROM module_operations WHERE module_slug=? ORDER BY started_at DESC, id DESC LIMIT ${lim}`,
        [moduleSlug],
      );
    }
    return this.db.all(`SELECT * FROM module_operations ORDER BY started_at DESC, id DESC LIMIT ${lim}`);
  }

  async getOperation(operationId: number): Promise<InstalledModuleRow | null> {
    if (!(await this.db.tableExists('module_operations'))) return null;
    return this.db.one('SELECT * FROM module_operations WHERE id=? LIMIT 1', [operationId]);
  }

  async listModuleFiles(slug: string): Promise<InstalledModuleRow[]> {
    if (!(await this.db.tableExists('module_files'))) return [];
    return this.db.all(
      'SELECT relative_path, sha256, size_bytes FROM module_files WHERE module_slug=? ORDER BY relative_path',
      [slug],
    );
  }

  async listModuleMigrations(slug: string): Promise<InstalledModuleRow[]> {
    if (!(await this.db.tableExists('module_migrations'))) return [];
    return this.db.all(
      'SELECT migration, checksum, module_version, batch, applied_at FROM module_migrations WHERE module_slug=? ORDER BY applied_at, id',
      [slug],
    );
  }

  async deleteModule(slug: string): Promise<void> {
    if (!(await this.db.tableExists('installed_modules'))) return;
    await this.db.run('DELETE FROM installed_modules WHERE slug=?', [slug]);
  }

  /** Mirror modules.is_enabled when plugins table exists. */
  async mirrorPluginEnabled(slug: string, enabled: boolean): Promise<void> {
    if (!(await this.db.tableExists('modules'))) return;
    const want = enabled ? 1 : 0;
    const existing = await this.db.one('SELECT name FROM modules WHERE name=? LIMIT 1', [slug]);
    if (existing) {
      await this.db.run('UPDATE modules SET is_enabled=? WHERE name=?', [want, slug]);
    } else {
      await this.db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, ?, NULL)', [slug, want]);
    }
  }
}

function pathJoin(a: string, b: string): string {
  return `${a.replace(/[/\\]+$/, '')}/${b}`;
}

export function presentModule(row: InstalledModuleRow, rollbackAvailable: boolean): Record<string, unknown> {
  let manifest: unknown = null;
  if (row.manifest_json && typeof row.manifest_json === 'string') {
    try {
      manifest = JSON.parse(row.manifest_json);
    } catch {
      manifest = null;
    }
  }
  let frontend: unknown = null;
  if (row.frontend_manifest_json && typeof row.frontend_manifest_json === 'string') {
    try {
      frontend = JSON.parse(row.frontend_manifest_json);
    } catch {
      frontend = null;
    }
  }

  const status = String(row.status ?? '');
  const health = String(row.health_status ?? '');
  const isQuarantined = health === 'quarantined' || status === 'failed';

  const recovery: string[] = [];
  if (status !== 'enabled') recovery.push('enable');
  if (status !== 'disabled') recovery.push('disable');
  recovery.push('update', 'uninstall');
  if (rollbackAvailable) recovery.push('rollback');

  return {
    slug: row.slug ?? '',
    name: row.name ?? '',
    installed_version: row.installed_version ?? '',
    status,
    source: row.source ?? 'package',
    signature_status: row.signature_status ?? '',
    health_status: health,
    last_error: row.last_error ?? null,
    is_quarantined: isQuarantined,
    quarantine: isQuarantined ? { message: row.last_error ?? null } : null,
    recovery_actions: recovery,
    rollback_available: rollbackAvailable,
    data_retention: row.data_retention ?? '',
    package_checksum: row.package_checksum ?? null,
    enabled_at: row.enabled_at ?? null,
    disabled_at: row.disabled_at ?? null,
    installed_at: row.installed_at ?? null,
    updated_at: row.updated_at ?? null,
    manifest,
    frontend_manifest: frontend,
  };
}

export function runtimeManifests(rows: InstalledModuleRow[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (String(row.status ?? '') !== 'enabled') continue;
    if (String(row.source ?? '') === 'bundled') continue;
    const slug = String(row.slug ?? '');
    if (!slug) continue;

    let frontend: Record<string, unknown> | null = null;
    if (row.frontend_manifest_json && typeof row.frontend_manifest_json === 'string') {
      try {
        frontend = JSON.parse(row.frontend_manifest_json) as Record<string, unknown>;
      } catch {
        frontend = null;
      }
    }

    const base = `/modules/${slug}/`;
    const entryRel = frontend
      ? String(frontend.entry ?? (frontend.assets as { js?: string[] } | undefined)?.js?.[0] ?? 'index.js')
      : 'index.js';
    const entry = base + entryRel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const css: string[] = [];
    if (frontend) {
      const cssList = (frontend.css ?? (frontend.assets as { css?: string[] } | undefined)?.css ?? []) as unknown[];
      for (const c of cssList) {
        if (typeof c === 'string' && c) css.push(base + c.replace(/^[/\\]+/, '').replace(/\\/g, '/'));
      }
    }

    out.push({
      slug,
      name: row.name ?? slug,
      version: row.installed_version ?? '',
      status: 'enabled',
      entry,
      css,
      integrity: frontend?.integrity ?? [],
      exports: frontend?.exports ?? [],
      frontend_manifest: frontend,
      assets_base: base,
    });
  }
  return out;
}
