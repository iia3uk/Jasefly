import crypto from 'node:crypto';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Database, Row } from '../db/Database.js';
import { fail, ok } from '../http/envelope.js';

/** PHP AdminController empty-list parity when a module table is not migrated yet. */
export async function okListOrEmpty(
  c: Context,
  db: Database,
  table: string,
  rows: () => Promise<unknown[]>,
  status: ContentfulStatusCode = 200,
) {
  if (!(await db.tableExists(table))) {
    return ok(c, [], status, {
      warning: `Таблица «${table}» ещё не создана — выполните миграции.`,
    });
  }
  return ok(c, await rows(), status);
}

export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export async function readJsonBody(c: Context): Promise<Record<string, unknown> | Response> {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  } catch {
    return fail(c, 'Validation failed', 422);
  }
}

export function stripPassword(row: Row | null): Row | null {
  if (!row) return null;
  const out = { ...row };
  delete out.password_hash;
  return out;
}

export function stripPasswords(rows: Row[]): Row[] {
  return rows.map((r) => stripPassword(r)!);
}

export function publicId(): string {
  return crypto.randomBytes(13).toString('hex');
}

export function extname(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export async function moduleSettings(db: Database, name: string): Promise<Record<string, unknown>> {
  if (!(await db.tableExists('modules'))) return {};
  const row = await db.one('SELECT settings FROM modules WHERE name=?', [name]);
  if (!row?.settings) return {};
  if (typeof row.settings === 'object' && row.settings !== null) {
    return row.settings as Record<string, unknown>;
  }
  if (typeof row.settings === 'string' && row.settings.trim()) {
    try {
      return JSON.parse(row.settings) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export async function saveModuleSettings(
  db: Database,
  name: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const current = await moduleSettings(db, name);
  const merged = { ...current, ...patch };
  if (await db.tableExists('modules')) {
    await db.run('UPDATE modules SET settings=? WHERE name=?', [JSON.stringify(merged), name]);
  }
  return merged;
}

export async function subscriberTable(db: Database): Promise<string | null> {
  if (await db.tableExists('subscribers')) return 'subscribers';
  if (await db.tableExists('newsletter_subscribers')) return 'newsletter_subscribers';
  return null;
}

export async function notDeletedClause(db: Database, table: string): Promise<string> {
  const cols = await db.columns(table);
  return cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
}
