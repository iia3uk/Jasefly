import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { requirePermission } from '../core/permissionMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { runMigrations } from '../db/migrate.js';
import { readContractJson } from '../config.js';
import { hashPassword } from '../auth/password.js';
import { readJsonBody, saveModuleSettings } from './_helpers.js';
import {
  adminGlobalSearch,
  applyContentPack,
  clearLastError,
  getPageRevision,
  getUserFromContext,
  listActivity,
  listPageRevisions,
  loadBlocks,
  loadBlueprint,
  loadBlueprints,
  loadEvents,
  loadModuleCatalog,
  loadPublicRoutes,
  logActivity,
  mcpDiagnosticsSnapshot,
  migrationBlueprints,
  migrationRetry,
  pagesDigest,
  readLastError,
  requireMcpAgent,
  restorePageRevision,
  rekeyLayoutIds,
  schemaSnapshot,
  snapshotPageRevision,
  trashableMap,
  trashEmpty,
  trashEmptyAll,
  trashForceDelete,
  trashIndex,
  trashRestore,
} from '../system/helpers.js';
import {
  buildDashboard,
  buildPageTemplates,
  buildSystemStatus,
  buildUpdatesStatus,
  loadDocsPayload,
  migrationStatus,
} from '../system/systemParity.js';
import { DeployTelegramApprove } from '../support/DeployTelegramApprove.js';

