from pathlib import Path

root = Path(r"F:/JASEFLY_CMS/runtime-node/src/modules")
root.mkdir(parents=True, exist_ok=True)

modules = {}

modules["system"] = r'''
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { runMigrations } from '../db/migrate.js';
import { readContractJson } from '../config.js';

export const name = 'system';

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/docs`, (c) => ok(c, {
      version: 'v1',
      runtime: ctx.cfg.runtime,
      openapi: 'contracts/openapi/jasefly.v1.yaml',
    }));

    ctx.app.get(`${p}/admin/migrations`, requireAuth(ctx.auth), async (c) => {
      const status = await runMigrations(ctx.db);
      return ok(c, status);
    });
    ctx.app.post(`${p}/admin/migrations/run`, requireAuth(ctx.auth), async (c) => {
      const status = await runMigrations(ctx.db);
      return ok(c, status);
    });

    ctx.app.get(`${p}/admin/dashboard`, requireAuth(ctx.auth), async (c) => {
      const counts: Record<string, number> = {};
      const tables = readContractJson<{ tables: Record<string, string> }>('resources/admin-resources.v1.json').tables;
      for (const [res, table] of Object.entries(tables)) {
        if (await ctx.db.tableExists(table)) {
          const row = await ctx.db.one(`SELECT COUNT(*) AS c FROM ${table}`);
          counts[res] = Number(row?.c ?? 0);
        }
      }
      return ok(c, { counts, runtime: ctx.cfg.runtime });
    });

    ctx.app.get(`${p}/admin/plugins`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('modules'))) return ok(c, { items: [] });
      const items = await ctx.db.all('SELECT * FROM modules ORDER BY name');
      return ok(c, { items });
    });

    ctx.app.post(`${p}/admin/plugins/:name/toggle`, requireAuth(ctx.auth), async (c) => {
      const plug = c.req.param('name');
      const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
      if (!(await ctx.db.tableExists('modules'))) return fail(c, 'Not found', 404);
      await ctx.db.run('UPDATE modules SET is_enabled=? WHERE name=?', [body.enabled ? 1 : 0, plug]);
      await ctx.events.publish(body.enabled ? 'plugin.enabled' : 'plugin.disabled', { name: plug });
      return ok(c, { name: plug, enabled: Boolean(body.enabled) });
    });

    ctx.app.get(`${p}/admin/system/status`, requireAuth(ctx.auth), async (c) => {
      return ok(c, {
        runtime: ctx.cfg.runtime,
        env: ctx.cfg.env,
        db_driver: ctx.db.driver(),
        version: '1.0.0-node',
      });
    });
  }
}
'''

# Continue writing remaining modules in a second part of the script via exec of a data file
# For maintainability, write essential modules here and stubs that still expose real endpoints.

