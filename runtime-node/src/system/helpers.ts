import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import type { AppConfig } from '../config.js';
import { CONTRACTS_ROOT, readContractJson, REPO_ROOT } from '../config.js';
import type { Database } from '../db/Database.js';
import { fail } from '../http/envelope.js';
import { runMigrations } from '../db/migrate.js';

export const TRASHABLE: Record<string, string> = {
  projects: 'projects',
  blog: 'blog_posts',
  media: 'media',
  'project-categories': 'project_categories',
  'blog-categories': 'blog_categories',
  'skill-categories': 'skill_categories',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  services: 'services',
  testimonials: 'testimonials',
  pages: 'pages',
  products: 'products',
  'lab-experiments': 'lab_experiments',
};

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function hasDeletedAt(db: Database, table: string): Promise<boolean> {
  if (!(await db.tableExists(table))) return false;
  return (await db.columns(table)).includes('deleted_at');
}

export async function trashIndex(db: Database): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const [resource, table] of Object.entries(TRASHABLE)) {
    if (!(await hasDeletedAt(db, table))) continue;
    const items = await db.all(
      `SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50`,
    );
    if (items.length) {
      out[resource] = items.map((row) => ({ ...row, resource }));
    }
  }
  return out;
}

export async function trashRestore(db: Database, resource: string, id: string): Promise<boolean> {
  const table = TRASHABLE[resource];
  if (!table || !(await hasDeletedAt(db, table))) return false;
  const row = await db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
  if (!row) return false;
  await db.run(`UPDATE ${table} SET deleted_at=NULL WHERE id=?`, [id]);
  return true;
}

export async function trashForceDelete(db: Database, resource: string, id: string): Promise<boolean> {
  const table = TRASHABLE[resource];
  if (!table) return false;
  const row = await db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
  if (!row) return false;
  await db.run(`DELETE FROM ${table} WHERE id=?`, [id]);
  return true;
}