export const name = 'system';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);
  const perm = requirePermission(ctx.auth);
  const gate = [admin, perm] as const;
  const mcp = requireMcpAgent(ctx.auth);
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/docs`, (c) => ok(c, loadDocsPayload()));
    ctx.app.get(`${p}/admin/migrations`, ...gate, async (c) =>
      ok(c, await migrationStatus(ctx.db, ctx.cfg.storagePath)),
    );
    ctx.app.post(`${p}/admin/migrations/run`, ...gate, async (c) => ok(c, await runMigrations(ctx.db)));
    ctx.app.post(`${p}/admin/migrations/retry`, ...gate, async (c) => ok(c, await migrationRetry(ctx.db)));
    ctx.app.post(`${p}/admin/migrations/blueprints`, ...gate, async (c) =>
      ok(c, await migrationBlueprints(ctx.db)),
    );
    ctx.app.get(`${p}/admin/dashboard`, ...gate, async (c) => ok(c, await buildDashboard(ctx.db)));
    ctx.app.get(`${p}/admin/activity`, ...gate, async (c) => {
      const limit = Number(c.req.query('limit') ?? 100);
      const offset = Number(c.req.query('offset') ?? 0);
      let source = String(c.req.query('source') ?? 'all').toLowerCase();
      if (!['all', 'admin', 'mcp'].includes(source)) source = 'all';
      const user = getUserFromContext(c);
      let canMcpFeed = user === 'mcp';
      if (!canMcpFeed && user && typeof user === 'object') {
        const me = await ctx.auth.mePayload(user as import('../db/Database.js').Row);
        const caps = me.capabilities || [];
        canMcpFeed = caps.includes('*') || caps.includes('mcp.manage') || caps.includes('system.manage');
      }
      if (source === 'mcp' && !canMcpFeed) {
        return fail(c, 'Forbidden: insufficient permissions', 403, [], {
          code: 'forbidden',
          capability: 'mcp.manage',
        });
      }
      if (source === 'all' && !canMcpFeed) source = 'admin';
      const items = await listActivity(ctx.db, limit, offset, source);
      return ok(c, items, 200, {
        limit,
        offset,
        source,
        mcp_included: Boolean(canMcpFeed && (source === 'all' || source === 'mcp')),
      });
    });
    ctx.app.get(`${p}/admin/search`, ...gate, async (c) => {
      const q = String(c.req.query('q') ?? '');
      const limit = Number(c.req.query('limit') ?? 20);
      const items = await adminGlobalSearch(ctx.db, q, limit);
      return ok(c, items, 200, { query: q });
    });
    ctx.app.get(`${p}/admin/plugins`, ...gate, async (c) => {
      const catalog = loadModuleCatalog() as Array<Record<string, unknown>>;
      const { isModuleEnabled, CORE_PLUGINS } = await import('../plugins/pluginState.js');
      const enabledMap = new Map<string, boolean>();
      for (const item of catalog) {
        const name = String(item.name ?? '');
        if (!name) continue;
        enabledMap.set(name, await isModuleEnabled(ctx.db, name));
      }
      const out = [];
      for (const item of catalog) {
        const name = String(item.name ?? '');
        if (!name) {
          out.push(item);
          continue;
        }
        const enabled = enabledMap.get(name) === true;
        const requiredBy = catalog
          .filter((m) => {
            const dep = String(m.name ?? '');
            if (!dep || dep === name) return false;
            if (enabledMap.get(dep) !== true) return false;
            const requires = Array.isArray(m.requires) ? m.requires.map(String) : [];
            return requires.includes(name);
          })
          .map((m) => String(m.name));
        const isCore = CORE_PLUGINS.has(name);
        out.push({
          ...item,
          is_enabled: enabled,
          required_by: requiredBy,
          can_disable: enabled && !isCore && requiredBy.length === 0,
        });
      }
      return ok(c, out);
    });
    ctx.app.post(`${p}/admin/plugins/:name/toggle`, ...gate, async (c) => {
      const plug = c.req.param('name');
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      if (['system', 'users'].includes(plug) && body.enabled === false) {
        return fail(c, 'Ядро нельзя отключить', 422);
      }
      if (!(await ctx.db.tableExists('modules'))) return fail(c, 'Plugin not found', 404);
      const row = await ctx.db.one('SELECT * FROM modules WHERE name=?', [plug]);
      const want = body.enabled ? 1 : 0;
      if (!row) {
        // Default-off: first toggle creates the modules row.
        await ctx.db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, ?, NULL)', [plug, want]);
      } else {
        await ctx.db.run('UPDATE modules SET is_enabled=? WHERE name=?', [want, plug]);
      }
      await ctx.events.publish(body.enabled ? 'plugin.enabled' : 'plugin.disabled', { name: plug });
      return ok(c, { name: plug, enabled: Boolean(body.enabled) });
    });
    ctx.app.put(`${p}/admin/plugins/:name/settings`, ...gate, async (c) => {
      const plug = c.req.param('name');
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      if (!(await ctx.db.tableExists('modules'))) return fail(c, 'Plugin not found', 404);
      const row = await ctx.db.one('SELECT * FROM modules WHERE name=?', [plug]);
      if (!row) {
        await ctx.db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, NULL)', [plug]);
      }
      const settings = await saveModuleSettings(ctx.db, plug, body);
      return ok(c, { name: plug, settings });
    });
    ctx.app.post(`${p}/admin/plugins/:name/seed-pages`, ...gate, async (c) => {
      const plug = c.req.param('name');
      if (!(await ctx.db.tableExists('pages'))) {
        return ok(c, { plugin: plug, created: 0, skipped: 0, message: 'No pages table' });
      }
      return ok(c, { plugin: plug, created: 0, skipped: 0, message: 'Seed pages not bundled in Node runtime' });
    });
    ctx.app.get(`${p}/admin/module-catalog`, ...gate, async (c) => ok(c, loadModuleCatalog()));
    ctx.app.get(`${p}/admin/blueprints`, ...gate, async (c) => ok(c, loadBlueprints()));
    ctx.app.get(`${p}/admin/blueprints/:key`, ...gate, async (c) => {
      const doc = loadBlueprint(c.req.param('key'));
      if (!doc) return fail(c, 'Blueprint not found', 404);
      return ok(c, doc);
    });
    ctx.app.get(`${p}/admin/blocks`, ...gate, async (c) => ok(c, loadBlocks()));
    ctx.app.get(`${p}/admin/public-routes`, ...gate, async (c) => ok(c, loadPublicRoutes()));
    ctx.app.get(`${p}/admin/events`, ...gate, async (c) => ok(c, loadEvents()));
    ctx.app.get(`${p}/admin/system/status`, ...gate, async (c) =>
      ok(c, await buildSystemStatus(ctx.db, ctx.cfg)),
    );
    ctx.app.get(`${p}/admin/system/last-error`, ...gate, async (c) => {
      const report = readLastError(ctx.cfg.storagePath);
      return ok(
        c,
        report,
        200,
        {},
        {
          message: report
            ? 'Последняя ошибка API'
            : 'Пока нет записанных ошибок (storage/logs/last-error.json пуст)',
        },
      );
    });
    ctx.app.post(`${p}/admin/system/last-error/clear`, ...gate, async (c) => {
      const cleared = clearLastError(ctx.cfg.storagePath);
      return ok(
        c,
        { cleared },
        200,
        {},
        {
          message: cleared ? 'Лог ошибки очищен' : 'Не удалось удалить файл лога',
        },
      );
    });
    ctx.app.post(`${p}/admin/backup`, ...gate, async (c) => {
      if (ctx.db.driver() !== 'sqlite') {
        return fail(
          c,
          'Backup not implemented for this database driver in Node runtime — use PHP BackupService on shared hosting',
          501,
          null,
          { code: 'backup_unavailable', driver: ctx.db.driver() },
        );
      }
      const dbPath = ctx.cfg.db.path;
      if (!dbPath || !fs.existsSync(dbPath)) {
        return fail(c, 'Database file not found', 500);
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveName = `backup-${stamp}.zip`;
      const backupDir = path.join(ctx.cfg.storagePath, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const archivePath = path.join(backupDir, archiveName);
      const dbBytes = fs.readFileSync(dbPath);
      const zipped = zipSync({ 'database.sqlite': dbBytes });
      fs.writeFileSync(archivePath, zipped);
      return ok(c, {
        ok: true,
        filename: archiveName,
        path: path.relative(ctx.cfg.storagePath, archivePath).replace(/\\/g, '/'),
        bytes: zipped.length,
      });
    });
    ctx.app.get(`${p}/admin/updates`, ...gate, async (c) => ok(c, buildUpdatesStatus(ctx.cfg)));
    ctx.app.post(`${p}/admin/updates`, ...gate, async (c) =>
      fail(
        c,
        'In-panel CMS update (ZIP upload) is not implemented in Node runtime — use SSH deploy pipeline (+ Telegram approve when enabled)',
        501,
        null,
        { code: 'not_implemented' },
      ),
    );

    // Public Telegram webhook (secret_token + chat allowlist inside handler)
    ctx.app.post(`${p}/telegram/deploy-webhook`, async (c) => {
      const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token') || undefined;
      const raw = await c.req.text();
      const result = await new DeployTelegramApprove(ctx.cfg).handleWebhook(secret, raw);
      const status = result.ok === false && result.error === 'bad_secret' ? 401 : 200;
      return c.json(result, status);
    });

    ctx.app.post(`${p}/admin/deploy/telegram/request`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      try {
        const data = await new DeployTelegramApprove(ctx.cfg).request({
          package: String(body.package ?? ''),
          sha256: String(body.sha256 ?? ''),
          requestedBy: getUserFromContext(c) === 'mcp' ? 'mcp' : 'admin',
        });
        return ok(c, data);
      } catch (e) {
        const status = Number((e as { status?: number }).status || 500);
        return fail(c, e instanceof Error ? e.message : String(e), status as 400 | 422 | 500);
      }
    });

    ctx.app.post(`${p}/admin/deploy/telegram/redeem`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      try {
        const data = new DeployTelegramApprove(ctx.cfg).redeem({
          deploy_id: body.deploy_id != null ? String(body.deploy_id) : undefined,
          sha256: body.sha256 != null ? String(body.sha256) : undefined,
        });
        return ok(c, data);
      } catch (e) {
        const status = Number((e as { status?: number }).status || 500);
        const code = (e as { code?: string }).code;
        return fail(
          c,
          e instanceof Error ? e.message : String(e),
          status as 404 | 409 | 410 | 500,
          null,
          code ? { code } : undefined,
        );
      }
    });

    ctx.app.post(`${p}/admin/updates/pending/:id/approve`, ...gate, async (c) => {
      try {
        return ok(c, new DeployTelegramApprove(ctx.cfg).approve(c.req.param('id'), 'admin'));
      } catch (e) {
        const status = Number((e as { status?: number }).status || 500);
        return fail(c, e instanceof Error ? e.message : String(e), status as 404 | 409 | 410 | 500);
      }
    });

    ctx.app.post(`${p}/admin/updates/pending/:id/reject`, ...gate, async (c) => {
      try {
        return ok(c, new DeployTelegramApprove(ctx.cfg).reject(c.req.param('id'), 'admin'));
      } catch (e) {
        const status = Number((e as { status?: number }).status || 500);
        return fail(c, e instanceof Error ? e.message : String(e), status as 404 | 409 | 500);
      }
    });
    ctx.app.get(`${p}/admin/content-pack/info`, ...gate, async (c) =>
      ok(c, {
        version: 1,
        modes: ['replace_content'],
        auth: {
          jwt: 'POST /auth/login → Bearer access_token',
          mcp_token: 'config.local.php mcp_api_token → Authorization: Bearer <token>',
          mcp_token_configured: Boolean(ctx.cfg.mcpApiToken),
        },
        endpoint: 'POST /admin/content-pack/apply',
        note: 'replace_content требует confirm_replace: true',
      }),
    );
    ctx.app.post(`${p}/admin/content-pack/apply`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const pack = (body.pack ?? body) as Record<string, unknown>;
      try {
        const result = await applyContentPack(ctx.db, pack, Boolean(body.confirm_replace));
        const user = getUserFromContext(c);
        if (user) {
          await logActivity(ctx.db, user, 'content_pack.apply', 'cms', null, String(pack.mode ?? 'replace_content'), {
            report: result.report,
          });
        }
        return ok(c, {
          ok: true,
          mode: pack.mode ?? 'replace_content',
          report: result.report,
          message: 'Content pack применён',
        });
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : String(e), 422);
      }
    });
    ctx.app.get(`${p}/admin/trash`, ...gate, async (c) => ok(c, await trashIndex(ctx.db)));
    ctx.app.post(`${p}/admin/trash/:resource/:id/restore`, ...gate, async (c) => {
      const { resource, id } = c.req.param();
      if (!trashableMap()[resource]) return fail(c, 'Resource not trashable', 422);
      if (!(await trashRestore(ctx.db, resource, id))) return fail(c, 'Not found', 404);
      return ok(c, { id: Number(id), resource, message: 'Restored' });
    });
    ctx.app.delete(`${p}/admin/trash/:resource/:id`, ...gate, async (c) => {
      let confirm = ['1', 'true', 'yes'].includes(String(c.req.query('confirm') ?? '').toLowerCase());
      if (!confirm) {
        const body = await c.req.json().catch(() => ({}));
        confirm = Boolean((body as Record<string, unknown>).confirm);
      }
      if (!confirm) return fail(c, 'Permanent deletion requires confirm=true', 422);
      const { resource, id } = c.req.param();
      if (!(await trashForceDelete(ctx.db, resource, id))) return fail(c, 'Not found', 404);
      return ok(c, { message: 'Permanently deleted' });
    });
    ctx.app.post(`${p}/admin/trash/:resource/empty`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      if (!body.confirm) return fail(c, 'Empty trash requires confirm=true', 422);
      const resource = c.req.param('resource');
      const deleted = await trashEmpty(ctx.db, resource);
      return ok(c, { deleted, message: 'Trash emptied' });
    });
    ctx.app.post(`${p}/admin/trash/empty-all`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      if (!body.confirm) return fail(c, 'Empty all trash requires confirm=true', 422);
      const deleted = await trashEmptyAll(ctx.db);
      return ok(c, { deleted, message: 'All trash emptied' });
    });
    ctx.app.get(`${p}/admin/contact-messages`, ...gate, async (c) => {
      if (!(await ctx.db.tableExists('contact_messages'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM contact_messages ORDER BY id DESC'));
    });
    ctx.app.delete(`${p}/admin/contact-messages/:id`, ...gate, async (c) => {
      if (!(await ctx.db.tableExists('contact_messages'))) return fail(c, 'Not found', 404);
      await ctx.db.run('DELETE FROM contact_messages WHERE id=?', [c.req.param('id')]);
      return ok(c, { message: 'Deleted' });
    });
    ctx.app.post(`${p}/admin/contact-messages/:id/mark-read`, ...gate, async (c) => {
      if (!(await ctx.db.tableExists('contact_messages'))) return fail(c, 'Not found', 404);
      const cols = await ctx.db.columns('contact_messages');
      if (cols.includes('is_read')) {
        await ctx.db.run('UPDATE contact_messages SET is_read=1 WHERE id=?', [c.req.param('id')]);
      }
      return ok(c, { message: 'Marked read' });
    });
    ctx.app.put(`${p}/admin/users/password`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const password = String(body.password ?? '');
      if (password.length < 10) return fail(c, 'Password must be at least 10 characters', 422);
      const user = getUserFromContext(c);
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      await ctx.db.run('UPDATE users SET password_hash=? WHERE id=?', [await hashPassword(password), user.id]);
      await logActivity(ctx.db, user, 'password_change', 'user', Number(user.id), String(user.name ?? ''));
      return ok(c, { message: 'Password updated' });
    });
    ctx.app.post(`${p}/auth/2fa/setup`, admin, async (c) => {
      const user = getUserFromContext(c);
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      const full = await ctx.db.one('SELECT * FROM users WHERE id=?', [user.id]);
      if (!full) return fail(c, 'Unauthorized', 401);
      return ok(c, await ctx.auth.setup2fa(full));
    });
    ctx.app.post(`${p}/auth/2fa/enable`, admin, async (c) => {
      const user = getUserFromContext(c);
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const full = await ctx.db.one('SELECT * FROM users WHERE id=?', [user.id]);
      if (!full) return fail(c, 'Unauthorized', 401);
      const res = await ctx.auth.enable2fa(full, String(body.setup_token ?? ''), String(body.code ?? ''));
      if (!res.ok) return fail(c, res.error, res.status as 422);
      return ok(c, res.data);
    });
    ctx.app.post(`${p}/auth/2fa/disable`, admin, async (c) => {
      const user = getUserFromContext(c);
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const full = await ctx.db.one('SELECT * FROM users WHERE id=?', [user.id]);
      if (!full) return fail(c, 'Unauthorized', 401);
      const res = await ctx.auth.disable2fa(full, String(body.password ?? ''), String(body.code ?? ''));
      if (!res.ok) return fail(c, res.error, res.status as 401);
      return ok(c, res.data);
    });
    ctx.app.get(`${p}/admin/pages/:id/revisions`, ...gate, async (c) =>
      ok(c, await listPageRevisions(ctx.db, Number(c.req.param('id')))),
    );
    ctx.app.post(`${p}/admin/pages/:id/revisions`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const user = getUserFromContext(c);
      const authorId = user && user !== 'mcp' ? Number(user.id) : null;
      const revId = await snapshotPageRevision(
        ctx.db,
        Number(c.req.param('id')),
        authorId,
        body.note ? String(body.note) : null,
      );
      if (!revId) return fail(c, 'Page not found', 404);
      return ok(c, { id: revId }, 201);
    });
    ctx.app.get(`${p}/admin/pages/revisions/:revisionId`, ...gate, async (c) => {
      const rev = await getPageRevision(ctx.db, Number(c.req.param('revisionId')));
      if (!rev) return fail(c, 'Revision not found', 404);
      return ok(c, rev);
    });
    ctx.app.post(`${p}/admin/pages/revisions/:revisionId/restore`, ...gate, async (c) => {
      const restored = await restorePageRevision(ctx.db, Number(c.req.param('revisionId')));
      if (!restored) return fail(c, 'Revision not found', 404);
      return ok(c, restored);
    });
    ctx.app.post(`${p}/admin/pages/:id/copy-layout`, ...gate, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const targetId = Number(c.req.param('id'));
      const sourceId = Number(body.source_id ?? 0);
      if (targetId < 1 || sourceId < 1) return fail(c, 'source_id обязателен', 422);
      if (targetId === sourceId) return fail(c, 'Нельзя копировать страницу в саму себя', 422);
      const source = await ctx.db.one('SELECT id, layout_json, title FROM pages WHERE id=?', [sourceId]);
      const target = await ctx.db.one('SELECT id, title FROM pages WHERE id=?', [targetId]);
      if (!source || !target) return fail(c, 'Страница не найдена', 404);
      const layout = source.layout_json;
      if (layout == null || String(layout).trim() === '' || String(layout).trim() === 'null') {
        return fail(c, 'У исходной страницы нет layout для копирования', 422);
      }
      let decoded: Record<string, unknown>;
      try {
        decoded = JSON.parse(String(layout)) as Record<string, unknown>;
      } catch {
        return fail(c, 'Некорректный layout источника', 422);
      }
      const cloned = rekeyLayoutIds(decoded);
      await ctx.db.run('UPDATE pages SET layout_json=? WHERE id=?', [JSON.stringify(cloned), targetId]);
      return ok(c, {
        target_id: targetId,
        source_id: sourceId,
        message: `Стиль (layout) скопирован с «${source.title}» на «${target.title}»`,
      });
    });
    ctx.app.get(`${p}/admin/page-templates`, ...gate, async (c) =>
      ok(c, await buildPageTemplates(ctx.db)),
    );
    ctx.app.post(`${p}/admin/page-templates/ensure`, ...gate, async (c) =>
      ok(c, { created: 0, updated: 0, skipped: 0 }),
    );
    ctx.app.get(`${p}/admin/mcp/diagnostics`, mcp, async (c) => ok(c, await mcpDiagnosticsSnapshot(ctx.cfg, ctx.db)));
    ctx.app.get(`${p}/admin/mcp/last-error`, mcp, async (c) => {
      const report = readLastError(ctx.cfg.storagePath);
      return ok(
        c,
        report,
        200,
        {},
        {
          broken: report !== null,
          message: report ? 'Есть last-error' : 'last-error пуст',
        },
      );
    });
    ctx.app.get(`${p}/admin/mcp/site-map`, mcp, async (c) => ok(c, await pagesDigest(ctx.db)));
    ctx.app.get(`${p}/admin/mcp/pages-digest`, mcp, async (c) => ok(c, await pagesDigest(ctx.db)));
    ctx.app.get(`${p}/admin/mcp/pages-digest/:idOrSlug`, mcp, async (c) => {
      const one = await pagesDigest(ctx.db, c.req.param('idOrSlug'));
      if (!one) return fail(c, 'Страница не найдена', 404);
      return ok(c, one);
    });
    ctx.app.get(`${p}/admin/mcp/schema`, mcp, async (c) => {
      const table = String(c.req.query('table') ?? '');
      const counts = ['1', 'true', 'yes'].includes(String(c.req.query('counts') ?? '0').toLowerCase());
      return ok(c, await schemaSnapshot(ctx.db, table, counts));
    });
    ctx.app.post(`${p}/admin/mcp/changelog`, mcp, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const summary = String(body.summary ?? '').trim();
      if (summary.length < 8) {
        return fail(c, 'summary обязателен (минимум 8 символов) — что изменилось в этом апдейте.', 422);
      }
      const changes = Array.isArray(body.changes)
        ? body.changes.map((x) => String(x).trim()).filter(Boolean)
        : [];
      await logActivity(ctx.db, 'mcp', 'mcp_changelog', 'cms', null, summary, {
        summary,
        changes,
        body: body.body ? String(body.body) : null,
        package: body.package ? String(body.package) : null,
        zip_sha256: body.zip_sha256 ? String(body.zip_sha256) : null,
      });
      return ok(c, { ok: true, summary, changes_count: changes.length, message: 'Changelog записан в журнал MCP' }, 201);
    });
  }
}
