/**
 * Sync package sources into storage/modules for Node package loader.
 * Prefers local authoring workspace `modules-src/` (gitignored); falls back to
 * `backend/tests/fixtures/modules/` for CI. Production uses MPM ZIP install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/Database.js';
import { ModulePaths } from './ModulePaths.js';

const NODE_ENTRY_CANDIDATES = [
  'backend/node/index.ts',
  'backend/node/index.mjs',
  'backend/node/index.js',
  'backend/index.mjs',
  'backend/index.js',
];

function hasNodeEntrypoint(moduleRoot: string, manifest: Record<string, unknown>): boolean {
  const entries = (manifest.entrypoints ?? {}) as Record<string, unknown>;
  const declared = [entries.node, entries.nodejs, entries['backend-node'], manifest.node_entrypoint].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  for (const rel of [...declared, ...NODE_ENTRY_CANDIDATES]) {
    const cleaned = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    if (cleaned.includes('..')) continue;
    if (fs.existsSync(path.join(moduleRoot, ...cleaned.split('/')))) return true;
  }
  return false;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'frontend') continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

export type SyncResult = { slug: string; enabled: boolean; synced: boolean };

/**
 * Discover modules-src packages that declare a Node entry, copy into storage, register, enable.
 * @param enableMode 'test-all' enables every synced package; 'plugins' enables when modules.is_enabled=1
 */
function defaultSourceRoots(): string[] {
  const fixtures = path.join(REPO_ROOT, 'backend/tests/fixtures/modules');
  // Behavior parity must match clean CI (fixtures only) — ignore local modules-src trees.
  if (process.env.BEHAVIOR_PARITY === '1') {
    return fs.existsSync(fixtures) ? [path.resolve(fixtures)] : [];
  }
  const roots: string[] = [];
  const env = process.env.JASEFLY_MODULES_ROOT?.trim();
  if (env) {
    const envPath = path.isAbsolute(env) ? env : path.resolve(REPO_ROOT, env);
    const asSrc = path.join(envPath, 'modules-src');
    if (fs.existsSync(asSrc)) roots.push(asSrc);
    else if (fs.existsSync(envPath)) roots.push(envPath);
  }
  for (const p of [
    path.join(REPO_ROOT, 'Jasefly-Modules', 'modules-src'),
    path.join(REPO_ROOT, 'modules-src'),
    fixtures,
  ]) {
    if (fs.existsSync(p)) roots.push(p);
  }
  return [...new Set(roots.map((p) => path.resolve(p)))];
}

export async function syncPackageSources(
  db: Database,
  cfg: AppConfig,
  opts: { enableMode?: 'test-all' | 'plugins' | 'none'; sourcesRoot?: string } = {},
): Promise<SyncResult[]> {
  const enableMode = opts.enableMode ?? (cfg.env === 'test' ? 'test-all' : 'plugins');
  const sourceRoots = opts.sourcesRoot ? [opts.sourcesRoot] : defaultSourceRoots();
  const paths = new ModulePaths(cfg.storagePath);
  const results: SyncResult[] = [];
  const seen = new Set<string>();

  if (sourceRoots.length === 0) return results;
  if (!(await db.tableExists('installed_modules'))) return results;

  for (const sourcesRoot of sourceRoots) {
  for (const name of fs.readdirSync(sourcesRoot)) {
    const srcRoot = path.join(sourcesRoot, name);
    if (!fs.statSync(srcRoot).isDirectory()) continue;
    const manifestPath = path.join(srcRoot, 'module.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const slug = String(manifest.slug ?? name);
    try {
      paths.assertSlug(slug);
    } catch {
      continue;
    }
    if (seen.has(slug)) continue;
    if (!hasNodeEntrypoint(srcRoot, manifest)) continue;
    seen.add(slug);

    const dest = paths.moduleRoot(slug);
    paths.ensureDir(path.dirname(dest));
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(srcRoot, dest);

    const version = String(manifest.version ?? '0.0.0');
    const frontend = manifest.frontend ?? null;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const existing = await db.one('SELECT slug, status FROM installed_modules WHERE slug=?', [slug]);
    if (existing) {
      await db.run(
        `UPDATE installed_modules SET name=?, installed_version=?, manifest_json=?, frontend_manifest_json=?, updated_at=? WHERE slug=?`,
        [
          String(manifest.name ?? slug),
          version,
          JSON.stringify(manifest),
          frontend ? JSON.stringify(frontend) : null,
          now,
          slug,
        ],
      );
    } else {
      await db.run(
        `INSERT INTO installed_modules (
          slug, name, installed_version, status, source, manifest_json,
          frontend_manifest_json, signature_status, health_status, data_retention, installed_at, updated_at
        ) VALUES (?, ?, ?, 'installed', 'package', ?, ?, 'unsigned', 'unknown', 'preserve', ?, ?)`,
        [
          slug,
          String(manifest.name ?? slug),
          version,
          JSON.stringify(manifest),
          frontend ? JSON.stringify(frontend) : null,
          now,
          now,
        ],
      );
    }

    let shouldEnable = false;
    if (enableMode === 'test-all') shouldEnable = true;
    else if (enableMode === 'plugins' && (await db.tableExists('modules'))) {
      const mod = await db.one('SELECT is_enabled FROM modules WHERE name=?', [slug]);
      shouldEnable = mod != null && Number(mod.is_enabled) === 1;
    }

    if (shouldEnable) {
      await db.run(
        `UPDATE installed_modules SET status='enabled', health_status='ok', last_error=NULL, enabled_at=?, updated_at=? WHERE slug=?`,
        [now, now, slug],
      );
      if (await db.tableExists('modules')) {
        const mod = await db.one('SELECT name FROM modules WHERE name=?', [slug]);
        if (mod) await db.run('UPDATE modules SET is_enabled=1 WHERE name=?', [slug]);
        else await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, NULL)', [slug]);
      }
    }

    results.push({ slug, enabled: shouldEnable, synced: true });
  }
  }

  return results;
}
