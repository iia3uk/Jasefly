/**
 * System admin payloads mirrored from PHP ModuleRegistry / SystemHealth / AdminController.
 * Static registry pieces come from registry.snapshot.json (regenerate via dump-system-php.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import { REPO_ROOT } from '../config.js';
import type { Database } from '../db/Database.js';
import {
  ensureMigrationsMeta,
  migrationsDir,
  PHP_MIGRATION_FILES,
  pluginMigrationFiles,
} from '../db/migrate.js';
import { DeployTelegramApprove } from '../support/DeployTelegramApprove.js';
import { PackageSurfaceRegistry } from '../platform/PackageSurfaceRegistry.js';
import { HOST_DASHBOARD_COUNT_TABLES, HOST_TRASHABLE } from './hostBaselines.js';

const SNAPSHOT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'registry.snapshot.json');

type Snapshot = {
  blocks: unknown[];
  blueprints: Array<Record<string, unknown>>;
  events: string[];
  publicRoutes: unknown[];
  catalog: Array<Record<string, unknown>>;
  pageTemplatesMeta: Array<{
    slug: string;
    title: string;
    group: string;
    route: string;
    description: string;
    plugin: string | null;
  }>;
  docs: Record<string, unknown>;
};

let snapshotCache: Snapshot | null = null;

export function loadRegistrySnapshot(): Snapshot {
  if (snapshotCache) return snapshotCache;
  snapshotCache = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  return snapshotCache;
}

export function loadBlocks(): unknown[] {
  return loadRegistrySnapshot().blocks;
}

export function loadBlueprints(): unknown[] {
  return loadRegistrySnapshot().blueprints;
}

export function loadBlueprint(key: string): unknown | null {
  return loadRegistrySnapshot().blueprints.find((b) => b.key === key) ?? null;
}

export function loadEvents(): string[] {
  return loadRegistrySnapshot().events;
}

export function loadPublicRoutes(): unknown[] {
  return loadRegistrySnapshot().publicRoutes;
}

export function loadModuleCatalog(): unknown[] {
  return loadRegistrySnapshot().catalog;
}

export function loadDocsPayload(): Record<string, unknown> {
  return loadRegistrySnapshot().docs;
}

function expandEnabledPluginSet(names: Iterable<string>): Set<string> {
  const enabled = new Set<string>();
  for (const name of names) {
    enabled.add(name);
    if (name === 'content') enabled.add('site');
    if (name === 'site') enabled.add('content');
    if (name === 'portfolio') enabled.add('projects');
    if (name === 'projects') enabled.add('portfolio');
  }
  enabled.add('system');
  enabled.add('users');
  return enabled;
}

export async function buildPageTemplates(db: Database): Promise<unknown[]> {
  const meta = loadRegistrySnapshot().pageTemplatesMeta;
  const bySlug: Record<string, Record<string, unknown>> = {};
  if (await db.tableExists('pages')) {
    for (const row of await db.all('SELECT id, slug, title, status, layout_json FROM pages')) {
      bySlug[String(row.slug)] = row;
    }
  }
  // Fail-closed (parity with PluginStateService default-off): no modules row → off.
  const enabledNames: string[] = [];
  if (await db.tableExists('modules')) {
    for (const row of await db.all('SELECT name, is_enabled FROM modules')) {
      if (Number(row.is_enabled) === 1) enabledNames.push(String(row.name));
    }
  }
  const enabled = expandEnabledPluginSet(enabledNames);
  const items: unknown[] = [];
  for (const t of meta) {
    const plugin = t.plugin ? String(t.plugin) : '';
    if (plugin && !enabled.has(plugin)) continue;
    const row = bySlug[t.slug];
    const raw = row ? String(row.layout_json ?? '').trim() : '';
    const hasLayout = raw !== '' && raw !== 'null' && raw !== '{"version":1,"elements":[]}';
    let isSeed = false;
    let useOnSite = false;
    if (hasLayout) {
      try {
        const decoded = JSON.parse(raw) as { meta?: { seed?: boolean; useOnSite?: boolean } };
        const m = decoded?.meta ?? {};
        isSeed = Boolean(m.seed);
        useOnSite = Boolean(m.useOnSite);
      } catch {
        /* ignore */
      }
    }
    items.push({
      slug: t.slug,
      title: t.title,
      group: t.group,
      route: t.route,
      description: t.description,
      plugin: t.plugin,
      page_id: row ? Number(row.id) : null,
      status: row?.status ?? null,
      has_layout: Boolean(hasLayout),
      is_seed: isSeed,
      use_on_site: useOnSite,
      exists: Boolean(row),
    });
  }
  return items;
}

