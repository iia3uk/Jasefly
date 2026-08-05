import fs from 'node:fs';
import path from 'node:path';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import type { Database, Row } from '../db/Database.js';
import { extname, nowSql, readJsonBody } from './_helpers.js';

export const name = 'media';

function mediaRoot(storagePath: string): string {
  return path.join(storagePath, 'media');
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

async function writeUpload(
  root: string,
  originalName: string,
  buf: Buffer,
): Promise<{ rel: string; abs: string }> {
  const stamp = new Date();
  const relDir = path.join(String(stamp.getUTCFullYear()), String(stamp.getUTCMonth() + 1).padStart(2, '0'));
  const destDir = path.join(root, relDir);
  fs.mkdirSync(destDir, { recursive: true });
  const stored = `${Date.now()}_${safeName(originalName)}`;
  const abs = path.join(destDir, stored);
  fs.writeFileSync(abs, buf);
  const rel = path.join('media', relDir, stored).replace(/\\/g, '/');
  return { rel, abs };
}

async function insertMediaRow(
  db: Database,
  originalName: string,
  relPath: string,
  mime: string,
  size: number,
): Promise<Row | null> {
  if (!(await db.tableExists('media'))) return null;
  const cols = await db.columns('media');
  const data: Record<string, unknown> = {};
  const base = safeName(originalName);
  if (cols.includes('filename')) data.filename = base;
  if (cols.includes('original_name')) data.original_name = originalName;
  if (cols.includes('mime_type')) data.mime_type = mime;
  else if (cols.includes('mime')) data.mime = mime;
  if (cols.includes('extension')) data.extension = extname(originalName);
  if (cols.includes('size_bytes')) data.size_bytes = size;
  else if (cols.includes('size')) data.size = size;
  if (cols.includes('path')) data.path = relPath;
  if (cols.includes('created_at')) data.created_at = nowSql();
  if (cols.includes('updated_at')) data.updated_at = nowSql();
  if (cols.includes('uploaded_at')) data.uploaded_at = nowSql();
  const keys = Object.keys(data);
  if (!keys.length) return null;
  await db.run(
    `INSERT INTO media (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k]),
  );
  const id = await db.lastInsertId();
  return db.one('SELECT * FROM media WHERE id=?', [id]);
}

async function resolveMediaPath(storagePath: string, row: Row): Promise<string | null> {
  const rel = String(row.path ?? row.filename ?? '');
  if (!rel) return null;
  const candidates = [
    path.join(storagePath, rel),
    path.join(storagePath, 'uploads', rel.replace(/^uploads\//, '')),
    path.join(storagePath, rel.replace(/^media\//, 'media/')),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

async function mediaRowWithDisk(
  storagePath: string,
  row: Row,
): Promise<Row & { file_exists?: boolean }> {
  const abs = await resolveMediaPath(storagePath, row);
  return { ...row, file_exists: abs ? fs.existsSync(abs) : false };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);
  const root = mediaRoot(ctx.cfg.storagePath);
  fs.mkdirSync(root, { recursive: true });

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/media`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const page = Math.max(1, Number(c.req.query('page') || 1));
      const perPage = Math.min(200, Math.max(1, Number(c.req.query('per_page') || 50)));
      const offset = (page - 1) * perPage;
      const q = String(c.req.query('q') ?? '').trim();
      const folderId = c.req.query('folder_id');
      const trash = c.req.query('trash') === '1';
      const cols = await ctx.db.columns('media');
      let sql = 'SELECT * FROM media WHERE 1=1';
      const params: unknown[] = [];
      if (cols.includes('deleted_at')) {
        sql += trash ? ' AND deleted_at IS NOT NULL' : ' AND deleted_at IS NULL';
      }
      if (folderId !== undefined && folderId !== null && String(folderId) !== '') {
        if (['root', '0', 'uncategorized'].includes(String(folderId))) {
          sql += ' AND folder_id IS NULL';
        } else {
          sql += ' AND folder_id=?';
          params.push(Number(folderId));
        }
      }
      if (q) {
        sql += ' AND (original_name LIKE ? OR filename LIKE ? OR alt_text LIKE ? OR caption LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }
      sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      params.push(perPage, offset);
      const items = await ctx.db.all(sql, params);
      const enriched = await Promise.all(items.map((row) => mediaRowWithDisk(ctx.cfg.storagePath, row)));
      const totalRow = await ctx.db.one('SELECT COUNT(*) AS c FROM media');
      return ok(c, { items: enriched, total: Number(totalRow?.c ?? 0), page, per_page: perPage });
    });

    ctx.app.get(`${p}/admin/media/unused`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const items = await ctx.db.all('SELECT * FROM media ORDER BY id DESC LIMIT 500');
      const enriched = await Promise.all(items.map((row) => mediaRowWithDisk(ctx.cfg.storagePath, row)));
      return ok(c, enriched);
    });

    ctx.app.get(`${p}/admin/media/missing`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const items = await ctx.db.all('SELECT * FROM media ORDER BY id DESC LIMIT 500');
      const missing = [];
      for (const row of items) {
        const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
        if (!abs || !fs.existsSync(abs)) missing.push(row);
      }
      return ok(c, missing);
    });

    ctx.app.post(`${p}/admin/media/purge-missing`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const items = await ctx.db.all('SELECT * FROM media ORDER BY id DESC LIMIT 5000');
      let purged = 0;
      for (const row of items) {
        const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
        if (!abs || !fs.existsSync(abs)) {
          await ctx.db.run('DELETE FROM media WHERE id=?', [row.id]);
          purged += 1;
        }
      }
      return ok(c, { purged, message: 'Purged missing media' });
    });

    ctx.app.get(`${p}/admin/media/folders`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media_folders'))) return fail(c, 'capability_unavailable', 409);
      const items = await ctx.db.all('SELECT * FROM media_folders ORDER BY name');
      return ok(c, items);
    });

    ctx.app.post(`${p}/admin/media/folders`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media_folders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const name = String(body.name ?? '').trim();
      if (!name) return fail(c, 'Name is required', 422);
      const slug = slugifyFolder(name);
      if (!slug) return fail(c, 'Invalid folder name', 422);
      const parent = body.parent_id;
      await ctx.db.run('INSERT INTO media_folders (name, parent_id, slug) VALUES (?, ?, ?)', [
        name,
        parent !== null && parent !== '' ? Number(parent) : null,
        slug,
      ]);
      const id = await ctx.db.lastInsertId();
      const row = await ctx.db.one('SELECT * FROM media_folders WHERE id=?', [id]);
      return ok(c, row, 201);
    });

    ctx.app.put(`${p}/admin/media/folders/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media_folders'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const name = String(body.name ?? '').trim();
      const parent = body.parent_id;
      const id = c.req.param('id');
      await ctx.db.run('UPDATE media_folders SET name=?, parent_id=?, slug=? WHERE id=?', [
        name,
        parent !== null && parent !== '' ? Number(parent) : null,
        slugifyFolder(name),
        id,
      ]);
      const row = await ctx.db.one('SELECT * FROM media_folders WHERE id=?', [id]);
      return ok(c, row);
    });

    ctx.app.delete(`${p}/admin/media/folders/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media_folders'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM media_folders WHERE id=?', [c.req.param('id')]);
      return ok(c, { message: 'Deleted' });
    });

    ctx.app.put(`${p}/admin/media/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const cols = await ctx.db.columns('media');
      const deleted = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const row = await ctx.db.one(`SELECT * FROM media WHERE id=?${deleted} LIMIT 1`, [id]);
      if (!row) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const sets: string[] = [];
      const params: unknown[] = [];
      if ('folder_id' in body && cols.includes('folder_id')) {
        sets.push('folder_id=?');
        params.push(body.folder_id === null || body.folder_id === '' ? null : Number(body.folder_id));
      }
      if (body.alt_text !== undefined && cols.includes('alt_text')) {
        sets.push('alt_text=?');
        params.push(body.alt_text);
      }
      if (body.caption !== undefined && cols.includes('caption')) {
        sets.push('caption=?');
        params.push(body.caption);
      }
      if (cols.includes('updated_at')) {
        sets.push('updated_at=?');
        params.push(nowSql());
      }
      if (!sets.length) return fail(c, 'No changes', 422);
      params.push(id);
      await ctx.db.run(`UPDATE media SET ${sets.join(', ')} WHERE id=?`, params);
      const updated = await ctx.db.one('SELECT * FROM media WHERE id=?', [id]);
      return ok(c, updated);
    });

    ctx.app.post(`${p}/admin/media/:id/replace`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM media WHERE id=? LIMIT 1', [id]);
      if (!row) return fail(c, 'Not found', 404);

      const contentType = c.req.header('content-type') ?? '';
      let originalName = String(row.original_name ?? row.filename ?? 'upload.bin');
      let mime = String(row.mime_type ?? row.mime ?? 'application/octet-stream');
      let buf: Buffer;

      if (contentType.includes('application/json')) {
        const body = await readJsonBody(c);
        if (body instanceof Response) return body;
        const b64 = String(body.content_base64 ?? body.data ?? '');
        if (!b64) return fail(c, 'Validation failed', 422, { content_base64: 'required' });
        if (body.filename) originalName = String(body.filename);
        if (body.mime_type) mime = String(body.mime_type);
        buf = Buffer.from(b64, 'base64');
      } else {
        const body = await c.req.parseBody();
        const file = body.file ?? body['file[]'];
        if (!file || typeof file === 'string') return fail(c, 'Validation failed', 422, { file: 'required' });
        const f = file as File;
        originalName = f.name;
        mime = f.type || mime;
        buf = Buffer.from(await f.arrayBuffer());
      }

      const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
      if (abs && fs.existsSync(abs)) fs.writeFileSync(abs, buf);
      else {
        const { rel } = await writeUpload(root, originalName, buf);
        await ctx.db.run('UPDATE media SET path=? WHERE id=?', [rel, id]);
      }

      const cols = await ctx.db.columns('media');
      const sets = [];
      const params: unknown[] = [];
      if (cols.includes('mime_type')) {
        sets.push('mime_type=?');
        params.push(mime);
      } else if (cols.includes('mime')) {
        sets.push('mime=?');
        params.push(mime);
      }
      if (cols.includes('size_bytes')) {
        sets.push('size_bytes=?');
        params.push(buf.length);
      } else if (cols.includes('size')) {
        sets.push('size=?');
        params.push(buf.length);
      }
      if (cols.includes('updated_at')) {
        sets.push('updated_at=?');
        params.push(nowSql());
      }
      if (sets.length) {
        params.push(id);
        await ctx.db.run(`UPDATE media SET ${sets.join(', ')} WHERE id=?`, params);
      }

      const updated = await ctx.db.one('SELECT * FROM media WHERE id=?', [id]);
      return ok(c, updated);
    });

    ctx.app.post(`${p}/admin/media`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);

      const contentType = c.req.header('content-type') ?? '';
      let originalName = 'upload.bin';
      let mime = 'application/octet-stream';
      let buf: Buffer;

      if (contentType.includes('application/json')) {
        const body = await readJsonBody(c);
        if (body instanceof Response) return body;
        const b64 = String(body.content_base64 ?? body.data ?? '');
        if (!b64) return fail(c, 'Validation failed', 422, { content_base64: 'required' });
        originalName = String(body.filename ?? body.name ?? 'upload.bin');
        mime = String(body.mime_type ?? body.mime ?? 'application/octet-stream');
        buf = Buffer.from(b64, 'base64');
      } else {
        const body = await c.req.parseBody();
        const file = body.file ?? body['file[]'];
        if (!file || typeof file === 'string') return fail(c, 'Validation failed', 422, { file: 'required' });
        const f = file as File;
        originalName = f.name;
        mime = f.type || 'application/octet-stream';
        buf = Buffer.from(await f.arrayBuffer());
      }

      if (!buf.length) return fail(c, 'Validation failed', 422, { file: 'empty' });

      const { rel } = await writeUpload(root, originalName, buf);
      const row = await insertMediaRow(ctx.db, originalName, rel, mime, buf.length);
      await ctx.events.publish('resource.afterSave', { resource: 'media', table: 'media', id: row?.id, op: 'create' });
      return ok(c, row ?? { path: rel, filename: originalName, size: buf.length, mime_type: mime });
    });

    ctx.app.get(`${p}/media/:id`, async (c) => {
      // PHP MediaService::stream — bare 404 (empty body) when missing/unreadable.
      const empty404 = () => new Response('', { status: 404 });
      if (!(await ctx.db.tableExists('media'))) return empty404();
      const row = await ctx.db.one('SELECT * FROM media WHERE id=? LIMIT 1', [c.req.param('id')]);
      if (!row) return empty404();
      const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
      if (!abs) return empty404();
      const mime = String(row.mime_type ?? row.mime ?? 'application/octet-stream');
      const data = fs.readFileSync(abs);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' },
      });
    });

    ctx.app.delete(`${p}/admin/media/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM media WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
      await ctx.db.run('DELETE FROM media WHERE id=?', [id]);
      await ctx.events.publish('resource.afterDelete', { resource: 'media', table: 'media', id, mode: 'deleted' });
      return ok(c, { id: Number(id), deleted: true });
    });

    ctx.app.post(`${p}/admin/media/:id/destroy`, admin, async (c) => {
      const id = c.req.param('id');
      if (!(await ctx.db.tableExists('media'))) return fail(c, 'capability_unavailable', 409);
      const row = await ctx.db.one('SELECT * FROM media WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const abs = await resolveMediaPath(ctx.cfg.storagePath, row);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
      await ctx.db.run('DELETE FROM media WHERE id=?', [id]);
      await ctx.events.publish('resource.afterDelete', { resource: 'media', table: 'media', id, mode: 'deleted' });
      return ok(c, { id: Number(id), deleted: true });
    });
  }
}
