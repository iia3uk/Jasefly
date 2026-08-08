/**
 * Shared Node package helpers (generic) — copied into packages as backend/node/sdk/.
 * Packages must not import runtime-node/src/modules.
 */
import crypto from 'node:crypto';
import type { Context } from 'hono';

export type DbLike = {
  tableExists(t: string): Promise<boolean>;
  columns(t: string): Promise<string[]>;
  one(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null>;
  all(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params?: unknown[]): Promise<unknown>;
};

export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function publicId(): string {
  return crypto.randomBytes(13).toString('hex');
}

export async function notDeletedClause(db: DbLike, table: string): Promise<string> {
  const cols = await db.columns(table);
  return cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
}

export async function readJsonBody(
  c: Context,
  fail: (c: Context, error: string, status?: number) => Response,
): Promise<Record<string, unknown> | Response> {
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

export async function loadModuleSettings(db: DbLike, name: string): Promise<Record<string, unknown>> {
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
  db: DbLike,
  name: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cur = await loadModuleSettings(db, name);
  const next = { ...cur, ...patch };
  const exists = await db.one('SELECT name FROM modules WHERE name=?', [name]);
  if (exists) {
    await db.run('UPDATE modules SET settings=? WHERE name=?', [JSON.stringify(next), name]);
  } else {
    await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 0, ?)', [
      name,
      JSON.stringify(next),
    ]);
  }
  return next;
}

/** PHP AdminController empty-list parity when a module table is not migrated yet. */
export async function okListOrEmpty(
  c: Context,
  db: DbLike,
  table: string,
  rows: () => Promise<unknown[]>,
  okFn: (c: Context, data: unknown, status?: number, meta?: Record<string, unknown>) => unknown,
  status = 200,
) {
  if (!(await db.tableExists(table))) {
    return okFn(c, [], status, {
      warning: `Таблица «${table}» ещё не создана — выполните миграции.`,
    });
  }
  return okFn(c, await rows(), status);
}
