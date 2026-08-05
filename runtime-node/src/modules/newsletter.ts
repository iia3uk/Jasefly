import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody, subscriberTable } from './_helpers.js';

export const name = 'newsletter';

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function requireTable(
  ctx: ModuleContext,
  c: Parameters<typeof fail>[0],
  table: string,
): Promise<Response | null> {
  if (!(await ctx.db.tableExists(table))) {
    return fail(c, 'capability_unavailable', 409);
  }
  return null;
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/newsletter/subscribe`, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      if (!email || !email.includes('@')) return fail(c, 'Invalid email', 422);

      const cols = await ctx.db.columns(table);
      const confirmToken = crypto.randomBytes(24).toString('hex');
      const data: Record<string, unknown> = { email };
      if (cols.includes('status')) data.status = cols.includes('confirm_token_hash') ? 'pending' : 'active';
      if (cols.includes('source')) data.source = 'api';
      if (cols.includes('confirm_token_hash')) data.confirm_token_hash = tokenHash(confirmToken);
      if (cols.includes('created_at')) data.created_at = nowSql();
      if (cols.includes('name') && body.name) data.name = String(body.name);

      const existing = await ctx.db.one(`SELECT id FROM ${table} WHERE email=?`, [email]);
      if (existing) return ok(c, { ok: true, already_subscribed: true });

      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await ctx.db.lastInsertId();
      await ctx.events.publish('subscriber.created', { id, email });
      const out: Record<string, unknown> = { ok: true, status: data.status };
      if (cols.includes('confirm_token_hash')) out.confirm_token = confirmToken;
      return ok(c, out, 201);
    });

    ctx.app.get(`${p}/newsletter/confirm`, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const token = String(c.req.query('token') ?? '').trim();
      if (!token) return fail(c, 'Invalid token', 422);
      const cols = await ctx.db.columns(table);
      if (!cols.includes('confirm_token_hash')) return ok(c, { ok: true, confirmed: true });
      const row = await ctx.db.one(`SELECT * FROM ${table} WHERE confirm_token_hash=?`, [tokenHash(token)]);
      if (!row) return fail(c, 'Invalid token', 422);
      await ctx.db.run(
        `UPDATE ${table} SET status='active', confirm_token_hash=NULL, confirmed_at=? WHERE id=?`,
        [nowSql(), row.id],
      );
      return ok(c, { ok: true, confirmed: true });
    });

    ctx.app.get(`${p}/newsletter/unsubscribe`, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const tokenQ = String(c.req.query('token') ?? '').trim();
      const email = String(c.req.query('email') ?? '').toLowerCase().trim();
      const cols = await ctx.db.columns(table);
      if (tokenQ && cols.includes('confirm_token_hash')) {
        const row = await ctx.db.one(`SELECT email FROM ${table} WHERE confirm_token_hash=?`, [tokenHash(tokenQ)]);
        if (!row) return fail(c, 'Invalid token', 422);
        await ctx.db.run(`UPDATE ${table} SET status='unsubscribed' WHERE confirm_token_hash=?`, [tokenHash(tokenQ)]);
        return ok(c, { ok: true, unsubscribed: true });
      }
      if (!email) return fail(c, 'Invalid token', 422);
      if (cols.includes('unsubscribed_at')) {
        await ctx.db.run(`UPDATE ${table} SET status='unsubscribed', unsubscribed_at=? WHERE email=?`, [nowSql(), email]);
      } else if (cols.includes('status')) {
        await ctx.db.run(`UPDATE ${table} SET status='unsubscribed' WHERE email=?`, [email]);
      } else {
        await ctx.db.run(`DELETE FROM ${table} WHERE email=?`, [email]);
      }
      return ok(c, { ok: true, unsubscribed: true });
    });

    ctx.app.get(`${p}/admin/newsletter/subscribers`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return ok(c, []);
      return ok(c, await ctx.db.all(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`));
    });

    ctx.app.post(`${p}/admin/newsletter/subscribers`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      if (!email) return fail(c, 'Validation failed', 422);
      const cols = await ctx.db.columns(table);
      const data: Record<string, unknown> = { email, status: String(body.status ?? 'active') };
      if (cols.includes('name') && body.name) data.name = String(body.name);
      if (cols.includes('created_at')) data.created_at = nowSql();
      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one(`SELECT * FROM ${table} WHERE id=?`, [id]), 201);
    });

    ctx.app.put(`${p}/admin/newsletter/subscribers/:id`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const status = String(body.status ?? 'active');
      if (!['pending', 'active', 'unsubscribed', 'bounced'].includes(status)) {
        return fail(c, 'Invalid status', 422);
      }
      const cols = await ctx.db.columns(table);
      if (cols.includes('name')) {
        await ctx.db.run(`UPDATE ${table} SET name=?, status=? WHERE id=?`, [body.name ?? null, status, c.req.param('id')]);
      } else {
        await ctx.db.run(`UPDATE ${table} SET status=? WHERE id=?`, [status, c.req.param('id')]);
      }
      return ok(c, { ok: true });
    });

    ctx.app.delete(`${p}/admin/newsletter/subscribers/:id`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run(`DELETE FROM ${table} WHERE id=?`, [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/newsletter/subscribers/import`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      if (!table) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const csv = String(body.csv ?? '');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      let imported = 0;
      const cols = await ctx.db.columns(table);
      for (const line of lines) {
        const lineEmail = line.split(',')[0]?.trim().toLowerCase();
        if (!lineEmail || !lineEmail.includes('@')) continue;
        const existing = await ctx.db.one(`SELECT id FROM ${table} WHERE email=?`, [lineEmail]);
        if (existing) continue;
        const data: Record<string, unknown> = { email: lineEmail, status: 'active' };
        if (cols.includes('created_at')) data.created_at = nowSql();
        const keys = Object.keys(data);
        await ctx.db.run(
          `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          keys.map((k) => data[k]),
        );
        imported += 1;
      }
      return ok(c, { imported, total: lines.length });
    });

    ctx.app.get(`${p}/admin/newsletter/subscribers/export`, admin, async (c) => {
      const table = await subscriberTable(ctx.db);
      // Match PHP NewsletterService::exportCsv + CsvExport::build (+ UTF-8 BOM).
      const header = ['email', 'name', 'status', 'source', 'confirmed_at', 'created_at'];
      const rows = table
        ? await ctx.db.all(
            `SELECT email, name, status, source, confirmed_at, created_at FROM ${table} ORDER BY id DESC`,
          )
        : [];
      const lines = [header.join(',')];
      for (const row of rows) {
        lines.push(header.map((h) => csvEscape(row[h])).join(','));
      }
      const csv = '\uFEFF' + lines.join('\n') + '\n';
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="newsletter-subscribers.csv"',
        },
      });
    });

    ctx.app.get(`${p}/admin/newsletter/lists`, admin, async (c) => {
      if (!(await ctx.db.tableExists('subscriber_lists'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM subscriber_lists ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/newsletter/lists`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run('INSERT INTO subscriber_lists (name, description) VALUES (?, ?)', [
        body.name ?? '',
        body.description ?? null,
      ]);
      return ok(c, { id: await ctx.db.lastInsertId() }, 201);
    });

    ctx.app.put(`${p}/admin/newsletter/lists/:id`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run('UPDATE subscriber_lists SET name=?, description=? WHERE id=?', [
        body.name ?? '',
        body.description ?? null,
        c.req.param('id'),
      ]);
      return ok(c, { ok: true });
    });

    ctx.app.delete(`${p}/admin/newsletter/lists/:id`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      await ctx.db.run('DELETE FROM subscriber_lists WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.get(`${p}/admin/newsletter/campaigns`, admin, async (c) => {
      if (!(await ctx.db.tableExists('newsletter_campaigns'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM newsletter_campaigns ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/newsletter/campaigns`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const cols = await ctx.db.columns('newsletter_campaigns');
      const data: Record<string, unknown> = {
        name: body.name ?? '',
        subject: body.subject ?? '',
        html: body.html ?? '',
        text_body: body.text_body ?? '',
        list_id: body.list_id ? Number(body.list_id) : null,
      };
      if (cols.includes('created_by')) data.created_by = null;
      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO newsletter_campaigns (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      return ok(c, { id: await ctx.db.lastInsertId() }, 201);
    });

    ctx.app.put(`${p}/admin/newsletter/campaigns/:id`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run(
        'UPDATE newsletter_campaigns SET name=?, subject=?, html=?, text_body=?, list_id=? WHERE id=?',
        [body.name ?? '', body.subject ?? '', body.html ?? '', body.text_body ?? '', body.list_id ?? null, c.req.param('id')],
      );
      return ok(c, { ok: true });
    });

    ctx.app.delete(`${p}/admin/newsletter/campaigns/:id`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      await ctx.db.run('DELETE FROM newsletter_campaigns WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/newsletter/campaigns/:id/send`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const id = c.req.param('id');
      const cols = await ctx.db.columns('newsletter_campaigns');
      if (cols.includes('status')) {
        await ctx.db.run("UPDATE newsletter_campaigns SET status='scheduled' WHERE id=?", [id]);
      }
      return ok(c, { job_id: Number(id) });
    });

    ctx.app.post(`${p}/admin/newsletter/campaigns/:id/test`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const testEmail = String(body.email ?? '').trim();
      if (!testEmail) return fail(c, 'Validation failed', 422, { email: 'required' });
      return ok(c, { ok: true, sent_to: testEmail });
    });

    ctx.app.post(`${p}/admin/newsletter/campaigns/:id/pause`, admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const cols = await ctx.db.columns('newsletter_campaigns');
      if (cols.includes('status')) {
        await ctx.db.run("UPDATE newsletter_campaigns SET status='paused' WHERE id=?", [c.req.param('id')]);
      }
      return ok(c, { ok: true });
    });
  }
}
