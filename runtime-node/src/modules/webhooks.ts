import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { isSafeHttpUrl } from '../support/ssrfGuard.js';

export const name = 'webhooks';

async function postWebhook(url: string, body: { event: string; payload: unknown; secret: string }): Promise<void> {
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (body.secret) {
    headers['X-Jasefly-Signature'] =
      `sha256=${crypto.createHmac('sha256', body.secret).update(payload).digest('hex')}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Webhook POST ${url} failed: HTTP ${res.status}`);
  }
}

async function dispatchWebhooks(
  db: ModuleContext['db'],
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
      await postWebhook(url, {
        event,
        payload,
        secret: String(hook.secret ?? ''),
      });
    } catch (err) {
      console.error(`[webhooks] dispatch failed id=${hook.id} event=${event}:`, err);
    }
  }
}

export async function register(ctx: ModuleContext) {
  ctx.events.subscribe('resource.afterSave', (payload) => dispatchWebhooks(ctx.db, 'resource.afterSave', payload));
  ctx.events.subscribe('page.afterPublish', (payload) => dispatchWebhooks(ctx.db, 'page.afterPublish', payload));
  ctx.events.subscribe('form.submitted', (payload) => dispatchWebhooks(ctx.db, 'form.submitted', payload));

  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    const base = `${p}/admin/webhooks`;

    ctx.app.get(base, admin, async (c) => {
      if (!(await ctx.db.tableExists('webhooks'))) return ok(c, { items: [] });
      const items = await ctx.db.all(
        'SELECT id, event, url, is_active, created_at FROM webhooks ORDER BY id DESC',
      );
      return ok(c, { items });
    });

    ctx.app.post(base, admin, async (c) => {
      if (!(await ctx.db.tableExists('webhooks'))) return fail(c, 'Not found', 404);
      const body = (await c.req.json().catch(() => ({}))) as {
        event?: string;
        url?: string;
        secret?: string;
      };
      const event = String(body.event ?? '').trim();
      const url = String(body.url ?? '').trim();
      const secret = String(body.secret ?? '');
      if (!event || !url) return fail(c, 'Validation failed', 422, { message: 'event and url required' });
      if (!isSafeHttpUrl(url)) return fail(c, 'Invalid or blocked URL', 422);
      await ctx.db.run('INSERT INTO webhooks (event, url, secret, is_active) VALUES (?, ?, ?, 1)', [
        event,
        url,
        secret,
      ]);
      const id = await ctx.db.lastInsertId();
      return ok(c, { id }, 201);
    });

    ctx.app.put(`${base}/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('webhooks'))) return fail(c, 'Not found', 404);
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const field of ['event', 'url', 'secret'] as const) {
        const v = body[field];
        if (typeof v !== 'string') continue;
        if (field === 'url' && !isSafeHttpUrl(v)) return fail(c, 'Invalid or blocked URL', 422);
        sets.push(`${field}=?`);
        params.push(v);
      }
      if ('is_active' in body) {
        sets.push('is_active=?');
        params.push(body.is_active ? 1 : 0);
      }
      if (!sets.length) return fail(c, 'No fields', 422);
      params.push(c.req.param('id'));
      await ctx.db.run(`UPDATE webhooks SET ${sets.join(', ')} WHERE id=?`, params);
      return ok(c, { message: 'Webhook updated' });
    });

    ctx.app.delete(`${base}/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('webhooks'))) return fail(c, 'Not found', 404);
      await ctx.db.run('DELETE FROM webhooks WHERE id=?', [c.req.param('id')]);
      return ok(c, { message: 'Webhook deleted' });
    });

    ctx.app.post(`${p}/webhooks/test`, async (c) => {
      const received = await c.req.json().catch(() => ({}));
      return ok(c, { ok: true, received });
    });
  }
}
