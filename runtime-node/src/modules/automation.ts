import type { Context } from 'hono';
import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody } from './_helpers.js';

export const name = 'automation';

function normalizeStatus(value: unknown): string {
  const s = String(value ?? 'draft');
  return ['draft', 'active', 'paused', 'archived'].includes(s) ? s : 'draft';
}

function normalizeDefinition(value: unknown): string {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      throw new Error('Invalid definition JSON');
    }
  }
  return JSON.stringify(value && typeof value === 'object' ? value : { conditions: [], steps: [] });
}

function adminUserId(c: Context<{ Variables: { user: unknown } }>): number | null {
  const user = c.get('user') as { id?: number } | 'mcp' | null;
  if (user === 'mcp' || !user) return null;
  return Number(user.id ?? 0) || null;
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/automations`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM automations ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/automations`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      let definition: string;
      try {
        definition = normalizeDefinition(body.definition);
      } catch {
        return fail(c, 'Invalid definition JSON', 422);
      }
      const createdBy = adminUserId(c as unknown as Context<{ Variables: { user: unknown } }>);
      await ctx.db.run(
        'INSERT INTO automations (name, description, status, trigger_type, definition, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          String(body.name ?? 'Automation'),
          body.description ?? null,
          normalizeStatus(body.status),
          String(body.trigger_type ?? 'form.submitted'),
          definition,
          createdBy,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      const row = await ctx.db.one('SELECT * FROM automations WHERE id=?', [id]);
      await ctx.events.publish('automation.created', { id, row });
      return ok(c, row, 201);
    });

    ctx.app.get(`${p}/admin/automations/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      const row = await ctx.db.one('SELECT * FROM automations WHERE id=?', [c.req.param('id')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.put(`${p}/admin/automations/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      let definition = String(row.definition ?? '{}');
      if (body.definition !== undefined) {
        try {
          definition = normalizeDefinition(body.definition);
        } catch {
          return fail(c, 'Invalid definition JSON', 422);
        }
      }
      await ctx.db.run(
        'UPDATE automations SET name=?, description=?, status=?, trigger_type=?, definition=?, version=version+1, updated_at=? WHERE id=?',
        [
          String(body.name ?? row.name),
          body.description ?? row.description,
          normalizeStatus(body.status ?? row.status),
          String(body.trigger_type ?? row.trigger_type),
          definition,
          nowSql(),
          id,
        ],
      );
      return ok(c, await ctx.db.one('SELECT * FROM automations WHERE id=?', [id]));
    });

    ctx.app.delete(`${p}/admin/automations/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM automations WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.get(`${p}/admin/automations/:id/runs`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automation_runs'))) return ok(c, []);
      return ok(
        c,
        await ctx.db.all(
          'SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT 100',
          [c.req.param('id')],
        ),
      );
    });

    ctx.app.post(`${p}/admin/automations/:id/run`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const context = body.context ?? body;
      const runKey = crypto.randomBytes(16).toString('hex');
      let runId = 0;
      if (await ctx.db.tableExists('automation_runs')) {
        await ctx.db.run(
          'INSERT INTO automation_runs (automation_id, status, trigger_key, context_json, started_at) VALUES (?, ?, ?, ?, ?)',
          [id, 'completed', runKey, JSON.stringify(context), nowSql()],
        );
        runId = await ctx.db.lastInsertId();
        await ctx.db.run('UPDATE automations SET run_count=COALESCE(run_count,0)+1, last_run_at=? WHERE id=?', [
          nowSql(),
          id,
        ]);
      }
      await ctx.events.publish('automation.run', { automation_id: id, run_id: runId, context });
      return ok(c, { run_id: runId });
    });

    ctx.app.post(`${p}/admin/automations/:id/test`, admin, async (c) => {
      if (!(await ctx.db.tableExists('automations'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const context = body.context ?? {};
      const runKey = `test-${crypto.randomBytes(12).toString('hex')}`;
      let runId = 0;
      if (await ctx.db.tableExists('automation_runs')) {
        await ctx.db.run(
          'INSERT INTO automation_runs (automation_id, status, trigger_key, context_json, started_at) VALUES (?, ?, ?, ?, ?)',
          [id, 'completed', runKey, JSON.stringify(context), nowSql()],
        );
        runId = await ctx.db.lastInsertId();
      }
      return ok(c, { run_id: runId, test: true });
    });
  }
}