export async function trashEmpty(db: Database, resource: string): Promise<number> {
  const table = TRASHABLE[resource];
  if (!table || !(await hasDeletedAt(db, table))) return 0;
  const countRow = await db.one(`SELECT COUNT(*) AS c FROM ${table} WHERE deleted_at IS NOT NULL`);
  const count = Number(countRow?.c ?? 0);
  await db.run(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`);
  return count;
}

export async function trashEmptyAll(db: Database): Promise<number> {
  let total = 0;
  for (const resource of Object.keys(TRASHABLE)) {
    total += await trashEmpty(db, resource);
  }
  return total;
}

export function lastErrorPath(storagePath: string): string {
  return path.join(storagePath, 'logs', 'last-error.json');
}

export function readLastError(storagePath: string): Record<string, unknown> | null {
  const p = lastErrorPath(storagePath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function clearLastError(storagePath: string): boolean {
  const p = lastErrorPath(storagePath);
  if (!fs.existsSync(p)) return true;
  try {
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

export async function listActivity(
  db: Database,
  limit: number,
  offset: number,
  source: string,
): Promise<unknown[]> {
  if (!(await db.tableExists('activity_logs'))) return [];
  const cols = await db.columns('activity_logs');
  const hasSource = cols.includes('source');
  limit = Math.max(1, Math.min(200, limit));
  offset = Math.max(0, offset);

  if (source !== 'all' && hasSource) {
    return db.all('SELECT * FROM activity_logs WHERE source=? ORDER BY id DESC LIMIT ? OFFSET ?', [
      source,
      limit,
      offset,
    ]);
  }
  return db.all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
}

export async function adminGlobalSearch(db: Database, q: string, limit: number): Promise<unknown[]> {
  const like = `%${q.trim()}%`;
  if (!q.trim()) return [];
  limit = Math.max(1, Math.min(50, limit));
  const items: unknown[] = [];
  const tables: [string, string, string][] = [
    ['pages', 'title', 'page'],
    ['blog_posts', 'title', 'blog'],
    ['projects', 'title', 'project'],
    ['users', 'email', 'user'],
    ['services', 'title', 'service'],
  ];
  for (const [table, col, type] of tables) {
    if (!(await db.tableExists(table))) continue;
    const rows = await db.all(
      `SELECT id, ${col} AS label, '${type}' AS type FROM ${table} WHERE ${col} LIKE ? LIMIT ?`,
      [like, limit],
    );
    items.push(...rows);
  }
  return items.slice(0, limit);
}

export async function listPageRevisions(db: Database, pageId: number): Promise<unknown[]> {
  if (!(await db.tableExists('page_revisions'))) return [];
  return db.all(
    'SELECT id, page_id, title, author_id, note, created_at FROM page_revisions WHERE page_id=? ORDER BY id DESC LIMIT 100',
    [pageId],
  );
}

export async function snapshotPageRevision(
  db: Database,
  pageId: number,
  authorId: number | null,
  note: string | null,
): Promise<number> {
  if (!(await db.tableExists('page_revisions'))) return 0;
  const page = await db.one('SELECT title, layout_json, content FROM pages WHERE id=?', [pageId]);
  if (!page) return 0;
  await db.run(
    'INSERT INTO page_revisions (page_id, layout_json, content, title, author_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [pageId, page.layout_json ?? null, page.content ?? null, page.title ?? null, authorId, note, nowSql()],
  );
  return db.lastInsertId();
}

export async function getPageRevision(db: Database, revisionId: number): Promise<Record<string, unknown> | null> {
  if (!(await db.tableExists('page_revisions'))) return null;
  return db.one('SELECT * FROM page_revisions WHERE id=?', [revisionId]);
}

export async function restorePageRevision(db: Database, revisionId: number): Promise<Record<string, unknown> | null> {
  const rev = await getPageRevision(db, revisionId);
  if (!rev) return null;
  await snapshotPageRevision(db, Number(rev.page_id), null, 'Auto-snapshot before restore');
  await db.run('UPDATE pages SET layout_json=?, content=?, title=? WHERE id=?', [
    rev.layout_json ?? null,
    rev.content ?? null,
    rev.title ?? null,
    rev.page_id,
  ]);
  return rev;
}

export function rekeyLayoutIds(layout: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if ('id' in obj) obj.id = `el_${crypto.randomBytes(6).toString('hex')}`;
    if (Array.isArray(obj.elements)) obj.elements.forEach(walk);
  };
  const out = JSON.parse(JSON.stringify(layout)) as Record<string, unknown>;
  if (Array.isArray(out.elements)) out.elements.forEach(walk);
  return out;
}

export function loadModuleCatalog(): unknown[] {
  const dir = path.join(CONTRACTS_ROOT, 'modules');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.manifest.json'))
    .map((f) => {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
        return { id: doc.id, name: doc.name, runtime: doc.runtime };
      } catch {
        return { id: f.replace('.manifest.json', ''), name: f };
      }
    })
    .sort((a, b) => String((a as { id?: string }).id).localeCompare(String((b as { id?: string }).id)));
}

export function loadBlueprints(): unknown[] {
  const dir = path.join(CONTRACTS_ROOT, 'blueprints');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const key = f.replace(/\.v\d+\.json$/, '').replace(/\.json$/, '');
      return { key, file: `contracts/blueprints/${f}` };
    });
}

export function loadBlueprint(key: string): unknown | null {
  const dir = path.join(CONTRACTS_ROOT, 'blueprints');
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith(key));
  if (!match) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, match), 'utf8'));
  } catch {
    return null;
  }
}

export function loadBlocks(): unknown[] {
  try {
    const doc = readContractJson<{ widgets: string[] }>('builder/widget-types.v1.json');
    return doc.widgets.map((type) => ({ type }));
  } catch {
    return [];
  }
}

export function loadEvents(): string[] {
  try {
    return readContractJson<{ events: string[] }>('events/events-core.v1.json').events;
  } catch {
    return [];
  }
}

export function loadPublicRoutes(): unknown[] {
  return loadModuleCatalog().map((m) => {
    const mod = m as { id?: string; name?: string };
    return { module: mod.id, name: mod.name, public: true };
  });
}

export async function logActivity(
  db: Database,
  user: Record<string, unknown> | 'mcp',
  action: string,
  entityType: string | null,
  entityId: number | null,
  entityLabel: string | null,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  if (!(await db.tableExists('activity_logs'))) return;
  const cols = await db.columns('activity_logs');
  const isMcp = user === 'mcp';
  const meta = { ...(metadata ?? {}), source: isMcp ? 'mcp' : 'admin' };
  const userId = isMcp ? null : Number((user as Record<string, unknown>).id ?? 0) || null;
  const userName = isMcp ? 'MCP Agent' : String((user as Record<string, unknown>).name ?? '');

  if (cols.includes('source')) {
    await db.run(
      `INSERT INTO activity_logs (user_id, user_name, source, action, entity_type, entity_id, entity_label, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, userName, isMcp ? 'mcp' : 'admin', action, entityType, entityId, entityLabel, JSON.stringify(meta), nowSql()],
    );
  } else {
    await db.run(
      `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entityType, entityId, entityLabel, JSON.stringify(meta), nowSql()],
    );
  }
}

export async function pagesDigest(db: Database, idOrSlug?: string): Promise<unknown> {
  if (!(await db.tableExists('pages'))) return idOrSlug ? null : [];
  if (idOrSlug) {
    const row = await db.one('SELECT id, slug, title, status, updated_at FROM pages WHERE id=? OR slug=? LIMIT 1', [
      idOrSlug,
      idOrSlug,
    ]);
    return row;
  }
  return db.all('SELECT id, slug, title, status, updated_at FROM pages ORDER BY id');
}

export async function schemaSnapshot(
  db: Database,
  tableFilter: string,
  counts: boolean,
): Promise<Record<string, unknown>> {
  const tables: string[] = [];
  if (tableFilter) {
    if (await db.tableExists(tableFilter)) tables.push(tableFilter);
  } else {
    const resources = readContractJson<{ tables: Record<string, string> }>('resources/admin-resources.v1.json');
    for (const t of new Set(Object.values(resources.tables ?? {}))) {
      if (await db.tableExists(t)) tables.push(t);
    }
  }
  const out: Record<string, unknown> = {};
  for (const table of tables) {
    const cols = await db.columns(table);
    const entry: Record<string, unknown> = { columns: cols };
    if (counts) {
      const row = await db.one(`SELECT COUNT(*) AS c FROM ${table}`);
      entry.count = Number(row?.c ?? 0);
    }
    out[table] = entry;
  }
  return out;
}

export function mcpDiagnosticsSnapshot(cfg: AppConfig, db: Database): Promise<Record<string, unknown>> {
  return (async () => ({
    runtime: cfg.runtime,
    env: cfg.env,
    db_driver: db.driver(),
    storage_path: cfg.storagePath,
    repo_root: REPO_ROOT,
    openapi: 'contracts/openapi/jasefly.v1.yaml',
  }))();
}

export function requireMcpAgent(auth: AuthService): MiddlewareHandler {
  return async (c, next) => {
    const user = await auth.meFromBearer(c.req.header('authorization'));
    // Match PHP AuthMiddleware: missing/invalid bearer → 401 (not 403).
    if (!user) return fail(c, 'Unauthorized', 401);
    if (user !== 'mcp') return fail(c, 'Forbidden: MCP agent token required', 403);
    c.set('user', user);
    await next();
  };
}

export async function applyContentPack(
  db: Database,
  pack: Record<string, unknown>,
  confirmReplace: boolean,
): Promise<{ ok: boolean; report: Record<string, unknown> }> {
  if (!pack.version) throw new Error('Content pack must include version');
  const mode = String(pack.mode ?? 'replace_content');
  if (mode === 'replace_content' && !confirmReplace) {
    throw new Error('replace_content requires confirm_replace: true');
  }
  const report: { singletons: Record<string, string>; tables: Record<string, unknown> } = {
    singletons: {},
    tables: {},
  };
  const singletons = readContractJson<{ singletons: Record<string, string> }>('resources/admin-resources.v1.json')
    .singletons;
  const packSingletons = (pack.singletons ?? {}) as Record<string, Record<string, unknown>>;
  for (const [key, data] of Object.entries(packSingletons)) {
    const table = singletons[key];
    if (!table || !(await db.tableExists(table))) continue;
    const existing = await db.one(`SELECT id FROM ${table} LIMIT 1`);
    const cols = await db.columns(table);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (cols.includes(k)) filtered[k] = typeof v === 'object' ? JSON.stringify(v) : v;
    }
    const keys = Object.keys(filtered);
    if (!keys.length) continue;
    if (existing) {
      await db.run(
        `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
        [...keys.map((k) => filtered[k]), existing.id],
      );
    } else {
      await db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => filtered[k]),
      );
    }
    report.singletons[key] = 'updated';
  }
  return { ok: true, report };
}

export async function migrationRetry(db: Database): Promise<unknown> {
  return runMigrations(db);
}

export async function migrationBlueprints(): Promise<{ items: unknown[]; ok: boolean }> {
  const blueprints = loadBlueprints();
  return { items: blueprints, ok: true };
}

export function getUserFromContext(c: Context): Record<string, unknown> | 'mcp' | null {
  return c.get('user') ?? null;
}
