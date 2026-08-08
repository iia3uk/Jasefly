import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';

type FetchFn = ReturnType<PlatformContext['http']>['fetch'];
import type { DbLike } from './sdk/helpers.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,} from './sdk/helpers.js';

import crypto from 'node:crypto';


async function postWebhook(fetchFn: FetchFn, url: string, body: { event: string; payload: unknown; secret: string }): Promise<void> {
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (body.secret) {
    headers['X-Jasefly-Signature'] =
      `sha256=${crypto.createHmac('sha256', body.secret).update(payload).digest('hex')}`;
  }
  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: payload,
    timeoutMs: 10_000,
  });
  if (!res.ok) {
    throw new Error(`Webhook POST ${url} failed: HTTP ${res.status}`);
  }
}

async function dispatchWebhooks(
  db: DbLike,
  fetchFn: FetchFn,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!(await db.tableExists('webhooks'))) return;
  let hooks: Record<string, unknown>[];
  try {
    hooks = await db.all('SELECT * FROM webhooks WHERE is_active = 1');
  } catch (err) {
    console.error('[webhooks] failed to load subscriptions:', err);
    return;
  }
  for (const hook of hooks) {
    const hookEvent = String(hook.event ?? '*');
    if (hookEvent !== '*' && hookEvent !== event) continue;
    const url = String(hook.url ?? '');
    if (!url) continue;
    try {
      await postWebhook(fetchFn, url, {
        event,
        payload,
        secret: String(hook.secret ?? ''),
      });
    } catch (err) {
      console.error(`[webhooks] dispatch failed id=${hook.id} event=${event}:`, err);
    }
  }
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const manage = http.permission('integrations.manage');
  const crud = ctx.adminResources();
  void crud;

  // Canonical cross-runtime event names (PHP + Node)
  events.subscribe('resource.afterSave', (payload) => dispatchWebhooks(db, http.fetch.bind(http), 'resource.afterSave', payload));
  events.subscribe('page.afterPublish', (payload) => dispatchWebhooks(db, http.fetch.bind(http), 'page.afterPublish', payload));
  events.subscribe('form.submitted', (payload) => dispatchWebhooks(db, http.fetch.bind(http), 'form.submitted', payload));
  events.subscribe('contact.message', (payload) => dispatchWebhooks(db, http.fetch.bind(http), 'contact.message', payload));


    const baseRel = '/admin/webhooks';

    http.get(baseRel, admin, async (c) => {
      if (!(await db.tableExists('webhooks'))) return http.ok(c, []);
      const items = await db.all(
        'SELECT id, event, url, is_active, created_at FROM webhooks ORDER BY id DESC',
      );
      return http.ok(c, items);
    });

    http.post(baseRel, admin, manage, async (c) => {
      if (!(await db.tableExists('webhooks'))) return http.fail(c, 'Not found', 404);
      const body = (await c.req.json().catch(() => ({}))) as {
        event?: string;
        url?: string;
        secret?: string;
      };
      const event = String(body.event ?? '').trim();
      const url = String(body.url ?? '').trim();
      const secret = String(body.secret ?? '');
      if (!event || !url) return http.fail(c, 'Validation failed', 422, { message: 'event and url required' });
      if (!(await (async (u) => { try { await http.fetch(u); return true; } catch { return false; } })(url))) return http.fail(c, 'Invalid or blocked URL', 422);
      await db.run('INSERT INTO webhooks (event, url, secret, is_active) VALUES (?, ?, ?, 1)', [
        event,
        url,
        secret,
      ]);
      const id = await db.lastInsertId();
      return http.ok(c, { id }, 201);
    });

    http.put(`${baseRel}/:id`, admin, manage, async (c) => {
      if (!(await db.tableExists('webhooks'))) return http.fail(c, 'Not found', 404);
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const field of ['event', 'url', 'secret'] as const) {
        const v = body[field];
        if (typeof v !== 'string') continue;
        if (field === 'url' && !(await (async (u) => { try { await http.fetch(u); return true; } catch { return false; } })(v))) return http.fail(c, 'Invalid or blocked URL', 422);
        sets.push(`${field}=?`);
        params.push(v);
      }
      if ('is_active' in body) {
        sets.push('is_active=?');
        params.push(body.is_active ? 1 : 0);
      }
      if (!sets.length) return http.fail(c, 'No fields', 422);
      params.push(c.req.param('id'));
      await db.run(`UPDATE webhooks SET ${sets.join(', ')} WHERE id=?`, params);
      return http.ok(c, { message: 'Webhook updated' });
    });

    http.delete(`${baseRel}/:id`, admin, manage, async (c) => {
      if (!(await db.tableExists('webhooks'))) return http.fail(c, 'Not found', 404);
      await db.run('DELETE FROM webhooks WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { message: 'Webhook deleted' });
    });

    http.post('/webhooks/test', async (c) => {
      let received: unknown = [];
      try {
        const text = await c.req.text();
        if (text.trim() !== '') {
          received = JSON.parse(text);
        }
      } catch {
        received = [];
      }
      // PHP Request::all() on empty JSON object becomes [].
      if (
        received &&
        typeof received === 'object' &&
        !Array.isArray(received) &&
        Object.keys(received as object).length === 0
      ) {
        received = [];
      }
      return http.ok(c, { ok: true, received });
    });
  
}