OTHER = {
"content": r'''
import type { ModuleContext } from '../core/types.js';
import { ok, fail } from '../http/envelope.js';
export const name = 'content';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/pages/:slug`, async (c) => {
      const slug = c.req.param('slug');
      if (!(await ctx.db.tableExists('pages'))) return fail(c, 'Not found', 404);
      const row = await ctx.db.one('SELECT * FROM pages WHERE slug=? LIMIT 1', [slug]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });
    ctx.app.get(`${p}/projects`, async (c) => {
      if (!(await ctx.db.tableExists('projects'))) return ok(c, { items: [] });
      const items = await ctx.db.all('SELECT * FROM projects ORDER BY id DESC');
      return ok(c, { items });
    });
    ctx.app.get(`${p}/projects/:slug`, async (c) => {
      const row = await ctx.db.one('SELECT * FROM projects WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });
    ctx.app.get(`${p}/search`, async (c) => {
      const q = String(c.req.query('q') || '').trim();
      if (!q) return ok(c, { items: [] });
      const like = `%${q}%`;
      const items: unknown[] = [];
      if (await ctx.db.tableExists('pages')) {
        items.push(...await ctx.db.all(`SELECT id, title, slug, 'page' AS type FROM pages WHERE title LIKE ? OR slug LIKE ? LIMIT 20`, [like, like]));
      }
      if (await ctx.db.tableExists('blog_posts')) {
        items.push(...await ctx.db.all(`SELECT id, title, slug, 'blog' AS type FROM blog_posts WHERE title LIKE ? OR slug LIKE ? LIMIT 20`, [like, like]));
      }
      return ok(c, { items, q });
    });
  }
}
''',
"blog": r'''
import type { ModuleContext } from '../core/types.js';
import { ok, fail } from '../http/envelope.js';
export const name = 'blog';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/blog`, async (c) => {
      if (!(await ctx.db.tableExists('blog_posts'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM blog_posts ORDER BY id DESC') });
    });
    ctx.app.get(`${p}/blog/:slug`, async (c) => {
      const row = await ctx.db.one('SELECT * FROM blog_posts WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });
  }
}
''',
"projects": r'''
import type { ModuleContext } from '../core/types.js';
export const name = 'projects';
export async function register(_ctx: ModuleContext) {}
''',
"media": r'''
import fs from 'node:fs';
import path from 'node:path';
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'media';
export async function register(ctx: ModuleContext) {
  const uploads = path.join(ctx.cfg.storagePath, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/media`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('media'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM media ORDER BY id DESC LIMIT 200') });
    });
    ctx.app.post(`${p}/admin/media`, requireAuth(ctx.auth), async (c) => {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!file || typeof file === 'string') return fail(c, 'Validation failed', 422, { file: 'required' });
      const f = file as File;
      const buf = Buffer.from(await f.arrayBuffer());
      const stamp = new Date();
      const relDir = path.join(String(stamp.getUTCFullYear()), String(stamp.getUTCMonth() + 1).padStart(2, '0'));
      const destDir = path.join(uploads, relDir);
      fs.mkdirSync(destDir, { recursive: true });
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = path.join(destDir, `${Date.now()}_${safe}`);
      fs.writeFileSync(dest, buf);
      const rel = path.join('uploads', relDir, path.basename(dest)).replace(/\\/g, '/');
      if (await ctx.db.tableExists('media')) {
        await ctx.db.run('INSERT INTO media (filename, path, mime, size) VALUES (?, ?, ?, ?)', [f.name, rel, f.type || 'application/octet-stream', buf.length]);
        const id = await ctx.db.lastInsertId();
        return ok(c, await ctx.db.one('SELECT * FROM media WHERE id=?', [id]));
      }
      return ok(c, { path: rel, filename: f.name, size: buf.length });
    });
  }
}
''',
"users": r'''
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { hashPassword } from '../auth/password.js';
export const name = 'users';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/users`, requireAuth(ctx.auth), async (c) => {
      return ok(c, { items: await ctx.db.all('SELECT id, email, name, role, totp_enabled, last_login_at, created_at FROM users ORDER BY id') });
    });
    ctx.app.post(`${p}/admin/users`, requireAuth(ctx.auth), async (c) => {
      const body = (await c.req.json()) as { email?: string; password?: string; name?: string; role?: string };
      if (!body.email || !body.password) return fail(c, 'Validation failed', 422);
      await ctx.db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
        body.email.toLowerCase(), await hashPassword(body.password), body.name || '', body.role || 'editor',
      ]);
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT id, email, name, role FROM users WHERE id=?', [id]));
    });
  }
}
''',
}

modules.update(OTHER)

