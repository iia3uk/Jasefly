import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { JobRunner } from '../scheduler/JobRunner.js';
import { parsePayload } from '../scheduler/JobHandlerRegistry.js';

export const name = 'scheduler';

function schedulerToken(ctx: ModuleContext): string {
  return process.env.SCHEDULER_TOKEN || ctx.cfg.mcpApiToken || '';
}

export async function register(ctx: ModuleContext) {
  const runner = new JobRunner(ctx.db, ctx.events);

  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/system/scheduler/tick`, async (c) => {
      const token = c.req.header('x-scheduler-token') || c.req.query('token') || '';
      const expected = schedulerToken(ctx);
      if (!expected || token !== expected) return fail(c, 'Forbidden', 403);
      const body = (await c.req.json().catch(() => ({}))) as { limit?: number };
      const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') || body.limit || 20)));
      return ok(c, await runner.tick(limit));
    });

    ctx.app.get(`${p}/admin/scheduler/jobs`, requireAdmin(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('scheduled_jobs'))) return ok(c, []);
      const status = c.req.query('status') || '';
      const queue = c.req.query('queue') || '';
      let sql = `SELECT id, type, queue, priority, status, available_at, started_at, finished_at, attempts, max_attempts, last_error, deduplication_key, created_at
                 FROM scheduled_jobs WHERE 1=1`;
      const params: unknown[] = [];
      if (status) {
        sql += ' AND status=?';
        params.push(status);
      }
      if (queue) {
        sql += ' AND queue=?';
        params.push(queue);
      }
      sql += ' ORDER BY id DESC LIMIT 200';
      const rows = await ctx.db.all(sql, params);
      for (const row of rows) {
        const full = await ctx.db.one('SELECT payload FROM scheduled_jobs WHERE id=?', [row.id]);
        row.payload_preview = redactPayload(parsePayload(full?.payload));
      }
      return ok(c, rows);
    });

    ctx.app.get(`${p}/admin/scheduler/stats`, requireAdmin(ctx.auth), async (c) => ok(c, await runner.stats()));

    ctx.app.post(`${p}/admin/scheduler/tick`, requireAdmin(ctx.auth), async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { limit?: number };
      const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || body.limit || 10)));
      return ok(c, await runner.tick(limit));
    });

    ctx.app.post(`${p}/admin/scheduler/jobs/:id/retry`, requireAdmin(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('scheduled_jobs'))) return fail(c, 'Cannot retry', 422);
      const id = c.req.param('id');
      const job = await ctx.db.one('SELECT * FROM scheduled_jobs WHERE id=?', [id]);
      if (!job || !['failed', 'cancelled'].includes(String(job.status))) return fail(c, 'Cannot retry', 422);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await ctx.db.run(
        "UPDATE scheduled_jobs SET status='pending', available_at=?, started_at=NULL, finished_at=NULL, last_error=NULL WHERE id=?",
        [now, id],
      );
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/scheduler/jobs/:id/cancel`, requireAdmin(ctx.auth), async (c) => {
      if (!(await ctx.db.tableExists('scheduled_jobs'))) return fail(c, 'Cannot cancel', 422);
      const id = c.req.param('id');
      const job = await ctx.db.one('SELECT * FROM scheduled_jobs WHERE id=?', [id]);
      if (!job || !['pending', 'running'].includes(String(job.status))) return fail(c, 'Cannot cancel', 422);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await ctx.db.run(
        "UPDATE scheduled_jobs SET status='cancelled', finished_at=?, last_error=COALESCE(last_error,'') || ' [cancelled]' WHERE id=?",
        [now, id],
      );
      await ctx.events.publish('scheduler.job.cancelled', { job_id: id });
      return ok(c, { ok: true });
    });
  }
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (/token|secret|password|key/i.test(k)) out[k] = '[redacted]';
    else out[k] = v;
  }
  return out;
}
