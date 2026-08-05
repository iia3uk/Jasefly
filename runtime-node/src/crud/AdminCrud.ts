import type { Context } from 'hono';
import { readContractJson } from '../config.js';
import type { Database, Row } from '../db/Database.js';
import { fail, ok } from '../http/envelope.js';
import type { EventBus } from '../platform/events.js';

interface ResourcesDoc {
  tables: Record<string, string>;
  singletons: Record<string, string>;
  slug_tables: Record<string, { table: string; type: string }>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180);
}

export class AdminCrud {
  private resources: ResourcesDoc;

  constructor(
    private db: Database,
    private events: EventBus,
  ) {
    this.resources = readContractJson<ResourcesDoc>('resources/admin-resources.v1.json');
  }

  tableFor(resource: string): string | null {
    return this.resources.tables[resource] ?? null;
  }

  singletonTable(resource: string): string | null {
    return this.resources.singletons[resource] ?? null;
  }

  private async notDeletedClause(table: string): Promise<string> {
    const cols = await this.db.columns(table);
    return cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
  }

  private async writable(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (table === 'pages' && 'layout' in data && !('layout_json' in data)) {
      data = { ...data, layout_json: data.layout };
      delete data.layout;
    }
    const columns = await this.db.columns(table);
    const out: Record<string, unknown> = {};
    const htmlColumns = new Set(['content', 'description', 'short_description', 'excerpt', 'html', 'bio', 'text']);
    for (const [key, value] of Object.entries(data)) {
      if (!columns.includes(key) || ['id', 'created_at', 'updated_at', 'deleted_at'].includes(key)) continue;
      if (value !== null && typeof value === 'object') {
        out[key] = JSON.stringify(value);
      } else if (typeof value === 'string' && htmlColumns.has(key)) {
        out[key] = value; // sanitizer parity later; baseline stores string
      } else {
        out[key] = value;
      }
    }
    if (out.title && !out.slug && columns.includes('slug')) {
      out.slug = slugify(String(out.title));
    }
    if (out.name && !out.slug && columns.includes('slug')) {
      out.slug = slugify(String(out.name));
    }
    if (out.slug && columns.includes('slug')) {
      out.slug = slugify(String(out.slug));
    }
    return out;
  }

  async list(c: Context, resource: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    // Match PHP AdminController::index — empty array (+ warning) when table missing.
    if (!(await this.db.tableExists(table))) {
      return ok(c, [], 200, {
        warning: `Таблица «${table}» ещё не создана — выполните миграции.`,
      });
    }
    const del = await this.notDeletedClause(table);
    const cols = await this.db.columns(table);
    const order = cols.includes('sort_order') ? 'sort_order, id DESC' : 'id DESC';
    const items = await this.db.all(`SELECT * FROM ${table} WHERE 1=1${del} ORDER BY ${order}`);
    return ok(c, items);
  }

  async show(c: Context, resource: string, id: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const del = await this.notDeletedClause(table);
    const row = await this.db.one(`SELECT * FROM ${table} WHERE id=?${del}`, [id]);
    if (!row) return fail(c, 'Not found', 404);
    return ok(c, row);
  }

