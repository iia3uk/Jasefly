import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,
} from './sdk/helpers.js';

import crypto from 'node:crypto';


function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function subscriberTable(db: { tableExists(t: string): Promise<boolean> }): Promise<string | null> {
  if (await db.tableExists('subscribers')) return 'subscribers';
  if (await db.tableExists('newsletter_subscribers')) return 'newsletter_subscribers';
  return null;
}

async function requireTable(
  ctx: PlatformContext,
  c: Context,
  table: string,
): Promise<Response | null> {
  if (!(await ctx.database().tableExists(table))) {
    return ctx.http().fail(c, 'capability_unavailable', 409);
  }
  return null;
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('newsletter.campaign.send', async (payload) => {
    // Package-owned campaign send — real work when campaigns table/payload present.
    if (!(await db.tableExists('newsletter_campaigns'))) return;
    const campaignId = Number(payload.campaign_id ?? payload.id ?? 0);
    if (!campaignId) return;
    const cols = await db.columns('newsletter_campaigns');
    if (cols.includes('status')) {
      await db.run(
        "UPDATE newsletter_campaigns SET status='sending', updated_at=? WHERE id=?",
        [nowSql(), campaignId],
      ).catch(() => undefined);
    }
    await events.publish('newsletter.campaign.send', { campaign_id: campaignId, ...payload });
  });
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.post('/newsletter/subscribe', async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      if (!email || !email.includes('@')) return http.fail(c, 'Invalid email', 422);

      const cols = await db.columns(table);
      const confirmToken = crypto.randomBytes(24).toString('hex');
      const data: Record<string, unknown> = { email };
      if (cols.includes('status')) data.status = cols.includes('confirm_token_hash') ? 'pending' : 'active';
      if (cols.includes('source')) data.source = 'api';
      if (cols.includes('confirm_token_hash')) data.confirm_token_hash = tokenHash(confirmToken);
      if (cols.includes('created_at')) data.created_at = nowSql();
      if (cols.includes('name') && body.name) data.name = String(body.name);

      const existing = await db.one(`SELECT id FROM ${table} WHERE email=?`, [email]);
      if (existing) return http.ok(c, { ok: true, already_subscribed: true });

      const keys = Object.keys(data);
      await db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await db.lastInsertId();
      await events.publish('subscriber.created', { id, email });
      const out: Record<string, unknown> = { ok: true, status: data.status };
      if (cols.includes('confirm_token_hash')) out.confirm_token = confirmToken;
      return http.ok(c, out, 201);
    });

    http.get('/newsletter/confirm', async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const token = String(c.req.query('token') ?? '').trim();
      if (!token) return http.fail(c, 'Invalid token', 422);
      const cols = await db.columns(table);
      if (!cols.includes('confirm_token_hash')) return http.ok(c, { ok: true, confirmed: true });
      const row = await db.one(`SELECT * FROM ${table} WHERE confirm_token_hash=?`, [tokenHash(token)]);
      if (!row) return http.fail(c, 'Invalid token', 422);
      await db.run(
        `UPDATE ${table} SET status='active', confirm_token_hash=NULL, confirmed_at=? WHERE id=?`,
        [nowSql(), row.id],
      );
      return http.ok(c, { ok: true, confirmed: true });
    });

    http.get('/newsletter/unsubscribe', async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const tokenQ = String(c.req.query('token') ?? '').trim();
      const email = String(c.req.query('email') ?? '').toLowerCase().trim();
      const cols = await db.columns(table);
      if (tokenQ && cols.includes('confirm_token_hash')) {
        const row = await db.one(`SELECT email FROM ${table} WHERE confirm_token_hash=?`, [tokenHash(tokenQ)]);
        if (!row) return http.fail(c, 'Invalid token', 422);
        await db.run(`UPDATE ${table} SET status='unsubscribed' WHERE confirm_token_hash=?`, [tokenHash(tokenQ)]);
        return http.ok(c, { ok: true, unsubscribed: true });
      }
      if (!email) return http.fail(c, 'Invalid token', 422);
      if (cols.includes('unsubscribed_at')) {
        await db.run(`UPDATE ${table} SET status='unsubscribed', unsubscribed_at=? WHERE email=?`, [nowSql(), email]);
      } else if (cols.includes('status')) {
        await db.run(`UPDATE ${table} SET status='unsubscribed' WHERE email=?`, [email]);
      } else {
        await db.run(`DELETE FROM ${table} WHERE email=?`, [email]);
      }
      return http.ok(c, { ok: true, unsubscribed: true });
    });

    http.get('/admin/newsletter/subscribers', admin, async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.ok(c, []);
      return http.ok(c, await db.all(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`));
    });

    http.post('/admin/newsletter/subscribers', admin, async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const email = String(body.email ?? '').toLowerCase().trim();
      if (!email) return http.fail(c, 'Validation failed', 422);
      const cols = await db.columns(table);
      const data: Record<string, unknown> = { email, status: String(body.status ?? 'active') };
      if (cols.includes('name') && body.name) data.name = String(body.name);
      if (cols.includes('created_at')) data.created_at = nowSql();
      const keys = Object.keys(data);
      await db.run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await db.lastInsertId();
      return http.ok(c, await db.one(`SELECT * FROM ${table} WHERE id=?`, [id]), 201);
    });

    http.put('/admin/newsletter/subscribers/:id', admin, async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const status = String(body.status ?? 'active');
      if (!['pending', 'active', 'unsubscribed', 'bounced'].includes(status)) {
        return http.fail(c, 'Invalid status', 422);
      }
      const cols = await db.columns(table);
      if (cols.includes('name')) {
        await db.run(`UPDATE ${table} SET name=?, status=? WHERE id=?`, [body.name ?? null, status, c.req.param('id')]);
      } else {
        await db.run(`UPDATE ${table} SET status=? WHERE id=?`, [status, c.req.param('id')]);
      }
      return http.ok(c, { ok: true });
    });

    http.delete('/admin/newsletter/subscribers/:id', admin, async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      await db.run(`DELETE FROM ${table} WHERE id=?`, [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });

    http.post('/admin/newsletter/subscribers/import', admin, async (c) => {
      const table = await subscriberTable(db);
      if (!table) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const csv = String(body.csv ?? '');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      let imported = 0;
      const cols = await db.columns(table);
      for (const line of lines) {
        const lineEmail = line.split(',')[0]?.trim().toLowerCase();
        if (!lineEmail || !lineEmail.includes('@')) continue;
        const existing = await db.one(`SELECT id FROM ${table} WHERE email=?`, [lineEmail]);
        if (existing) continue;
        const data: Record<string, unknown> = { email: lineEmail, status: 'active' };
        if (cols.includes('created_at')) data.created_at = nowSql();
        const keys = Object.keys(data);
        await db.run(
          `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          keys.map((k) => data[k]),
        );
        imported += 1;
      }
      return http.ok(c, { imported, total: lines.length });
    });

    http.get('/admin/newsletter/subscribers/export', admin, async (c) => {
      const table = await subscriberTable(db);
      // Match PHP NewsletterService::exportCsv + CsvExport::build (+ UTF-8 BOM).
      const header = ['email', 'name', 'status', 'source', 'confirmed_at', 'created_at'];
      const rows = table
        ? await db.all(
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

    http.get('/admin/newsletter/lists', admin, async (c) => {
      if (!(await db.tableExists('subscriber_lists'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM subscriber_lists ORDER BY id DESC'));
    });

    http.post('/admin/newsletter/lists', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      await db.run('INSERT INTO subscriber_lists (name, description) VALUES (?, ?)', [
        body.name ?? '',
        body.description ?? null,
      ]);
      return http.ok(c, { id: await db.lastInsertId() }, 201);
    });

    http.put('/admin/newsletter/lists/:id', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      await db.run('UPDATE subscriber_lists SET name=?, description=? WHERE id=?', [
        body.name ?? '',
        body.description ?? null,
        c.req.param('id'),
      ]);
      return http.ok(c, { ok: true });
    });

    http.delete('/admin/newsletter/lists/:id', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'subscriber_lists');
      if (blocked) return blocked;
      await db.run('DELETE FROM subscriber_lists WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });

    http.get('/admin/newsletter/campaigns', admin, async (c) => {
      if (!(await db.tableExists('newsletter_campaigns'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM newsletter_campaigns ORDER BY id DESC'));
    });

    http.post('/admin/newsletter/campaigns', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const cols = await db.columns('newsletter_campaigns');
      const data: Record<string, unknown> = {
        name: body.name ?? '',
        subject: body.subject ?? '',
        html: body.html ?? '',
        text_body: body.text_body ?? '',
        list_id: body.list_id ? Number(body.list_id) : null,
      };
      if (cols.includes('created_by')) data.created_by = null;
      const keys = Object.keys(data);
      await db.run(
        `INSERT INTO newsletter_campaigns (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      return http.ok(c, { id: await db.lastInsertId() }, 201);
    });

    http.put('/admin/newsletter/campaigns/:id', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      await db.run(
        'UPDATE newsletter_campaigns SET name=?, subject=?, html=?, text_body=?, list_id=? WHERE id=?',
        [body.name ?? '', body.subject ?? '', body.html ?? '', body.text_body ?? '', body.list_id ?? null, c.req.param('id')],
      );
      return http.ok(c, { ok: true });
    });

    http.delete('/admin/newsletter/campaigns/:id', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      await db.run('DELETE FROM newsletter_campaigns WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });

    http.post('/admin/newsletter/campaigns/:id/send', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const id = c.req.param('id');
      const cols = await db.columns('newsletter_campaigns');
      if (cols.includes('status')) {
        await db.run("UPDATE newsletter_campaigns SET status='scheduled' WHERE id=?", [id]);
      }
      return http.ok(c, { job_id: Number(id) });
    });

    http.post('/admin/newsletter/campaigns/:id/test', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const testEmail = String(body.email ?? '').trim();
      if (!testEmail) return http.fail(c, 'Validation failed', 422, { email: 'required' });
      return http.ok(c, { ok: true, sent_to: testEmail });
    });

    http.post('/admin/newsletter/campaigns/:id/pause', admin, async (c) => {
      const blocked = await requireTable(ctx, c, 'newsletter_campaigns');
      if (blocked) return blocked;
      const cols = await db.columns('newsletter_campaigns');
      if (cols.includes('status')) {
        await db.run("UPDATE newsletter_campaigns SET status='paused' WHERE id=?", [c.req.param('id')]);
      }
      return http.ok(c, { ok: true });
    });
  
}