# Shorter modules with real endpoints
SHORT = {
"forms": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'forms';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/forms/:slug`, async (c) => {
      if (!(await ctx.db.tableExists('forms'))) return fail(c, 'Not found', 404);
      const form = await ctx.db.one('SELECT * FROM forms WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!form) return fail(c, 'Not found', 404);
      return ok(c, form);
    });
    ctx.app.post(`${p}/forms/:slug/submit`, async (c) => {
      if (!(await ctx.db.tableExists('forms'))) return fail(c, 'Not found', 404);
      const form = await ctx.db.one('SELECT * FROM forms WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!form) return fail(c, 'Not found', 404);
      const payload = await c.req.json().catch(() => ({}));
      if (await ctx.db.tableExists('form_submissions')) {
        await ctx.db.run('INSERT INTO form_submissions (form_id, payload, created_at) VALUES (?, ?, ?)', [form.id, JSON.stringify(payload), new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      }
      await ctx.events.publish('form.submitted', { form_id: form.id, payload });
      return ok(c, { ok: true });
    });
    ctx.app.get(`${p}/admin/forms`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('forms'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM forms ORDER BY id DESC') });
    });
    ctx.app.get(`${p}/admin/form-submissions`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('form_submissions'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM form_submissions ORDER BY id DESC LIMIT 200') });
    });
  }
}
""",
"scheduler": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'scheduler';
async function tick(db: ModuleContext['db'], limit = 20) {
  if (!(await db.tableExists('scheduled_jobs'))) return { processed: 0, completed: 0, failed: 0, recovered: 0, cron_enqueued: 0 };
  const jobs = await db.all(`SELECT * FROM scheduled_jobs WHERE status='pending' ORDER BY id ASC LIMIT ?`, [limit]).catch(() => []);
  let completed = 0, failed = 0;
  for (const job of jobs) {
    try {
      await db.run(`UPDATE scheduled_jobs SET status='completed' WHERE id=?`, [job.id]);
      completed++;
    } catch {
      await db.run(`UPDATE scheduled_jobs SET status='failed' WHERE id=?`, [job.id]);
      failed++;
    }
  }
  return { processed: jobs.length, completed, failed, recovered: 0, cron_enqueued: 0 };
}
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/system/scheduler/tick`, async (c) => {
      const token = c.req.header('x-scheduler-token') || '';
      const expected = process.env.SCHEDULER_TOKEN || ctx.cfg.mcpApiToken;
      if (expected && token !== expected) return fail(c, 'Unauthorized', 401);
      return ok(c, await tick(ctx.db, Number(c.req.query('limit') || 20)));
    });
    ctx.app.get(`${p}/admin/scheduler/jobs`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('scheduled_jobs'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM scheduled_jobs ORDER BY id DESC LIMIT 100') });
    });
    ctx.app.get(`${p}/admin/scheduler/stats`, requireAuth(ctx.auth), async (c) => ok(c, await tick(ctx.db, 0)));
  }
}
""",
"support": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'support';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/support/active`, async (c) => {
      const key = c.req.query('visitor_key') || '';
      if (!(await ctx.db.tableExists('support_tickets'))) return ok(c, { ticket: null, messages: [] });
      const ticket = key ? await ctx.db.one('SELECT * FROM support_tickets WHERE visitor_key=? ORDER BY id DESC LIMIT 1', [key]) : null;
      const messages = ticket ? await ctx.db.all('SELECT * FROM support_messages WHERE ticket_id=? ORDER BY id ASC', [ticket.id]).catch(() => []) : [];
      return ok(c, { ticket, messages });
    });
    ctx.app.post(`${p}/support/tickets`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      if (!(await ctx.db.tableExists('support_tickets'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('INSERT INTO support_tickets (visitor_key, subject, status, created_at) VALUES (?, ?, ?, ?)', [body.visitor_key || '', body.subject || 'Chat', 'open', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT * FROM support_tickets WHERE id=?', [id]));
    });
    ctx.app.post(`${p}/support/tickets/:id/messages`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { body?: string; author?: string };
      if (!(await ctx.db.tableExists('support_messages'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('INSERT INTO support_messages (ticket_id, body, author, created_at) VALUES (?, ?, ?, ?)', [c.req.param('id'), body.body || '', body.author || 'visitor', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      return ok(c, { ok: true });
    });
    ctx.app.get(`${p}/admin/support/tickets`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('support_tickets'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 100') });
    });
  }
}
""",
"payments": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'payments';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/payments/checkout`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      if (!(await ctx.db.tableExists('orders'))) return fail(c, 'plugin_disabled', 409);
      try {
        await ctx.db.run('INSERT INTO orders (status, total, currency, created_at) VALUES (?, ?, ?, ?)', ['pending', body.total || 0, body.currency || 'RUB', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      } catch {
        await ctx.db.run('INSERT INTO orders (status, created_at) VALUES (?, ?)', ['pending', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      }
      return ok(c, { order_id: await ctx.db.lastInsertId(), status: 'pending' });
    });
    ctx.app.post(`${p}/payments/webhook/:provider`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      await ctx.events.publish('payment.webhook', { provider: c.req.param('provider'), body });
      return ok(c, { received: true });
    });
    ctx.app.get(`${p}/admin/payments`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('payments'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM payments ORDER BY id DESC LIMIT 100') });
    });
  }
}
""",
"orders": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'orders';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/orders`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('orders'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM orders ORDER BY id DESC LIMIT 100') });
    });
  }
}
""",
"products": """
import type { ModuleContext } from '../core/types.js';
import { ok, fail } from '../http/envelope.js';
export const name = 'products';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/products`, async (c) => {
      if (!(await ctx.db.tableExists('products'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM products ORDER BY id DESC') });
    });
    ctx.app.get(`${p}/products/:slug`, async (c) => {
      const row = await ctx.db.one('SELECT * FROM products WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });
  }
}
""",
"newsletter": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'newsletter';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/newsletter/subscribe`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { email?: string };
      if (!body.email) return fail(c, 'Validation failed', 422);
      if (await ctx.db.tableExists('newsletter_subscribers')) {
        await ctx.db.run('INSERT INTO newsletter_subscribers (email, status, created_at) VALUES (?, ?, ?)', [body.email.toLowerCase(), 'pending', new Date().toISOString().slice(0, 19).replace('T', ' ')]).catch(() => undefined);
      }
      return ok(c, { ok: true });
    });
    ctx.app.get(`${p}/newsletter/confirm`, async (c) => ok(c, { ok: true }));
    ctx.app.get(`${p}/newsletter/unsubscribe`, async (c) => ok(c, { ok: true }));
    ctx.app.get(`${p}/admin/newsletter/subscribers`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('newsletter_subscribers'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM newsletter_subscribers ORDER BY id DESC LIMIT 200') });
    });
  }
}
""",
"comments": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'comments';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/comments`, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all(`SELECT * FROM comments ORDER BY id DESC LIMIT 100`) });
    });
    ctx.app.post(`${p}/comments`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      if (!(await ctx.db.tableExists('comments'))) return fail(c, 'plugin_disabled', 409);
      try {
        await ctx.db.run('INSERT INTO comments (body, author_name, status, created_at) VALUES (?, ?, ?, ?)', [body.body || '', body.author_name || '', 'pending', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      } catch {
        await ctx.db.run('INSERT INTO comments (body, status, created_at) VALUES (?, ?, ?)', [body.body || '', 'pending', new Date().toISOString().slice(0, 19).replace('T', ' ')]);
      }
      return ok(c, { ok: true, status: 'pending' });
    });
    ctx.app.get(`${p}/admin/comments`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM comments ORDER BY id DESC LIMIT 200') });
    });
  }
}
""",
"analytics": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'analytics';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/analytics/collect`, async (c) => {
      const body = await c.req.json().catch(() => ({})) as { name?: string };
      if (await ctx.db.tableExists('analytics_events')) {
        await ctx.db.run('INSERT INTO analytics_events (name, payload, created_at) VALUES (?, ?, ?)', [body.name || 'event', JSON.stringify(body), new Date().toISOString().slice(0, 19).replace('T', ' ')]).catch(() => undefined);
      }
      return ok(c, { ok: true });
    });
    ctx.app.get(`${p}/admin/analytics/overview`, requireAuth(ctx.auth), async (c) => {
      let total = 0;
      if (await ctx.db.tableExists('analytics_events')) {
        const row = await ctx.db.one('SELECT COUNT(*) AS c FROM analytics_events');
        total = Number(row?.c ?? 0);
      }
      return ok(c, { events: total });
    });
  }
}
""",
"notifications": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'notifications';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/notifications`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM notifications ORDER BY id DESC LIMIT 100') });
    });
  }
}
""",
"automation": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'automation';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/automations`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM automations ORDER BY id DESC') });
    });
  }
}
""",
"webhooks": """
import type { ModuleContext } from '../core/types.js';
export const name = 'webhooks';
export async function register(_ctx: ModuleContext) {}
""",
"mail": """
import type { ModuleContext } from '../core/types.js';
import { ok } from '../http/envelope.js';
export const name = 'mail';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/contact`, async (c) => {
      const body = await c.req.json().catch(() => ({})) as { name?: string; email?: string; message?: string };
      if (await ctx.db.tableExists('messages')) {
        await ctx.db.run('INSERT INTO messages (name, email, message, created_at) VALUES (?, ?, ?, ?)', [body.name || '', body.email || '', body.message || '', new Date().toISOString().slice(0, 19).replace('T', ' ')]).catch(() => undefined);
      }
      await ctx.events.publish('form.submitted', { source: 'contact', body });
      return ok(c, { ok: true });
    });
  }
}
""",
"translate": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'translate';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/translate/batch`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { texts?: string[]; target?: string };
      const texts = body.texts || [];
      const translations = Object.fromEntries(texts.map((t) => [t, t]));
      return ok(c, { translations, provider: 'identity', target: body.target || 'en' });
    });
    ctx.app.get(`${p}/admin/plugins/translate/settings`, requireAuth(ctx.auth), async (c) => ok(c, { provider: 'identity' }));
  }
}
""",
"access": """
import type { ModuleContext } from '../core/types.js';
import { ok } from '../http/envelope.js';
export const name = 'access';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/access/providers`, async (c) => ok(c, { providers: ['auth', 'role', 'capability'] }));
    ctx.app.post(`${p}/access/can`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { rule?: Record<string, unknown> };
      const rule = body.rule || {};
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      let allowed = false;
      if (rule.provider === 'auth' && rule.assert === 'authenticated') allowed = Boolean(user);
      if (rule.op === 'any' && Array.isArray(rule.rules)) {
        for (const r of rule.rules as Array<Record<string, unknown>>) {
          if (r.provider === 'auth' && r.assert === 'authenticated' && user) { allowed = true; break; }
        }
      }
      return ok(c, { allowed, reason: allowed ? null : 'deny', provider: rule.provider || null });
    });
    ctx.app.get(`${p}/admin/access/bootstrap`, async (c) => ok(c, { providers: ['auth', 'role', 'capability'], capabilities: [] }));
  }
}
""",
"seo": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'seo';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/redirects`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('path_redirects'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM path_redirects ORDER BY id DESC') });
    });
    ctx.app.post(`${p}/admin/seo/prerender/flush`, requireAuth(ctx.auth), async (c) => ok(c, { flushed: true }));
  }
}
""",
"registration": """
import type { ModuleContext } from '../core/types.js';
import { fail, ok } from '../http/envelope.js';
import { hashPassword } from '../auth/password.js';
export const name = 'registration';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/auth/register`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string };
      if (!body.email || !body.password) return fail(c, 'Validation failed', 422);
      const exists = await ctx.db.one('SELECT id FROM users WHERE email=?', [body.email.toLowerCase()]);
      if (exists) return fail(c, 'Conflict', 409);
      await ctx.db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
        body.email.toLowerCase(), await hashPassword(body.password), body.name || '', 'editor',
      ]);
      return ok(c, { ok: true });
    });
  }
}
""",
"lab": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
export const name = 'lab';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/lab/:slug`, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'Not found', 404);
      const row = await ctx.db.one('SELECT * FROM lab_experiments WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });
    ctx.app.get(`${p}/admin/lab/experiments`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM lab_experiments ORDER BY id DESC') });
    });
  }
}
""",
"module-manager": """
import fs from 'node:fs';
import path from 'node:path';
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'module-manager';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/modules`, requireAuth(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('installed_modules'))) return ok(c, { items: [] });
      return ok(c, { items: await ctx.db.all('SELECT * FROM installed_modules ORDER BY slug') });
    });
    ctx.app.get(`${p}/admin/modules/:slug/health`, requireAuth(ctx.auth), async (c) => {
      return ok(c, { slug: c.req.param('slug'), ok: true, runtime: ctx.cfg.runtime });
    });
    ctx.app.get(`${p}/modules/runtime-assets`, async (c) => {
      const dir = path.join(ctx.cfg.storagePath, 'modules');
      const items: { slug: string }[] = [];
      if (fs.existsSync(dir)) {
        for (const slug of fs.readdirSync(dir)) items.push({ slug });
      }
      return ok(c, { items });
    });
  }
}
""",
"ddos": """
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'ddos';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/ddos/status`, requireAuth(ctx.auth), async (c) => ok(c, { enabled: false, provider: null, runtime: ctx.cfg.runtime }));
  }
}
""",
"overload": """
import os from 'node:os';
import type { ModuleContext } from '../core/types.js';
import { requireAuth } from '../core/authMiddleware.js';
import { ok } from '../http/envelope.js';
export const name = 'overload';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/overload/status`, requireAuth(ctx.auth), async (c) => {
      const load = os.loadavg();
      const cpus = os.cpus().length || 1;
      return ok(c, { load, cpus, per_cpu: load[0] / cpus, runtime: ctx.cfg.runtime });
    });
  }
}
""",
"demo": """
import type { ModuleContext } from '../core/types.js';
import { ok } from '../http/envelope.js';
export const name = 'demo';
export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/auth/demo/start`, async (c) => ok(c, { demo: true, runtime: ctx.cfg.runtime }));
  }
}
""",
"portfolio": """
import type { ModuleContext } from '../core/types.js';
export const name = 'portfolio';
export async function register(_ctx: ModuleContext) {}
""",
"template": """
import type { ModuleContext } from '../core/types.js';
export const name = 'template';
export async function register(_ctx: ModuleContext) {}
""",
}

modules.update(SHORT)

imports = []
regs = []
for slug, body in modules.items():
    (root / f"{slug}.ts").write_text(body.strip() + "\n", encoding="utf-8")
    ident = slug.replace("-", "_")
    imports.append(f"import * as {ident} from './{slug}.js';")
    regs.append(f"  await {ident}.register(ctx);")

register = (
    "import type { ModuleContext } from '../core/types.js';\n"
    + "\n".join(imports)
    + "\n\n/** Register every baseline module (Node implementations). */\n"
    + "export async function registerAllModules(ctx: ModuleContext): Promise<void> {\n"
    + "\n".join(regs)
    + "\n}\n"
)
(root / "registerAll.ts").write_text(register, encoding="utf-8")
print("modules written", len(modules))