  async create(c: Context, resource: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    await this.events.publish('resource.beforeSave', { resource, table, data: body, op: 'create' });
    const data = await this.writable(table, body);
    const keys = Object.keys(data);
    if (!keys.length) return fail(c, 'Validation failed', 422, { message: 'No writable fields' });
    const placeholders = keys.map(() => '?').join(',');
    await this.db.run(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`,
      keys.map((k) => data[k]),
    );
    const id = await this.db.lastInsertId();
    const row = await this.db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
    await this.events.publish('resource.afterSave', { resource, table, id, data: row, op: 'create' });
    return ok(c, row);
  }

  async update(c: Context, resource: string, id: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const existing = await this.db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
    if (!existing) return fail(c, 'Not found', 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    await this.events.publish('resource.beforeSave', { resource, table, id, data: body, op: 'update' });
    const data = await this.writable(table, body);
    const keys = Object.keys(data);
    if (!keys.length) return fail(c, 'Validation failed', 422);
    const sets = keys.map((k) => `${k}=?`).join(',');
    await this.db.run(`UPDATE ${table} SET ${sets} WHERE id=?`, [...keys.map((k) => data[k]), id]);
    const row = await this.db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
    await this.events.publish('resource.afterSave', { resource, table, id, data: row, op: 'update' });
    return ok(c, row);
  }

  async remove(c: Context, resource: string, id: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const existing = await this.db.one(`SELECT * FROM ${table} WHERE id=?`, [id]);
    if (!existing) return fail(c, 'Not found', 404);
    await this.events.publish('resource.beforeDelete', { resource, table, id });
    const cols = await this.db.columns(table);
    let mode = 'deleted';
    if (cols.includes('deleted_at')) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.db.run(`UPDATE ${table} SET deleted_at=? WHERE id=?`, [now, id]);
      mode = 'trash';
    } else {
      await this.db.run(`DELETE FROM ${table} WHERE id=?`, [id]);
    }
    await this.events.publish('resource.afterDelete', { resource, table, id, mode });
    return ok(c, { id, mode });
  }

  async getSingleton(c: Context, resource: string) {
    const table = this.singletonTable(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    if (!(await this.db.tableExists(table))) return ok(c, null);
    const row = await this.db.one(`SELECT * FROM ${table} LIMIT 1`);
    return ok(c, row ?? null);
  }

  async putSingleton(c: Context, resource: string) {
    const table = this.singletonTable(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await this.writable(table, body);
    const existing = await this.db.one(`SELECT * FROM ${table} LIMIT 1`);
    if (!existing) {
      const keys = Object.keys(data);
      await this.db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
    } else {
      const keys = Object.keys(data);
      if (keys.length) {
        await this.db.run(
          `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
          [...keys.map((k) => data[k]), existing.id],
        );
      }
    }
    const row = await this.db.one(`SELECT * FROM ${table} LIMIT 1`);
    return ok(c, row ?? {});
  }

  decodeJsonFields(row: Row | null): Row | null {
    if (!row) return null;
    const out: Row = { ...row };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
        try {
          out[k] = JSON.parse(v);
        } catch {
          /* keep */
        }
      }
    }
    return out;
  }

  async publish(c: Context, resource: string, id: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    const status = String(body.status ?? 'published');
    if (!['draft', 'published', 'archived'].includes(status)) {
      return fail(c, 'Invalid status', 422);
    }
    const del = await this.notDeletedClause(table);
    const cols = await this.db.columns(table);
    if (status === 'published' && cols.includes('published_at')) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.db.run(
        `UPDATE ${table} SET status=?, published_at=COALESCE(published_at, ?) WHERE id=?${del}`,
        [status, now, id],
      );
    } else if (cols.includes('status')) {
      await this.db.run(`UPDATE ${table} SET status=? WHERE id=?${del}`, [status, id]);
    } else {
      return fail(c, 'Not publishable', 422);
    }
    await this.events.publish('page.afterPublish', {
      pageId: Number(id),
      resource,
      status,
    });
    return ok(c, { message: 'Status updated', status });
  }

  async reorder(c: Context, resource: string) {
    const table = this.tableFor(resource);
    if (!table) return fail(c, 'Unknown resource', 404);
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown[]; items?: unknown[] };
    const ids = Array.isArray(body.ids) ? body.ids : Array.isArray(body.items) ? body.items : [];
    if (!ids.length) return fail(c, 'Validation failed', 422, { message: 'ids required' });
    const cols = await this.db.columns(table);
    if (!cols.includes('sort_order')) return fail(c, 'Not orderable', 422);
    for (let i = 0; i < ids.length; i++) {
      await this.db.run(`UPDATE ${table} SET sort_order=? WHERE id=?`, [i, ids[i]]);
    }
    return ok(c, { message: 'Reordered' });
  }
}
