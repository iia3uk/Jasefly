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

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('automation.resume', async (payload) => {
    await events.publish('automation.resume', { ...payload });
  });
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/admin/automations', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM automations ORDER BY id DESC'));
    });

    http.post('/admin/automations', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      let definition: string;
      try {
        definition = normalizeDefinition(body.definition);
      } catch {
        return http.fail(c, 'Invalid definition JSON', 422);
      }
      const createdBy = adminUserId(c as unknown as Context<{ Variables: { user: unknown } }>);
      await db.run(
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
      const id = await db.lastInsertId();
      const row = await db.one('SELECT * FROM automations WHERE id=?', [id]);
      await events.publish('automation.created', { id, row });
      return http.ok(c, row, 201);
    });

    http.get('/admin/automations/:id', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      const row = await db.one('SELECT * FROM automations WHERE id=?', [c.req.param('id')]);
      if (!row) return http.fail(c, 'Not found', 404);
      return http.ok(c, row);
    });

    http.put('/admin/automations/:id', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      let definition = String(row.definition ?? '{}');
      if (body.definition !== undefined) {
        try {
          definition = normalizeDefinition(body.definition);
        } catch {
          return http.fail(c, 'Invalid definition JSON', 422);
        }
      }
      await db.run(
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
      return http.ok(c, await db.one('SELECT * FROM automations WHERE id=?', [id]));
    });

    http.delete('/admin/automations/:id', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      await db.run('DELETE FROM automations WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });

    http.get('/admin/automations/:id/runs', admin, async (c) => {
      if (!(await db.tableExists('automation_runs'))) return http.ok(c, []);
      return http.ok(
        c,
        await db.all(
          'SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT 100',
          [c.req.param('id')],
        ),
      );
    });

    http.post('/admin/automations/:id/run', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const context = body.context ?? body;
      const runKey = crypto.randomBytes(16).toString('hex');
      let runId = 0;
      if (await db.tableExists('automation_runs')) {
        await db.run(
          'INSERT INTO automation_runs (automation_id, status, trigger_key, context_json, started_at) VALUES (?, ?, ?, ?, ?)',
          [id, 'completed', runKey, JSON.stringify(context), nowSql()],
        );
        runId = await db.lastInsertId();
        await db.run('UPDATE automations SET run_count=COALESCE(run_count,0)+1, last_run_at=? WHERE id=?', [
          nowSql(),
          id,
        ]);
      }
      await events.publish('automation.run', { automation_id: id, run_id: runId, context });
      return http.ok(c, { run_id: runId });
    });

    http.post('/admin/automations/:id/test', admin, async (c) => {
      if (!(await db.tableExists('automations'))) return http.fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await db.one('SELECT * FROM automations WHERE id=?', [id]);
      if (!row) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const context = body.context ?? {};
      const runKey = `test-${crypto.randomBytes(12).toString('hex')}`;
      let runId = 0;
      if (await db.tableExists('automation_runs')) {
        await db.run(
          'INSERT INTO automation_runs (automation_id, status, trigger_key, context_json, started_at) VALUES (?, ?, ?, ?, ?)',
          [id, 'completed', runKey, JSON.stringify(context), nowSql()],
        );
        runId = await db.lastInsertId();
      }
      return http.ok(c, { run_id: runId, test: true });
    });

  // Wildcard bridge — parity with PHP AutomationModule (trigger_type match + dedupe key).
  events.subscribe('*', async (payload) => {
    const event = String(payload._event ?? '');
    if (!event || event === '*') return;
    if (!(await db.tableExists('automations'))) return;
    const context: Record<string, unknown> = { ...payload, _event: event };
    delete context._wildcard;
    const rows = await db.all(
      "SELECT * FROM automations WHERE status='active' AND trigger_type=?",
      [event],
    );
    for (const row of rows) {
      const sourceId =
        context.id ??
        context.submission_id ??
        context.submission_public_id ??
        context.public_id ??
        null;
      const runKey =
        sourceId === null || sourceId === undefined
          ? null
          : crypto.createHash('sha256').update(`${event}:${sourceId}:${row.id}`).digest('hex');
      if (runKey && (await db.tableExists('automation_runs'))) {
        const dup = await db.one('SELECT id FROM automation_runs WHERE trigger_key=? LIMIT 1', [runKey]);
        if (dup) continue;
      }
      let runId = 0;
      if (await db.tableExists('automation_runs')) {
        await db.run(
          'INSERT INTO automation_runs (automation_id, status, trigger_key, context_json, started_at) VALUES (?, ?, ?, ?, ?)',
          [row.id, 'completed', runKey, JSON.stringify(context), nowSql()],
        );
        runId = await db.lastInsertId();
        await db.run(
          'UPDATE automations SET run_count=COALESCE(run_count,0)+1, last_run_at=? WHERE id=?',
          [nowSql(), row.id],
        );
      }
      await events.publish('automation.run', {
        automation_id: row.id,
        run_id: runId,
        context,
        trigger: event,
      });
    }
  });
}