async function tableExists(db: Database, table: string): Promise<boolean> {
  return db.tableExists(table);
}

async function hasDeletedAt(db: Database, table: string): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  return (await db.columns(table)).includes('deleted_at');
}

async function countNotDeleted(db: Database, table: string): Promise<number> {
  if (!(await tableExists(db, table))) return 0;
  try {
    if (await hasDeletedAt(db, table)) {
      const row = await db.one(`SELECT COUNT(*) AS c FROM ${table} WHERE deleted_at IS NULL`);
      return Number(row?.c ?? 0);
    }
    const row = await db.one(`SELECT COUNT(*) AS c FROM ${table}`);
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

async function statusCount(db: Database, table: string, status: string): Promise<number> {
  if (!(await tableExists(db, table))) return 0;
  try {
    const where = (await hasDeletedAt(db, table)) ? 'deleted_at IS NULL' : '1=1';
    const row = await db.one(`SELECT COUNT(*) AS c FROM ${table} WHERE status=? AND ${where}`, [status]);
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

async function projectStatusCount(db: Database, status: string): Promise<number> {
  if (!(await tableExists(db, 'projects'))) return 0;
  try {
    const where = (await hasDeletedAt(db, 'projects')) ? 'deleted_at IS NULL' : '1=1';
    const row = await db.one(
      `SELECT COUNT(*) AS c FROM projects WHERE project_status=? AND ${where}`,
      [status],
    );
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

async function recentCount(db: Database, table: string, days: number): Promise<number> {
  if (!(await tableExists(db, table))) return 0;
  try {
    const where = (await hasDeletedAt(db, table)) ? 'deleted_at IS NULL' : '1=1';
    const row = await db.one(
      `SELECT COUNT(*) AS c FROM ${table} WHERE created_at >= datetime('now', ?) AND ${where}`,
      [`-${days} days`],
    );
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function buildDashboard(db: Database): Promise<Record<string, unknown>> {
  const counts: Record<string, number> = {};
  for (const table of HOST_DASHBOARD_COUNT_TABLES) {
    counts[table] = await countNotDeleted(db, table);
  }

  const drafts: Record<string, number> = { pages: await statusCount(db, 'pages', 'draft') };
  const publish: Record<string, Record<string, number>> = {
    pages: {
      published: await statusCount(db, 'pages', 'published'),
      draft: drafts.pages,
      archived: await statusCount(db, 'pages', 'archived'),
    },
  };
  const recent: Record<string, number> = {};
  const projectLifecycle: Record<string, number> = {};

  for (const metric of PackageSurfaceRegistry.dashboardMetrics()) {
    const table = metric.table;
    const countKey = String(metric.count_as ?? metric.table);
    counts[countKey] = await countNotDeleted(db, table);

    if (metric.draft_as) {
      const draftKey = String(metric.draft_as);
      drafts[draftKey] = await statusCount(db, table, 'draft');
    }
    if (metric.publish_as) {
      const pubKey = String(metric.publish_as);
      if (!publish[pubKey]) {
        publish[pubKey] = { published: 0, draft: 0, archived: 0 };
      }
      publish[pubKey].published = await statusCount(db, table, 'published');
      publish[pubKey].draft = drafts[pubKey] ?? (await statusCount(db, table, 'draft'));
      publish[pubKey].archived = await statusCount(db, table, 'archived');
    }
    if (metric.recent_as) {
      recent[String(metric.recent_as)] = await recentCount(db, table, 7);
    }
    if (metric.extra_status_column === 'project_status') {
      for (const st of ['completed', 'in_progress', 'on_hold', 'concept', 'cancelled']) {
        projectLifecycle[st] = await projectStatusCount(db, st);
      }
    }
  }

  // Host-only recent metrics
  if (!('media_7d' in recent)) {
    recent.media_7d = await recentCount(db, 'media', 7);
  }

  let unread = 0;
  if (await tableExists(db, 'contact_messages')) {
    const row = await db.one('SELECT COUNT(*) AS c FROM contact_messages WHERE is_read=0');
    unread = Number(row?.c ?? 0);
  }

  const messages = (await tableExists(db, 'contact_messages'))
    ? await db.all(
        'SELECT id, name, email, subject, message, is_read, created_at FROM contact_messages ORDER BY id DESC LIMIT 8',
      )
    : [];

  let messages7d = 0;
  if (await tableExists(db, 'contact_messages')) {
    const row = await db.one(
      `SELECT COUNT(*) AS c FROM contact_messages WHERE created_at >= datetime('now', '-7 days')`,
    );
    messages7d = Number(row?.c ?? 0);
  }
  recent.messages_7d = messages7d;

  let trashTotal = 0;
  const trashTables = new Set([
    ...Object.values(HOST_TRASHABLE),
    ...Object.values(PackageSurfaceRegistry.trashable()),
  ]);
  for (const table of trashTables) {
    if (!(await hasDeletedAt(db, table))) continue;
    try {
      const row = await db.one(`SELECT COUNT(*) AS c FROM ${table} WHERE deleted_at IS NOT NULL`);
      trashTotal += Number(row?.c ?? 0);
    } catch {
      /* ignore */
    }
  }

  let activity: unknown[] = [];
  if (await tableExists(db, 'activity_logs')) {
    activity = await db.all(
      'SELECT id, user_name, action, entity_type, entity_id, entity_label, created_at FROM activity_logs ORDER BY id DESC LIMIT 10',
    );
  }

  return {
    counts,
    unread_messages: unread,
    messages,
    drafts,
    publish,
    project_lifecycle: projectLifecycle,
    recent,
    trash_total: trashTotal,
    activity,
  };
}

function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Math.round(v * 100) / 100} ${units[i]}`;
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let size = 0;
  const walk = (p: string) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) walk(full);
      else size += fs.statSync(full).size;
    }
  };
  try {
    walk(dir);
  } catch {
    /* ignore */
  }
  return size;
}

function phpArgs(extra: string[]): string[] {
  const args: string[] = [];
  if (process.env.PHP_EXTENSION_DIR) {
    args.push(
      '-d',
      `extension_dir=${process.env.PHP_EXTENSION_DIR}`,
      '-d',
      'extension=pdo_sqlite',
      '-d',
      'extension=sqlite3',
    );
  }
  args.push(...extra);
  return args;
}

function detectPhpVersion(): string {
  const bin = process.env.PHP_BIN || 'php';
  try {
    const r = spawnSync(bin, phpArgs(['-r', 'echo PHP_VERSION;']), { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim();
  } catch {
    /* ignore */
  }
  return process.env.BEHAVIOR_PHP_VERSION || '8.3.0';
}

/** Match PHP SystemHealthService::dbVersion() (PDO sqlite_version), not better-sqlite3 embed. */
function detectDbVersion(driver: string): string {
  if (driver !== 'sqlite') return 'unknown';
  const bin = process.env.PHP_BIN || 'php';
  try {
    const r = spawnSync(
      bin,
      phpArgs([
        '-r',
        "echo (new PDO('sqlite::memory:'))->query('select sqlite_version()')->fetchColumn();",
      ]),
      { encoding: 'utf8', timeout: 5000 },
    );
    if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim();
  } catch {
    /* ignore */
  }
  return process.env.BEHAVIOR_DB_VERSION || 'unknown';
}

export async function buildSystemStatus(db: Database, cfg: AppConfig): Promise<Record<string, unknown>> {
  const uploadsPath = path.join(cfg.storagePath, 'uploads');
  const storageBytes = dirSize(uploadsPath);
  let dbSize = 0;
  try {
    if (db.driver() === 'sqlite') {
      const row = await db.one(
        `SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS s`,
      );
      dbSize = Number(row?.s ?? 0);
    } else {
      const row = await db.one(
        'SELECT SUM(data_length + index_length) AS s FROM information_schema.tables WHERE table_schema=DATABASE()',
      );
      dbSize = Number(row?.s ?? 0);
    }
  } catch {
    dbSize = 0;
  }

  let fileCount = 0;
  if (await tableExists(db, 'media')) {
    try {
      const row = await db.one('SELECT COUNT(*) AS c FROM media WHERE deleted_at IS NULL');
      fileCount = Number(row?.c ?? 0);
    } catch {
      const row = await db.one('SELECT COUNT(*) AS c FROM media');
      fileCount = Number(row?.c ?? 0);
    }
  }

  let trashCount = 0;
  try {
    const row = await db.one(`SELECT (
      (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL) +
      (SELECT COUNT(*) FROM blog_posts WHERE deleted_at IS NOT NULL) +
      (SELECT COUNT(*) FROM media WHERE deleted_at IS NOT NULL) +
      (SELECT COUNT(*) FROM experience WHERE deleted_at IS NOT NULL) +
      (SELECT COUNT(*) FROM services WHERE deleted_at IS NOT NULL) +
      (SELECT COUNT(*) FROM testimonials WHERE deleted_at IS NOT NULL)
    ) AS c`);
    trashCount = Number(row?.c ?? 0);
  } catch {
    trashCount = 0;
  }

  let version = '1.0.0';
  if (await tableExists(db, 'app_meta')) {
    const row = await db.one(`SELECT meta_value FROM app_meta WHERE meta_key='app_version'`);
    if (row?.meta_value) version = String(row.meta_value);
  }

  let dbVersion = detectDbVersion(db.driver());
  if (dbVersion === 'unknown') {
    try {
      const row = await db.one('SELECT sqlite_version() AS v');
      dbVersion = String(row?.v ?? 'unknown');
    } catch {
      try {
        const row = await db.one('SELECT VERSION() AS v');
        dbVersion = String(row?.v ?? 'unknown');
      } catch {
        /* ignore */
      }
    }
  }

  const token = cfg.mcpApiToken || '';
  const signing = (cfg as { mcpSigningSecret?: string }).mcpSigningSecret || process.env.MCP_SIGNING_SECRET || '';
  const configured = token !== '';
  const signingConfigured = signing !== '';
  let authMode = String(process.env.MCP_AUTH_MODE || cfg.mcpAuthMode || 'legacy').toLowerCase();
  if (!['legacy', 'prefer', 'require'].includes(authMode)) authMode = 'legacy';
  if (!signingConfigured) authMode = 'legacy';
  const ipAllowlist = String(process.env.MCP_ALLOWED_IPS || cfg.mcpAllowedIps || '').trim();

  const appUrl = (cfg.url || 'http://localhost:3080').replace(/\/$/, '');
  // Parity CI boots Node with BEHAVIOR_PARITY=1 and expects PHP shared wording.
  const runtime =
    process.env.BEHAVIOR_PARITY === '1' || cfg.env === 'test'
      ? 'php-shared'
      : cfg.runtime || 'node-vps';
  const siteTokenPath = String(runtime).includes('node')
    ? 'runtime env / deploy/docker/.env → MCP_API_TOKEN (+ MCP_SIGNING_SECRET)'
    : 'api/config/.env → MCP_API_TOKEN (+ MCP_SIGNING_SECRET)';
  // Cursor runs on the developer machine — not inside Docker. Prefer explicit override.
  const repoRaw =
    process.env.CMS_CURSOR_REPO_ROOT ||
    process.env.CMS_REPO_ROOT ||
    REPO_ROOT;
  const repoHint = /^[A-Za-z]:[\\/]/.test(repoRaw)
    ? repoRaw.replace(/\\/g, '/')
    : 'F:/JASEFLY_CMS';
  // PHP json_encode(JSON_PRETTY_PRINT) uses 4-space indent — keep parity scrub happy.
  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        'jasefly-cms': {
          command: 'node',
          args: [`${repoHint}/mcp-cms/src/index.js`],
          env: { CMS_REPO_ROOT: repoHint },
        },
      },
    },
    null,
    4,
  );

  return {
    php_version: detectPhpVersion(),
    db_driver: db.driver(),
    db_version: dbVersion,
    storage_usage_bytes: storageBytes,
    storage_usage_human: humanBytes(storageBytes),
    database_size_bytes: dbSize,
    database_size_human: humanBytes(dbSize),
    uploaded_files_count: fileCount,
    trash_items_count: trashCount,
    cache_status: 'disabled',
    app_version: version,
    api_version: 'v1',
    gd_enabled: false,
    pdo_enabled: true,
    mcp: {
      configured,
      signing_configured: signingConfigured,
      auth_mode: authMode,
      ip_allowlist_enabled: ipAllowlist !== '',
      auth_header: 'Authorization: Bearer <MCP_API_TOKEN> + X-Jasefly-Ts/Nonce/Sign',
      docs_hint:
        'Один MCP-процесс → много сайтов. Токен + signing secret этого сайта: '
        + siteTokenPath
        + '. В mcp-cms/.env: CMS_SITE_{ID}_TOKEN и CMS_SITE_{ID}_SIGNING_SECRET (legacy: CMS_MCP_TOKEN + CMS_MCP_SIGNING_SECRET).',
      app_url: appUrl,
      runtime,
      site_token_path: siteTokenPath,
      agent_env_keys: {
        multi: 'CMS_SITES + CMS_SITE_{ID}_URL + CMS_SITE_{ID}_TOKEN + CMS_SITE_{ID}_SIGNING_SECRET',
        legacy: 'CMS_URL + CMS_MCP_TOKEN + CMS_MCP_SIGNING_SECRET',
        list_tool: 'cms_sites',
        site_param: 'site',
      },
      multi_site_hint:
        'SoT хостов — только mcp-cms/.env (не sites.js). При ≥2 сайтах в tools передавайте site=id|alias|domain. Rotate оба секрета вместе.',
      cursor_snippet: cursorSnippet,
      docs_url: 'docs/mcp-multi-site.md',
      local_example_env: [
        'CMS_SITES=jasefly,iia3uk',
        'CMS_SITE_JASEFLY_URL=https://jasefly.com',
        'CMS_SITE_JASEFLY_TOKEN=<MCP_API_TOKEN сайта>',
        'CMS_SITE_JASEFLY_SIGNING_SECRET=<MCP_SIGNING_SECRET сайта>',
        'CMS_SITE_JASEFLY_ALIASES=jasefly.com,www.jasefly.com',
        'CMS_SITE_IIA3UK_URL=https://iia3uk.ru',
        'CMS_SITE_IIA3UK_TOKEN=<MCP_API_TOKEN сайта>',
        'CMS_SITE_IIA3UK_SIGNING_SECRET=<MCP_SIGNING_SECRET сайта>',
      ].join('\n'),
    },
    module_load_failures: [],
    module_safe_mode: [],
    // Match PHP SystemHealthService (enabled/configured only — no pending list).
    telegram_deploy_approve: {
      enabled: DeployTelegramApprove.enabled(cfg),
      configured: DeployTelegramApprove.configured(cfg),
    },
  };
}

export function buildUpdatesStatus(cfg: AppConfig): Record<string, unknown> {
  const backendRoot = path.join(REPO_ROOT, 'backend');
  return {
    version: '1.0.0',
    zip_available: false,
    hosting_layout: false,
    web_root: backendRoot,
    api_root: backendRoot,
    max_zip_mb: 2,
    php_upload_max: process.env.BEHAVIOR_PHP_UPLOAD_MAX || '2M',
    php_post_max: process.env.BEHAVIOR_PHP_POST_MAX || '8M',
    last: null,
    telegram_deploy_approve: new DeployTelegramApprove(cfg).statusPublic(),
  };
}

async function liveIndexes(db: Database, table: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const rows = await db.all(`PRAGMA index_list(${table})`);
    for (const r of rows) names.add(String(r.name));
  } catch {
    /* ignore */
  }
  return names;
}

/** PHP BlueprintMigrationService::migrateAll — additive indexes/columns only. */
export async function migrateBlueprintsAll(db: Database): Promise<
  Array<{ key: string; table: string; created: boolean; statements: string[]; error: string | null }>
> {
  const results: Array<{
    key: string;
    table: string;
    created: boolean;
    statements: string[];
    error: string | null;
  }> = [];
  for (const bp of loadRegistrySnapshot().blueprints) {
    const key = String(bp.key);
    const table = String(bp.table);
    const entry = { key, table, created: false, statements: [] as string[], error: null as string | null };
    try {
      if (!(await tableExists(db, table))) {
        results.push(entry);
        continue;
      }
      const indexes = Array.isArray(bp.indexes) ? (bp.indexes as Array<Record<string, unknown>>) : [];
      const live = await liveIndexes(db, table);
      for (const idx of indexes) {
        const name = String(idx.name ?? '');
        if (!name || live.has(name)) continue;
        const cols = Array.isArray(idx.columns) ? idx.columns.map(String) : [];
        if (!cols.length) continue;
        const stmt = `CREATE INDEX "${name}" ON "${table}" (${cols.map((c) => `"${c}"`).join(', ')})`;
        try {
          await db.run(stmt);
          entry.statements.push(stmt);
          live.add(name);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/already exists|duplicate/i.test(msg)) {
            entry.error = msg;
            break;
          }
        }
      }
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
    }
    results.push(entry);
  }
  return results;
}

function migrationBlockedPath(storagePath: string): string {
  return path.join(storagePath, 'migrations', 'blocked');
}

function migrationErrorPath(storagePath: string): string {
  return path.join(storagePath, 'migrations', 'last-error.json');
}

function isMigrationBlocked(storagePath: string): boolean {
  return fs.existsSync(migrationBlockedPath(storagePath));
}

function readMigrationError(storagePath: string): Record<string, unknown> | null {
  const p = migrationErrorPath(storagePath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * PHP SystemModule GET /admin/migrations status(true) + blueprint migrateAll.
 * When seed marks all core+plugin ids applied, pending is empty and auto-apply is a no-op.
 */
export async function migrationStatus(
  db: Database,
  storagePath: string,
): Promise<Record<string, unknown>> {
  await ensureMigrationsMeta(db);
  const appliedRows = await db.all('SELECT id FROM _migrations ORDER BY applied_at, id');
  const applied = appliedRows.map((r) => String(r.id));
  const appliedSet = new Set(applied);

  const pending: string[] = [];
  for (const file of PHP_MIGRATION_FILES) {
    if (!appliedSet.has(file)) pending.push(file);
  }
  for (const id of Object.keys(pluginMigrationFiles()).sort()) {
    if (!appliedSet.has(id)) pending.push(id);
  }

  const lastError = readMigrationError(storagePath);
  const blocked = isMigrationBlocked(storagePath);
  const ok = !lastError && pending.length === 0 && !blocked;
  const blueprints = await migrateBlueprintsAll(db);

  return {
    ok: ok && blueprints.every((b) => b.error === null),
    pending,
    applied,
    just_applied: [],
    blocked,
    error: lastError,
    migrations_dir: migrationsDir(),
    blueprints,
  };
}
