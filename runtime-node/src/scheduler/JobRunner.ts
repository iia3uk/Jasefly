import type { Database, Row } from '../db/Database.js';
import type { EventBus } from '../platform/events.js';
import {
  getJobHandler,
  parsePayload,
  registerDefaultHandlers,
  resolveHandlerType,
} from './JobHandlerRegistry.js';

export type TickStats = {
  processed: number;
  completed: number;
  failed: number;
  recovered: number;
  cron_enqueued: number;
  last_tick_at?: string | null;
};

export class JobRunner {
  constructor(
    private db: Database,
    private events: EventBus,
  ) {
    registerDefaultHandlers(events);
  }

  async tick(limit = 20): Promise<TickStats> {
    if (!(await this.db.tableExists('scheduled_jobs'))) {
      return { processed: 0, completed: 0, failed: 0, recovered: 0, cron_enqueued: 0 };
    }
    const recovered = await this.recoverStale();
    let completed = 0;
    let failed = 0;
    let processed = 0;
    const cols = await this.db.columns('scheduled_jobs');
    const hasMaxAttempts = cols.includes('max_attempts');
    const jobs = await this.claimPending(limit);
    for (const job of jobs) {
      processed++;
      const ok = await this.execute(job, hasMaxAttempts);
      if (ok) completed++;
      else failed++;
    }
    const lastTick = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await this.setMeta('last_tick_at', lastTick);
    return { processed, completed, failed, recovered, cron_enqueued: 0, last_tick_at: lastTick };
  }

  async stats(): Promise<Record<string, unknown>> {
    if (!(await this.db.tableExists('scheduled_jobs'))) {
      return { by_status: [], by_queue: [], last_tick_at: null, cron_stale: true, handlers: [] };
    }
    const byStatus = await this.db.all('SELECT status, COUNT(*) AS c FROM scheduled_jobs GROUP BY status');
    const byQueue = await this.db.all(
      'SELECT queue, status, COUNT(*) AS c FROM scheduled_jobs GROUP BY queue, status',
    );
    const last = await this.getMeta('last_tick_at');
    const warnMins = 30;
    let stale = true;
    if (last) {
      const ts = Date.parse(last.replace(' ', 'T') + 'Z') || Date.parse(last);
      stale = !ts || Date.now() - ts > warnMins * 60_000;
    }
    const { jobHandlerTypes } = await import('./JobHandlerRegistry.js');
    return {
      by_status: byStatus,
      by_queue: byQueue,
      last_tick_at: last,
      cron_stale: stale,
      handlers: jobHandlerTypes(),
    };
  }

  private async claimPending(limit: number): Promise<Row[]> {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const rows = await this.db.all(
      `SELECT * FROM scheduled_jobs
       WHERE status='pending' AND (available_at IS NULL OR available_at <= ?)
       ORDER BY priority DESC, id ASC LIMIT ?`,
      [now, limit],
    );
    const claimed: Row[] = [];
    for (const job of rows) {
      await this.db.run(
        `UPDATE scheduled_jobs SET status='running', started_at=?, attempts=attempts+1 WHERE id=? AND status='pending'`,
        [now, job.id],
      );
      const row = await this.db.one('SELECT status, attempts FROM scheduled_jobs WHERE id=?', [job.id]);
      if (row && String(row.status) === 'running') {
        claimed.push({ ...job, attempts: Number(row.attempts ?? 0), status: 'running' });
      }
    }
    return claimed;
  }

  private async execute(job: Row, hasMaxAttempts: boolean): Promise<boolean> {
    const id = Number(job.id);
    const attempt = Number(job.attempts ?? 1);
    const payload = parsePayload(job.payload);
    const handlerType = resolveHandlerType(job);
    const handler = getJobHandler(handlerType);
    const t0 = Date.now();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    try {
      if (!handler) throw new Error(`No handler registered for job type: ${handlerType}`);
      await handler(payload, { events: this.events, signal: AbortSignal.timeout(25000) });
      await this.db.run(
        `UPDATE scheduled_jobs SET status='completed', finished_at=?, last_error=NULL WHERE id=?`,
        [now, id],
      );
      await this.logAttempt(id, attempt, 'completed', null, Date.now() - t0);
      return true;
    } catch (e) {
      const err = String(e instanceof Error ? e.message : e).slice(0, 2000);
      const maxAttempts = hasMaxAttempts ? Number(job.max_attempts ?? 5) : 5;
      if (attempt >= maxAttempts) {
        await this.db.run(
          `UPDATE scheduled_jobs SET status='failed', finished_at=?, last_error=? WHERE id=?`,
          [now, err, id],
        );
        await this.logAttempt(id, attempt, 'failed', err, Date.now() - t0);
      } else {
        const delaySec = Math.min(3600, 2 ** Math.max(0, attempt - 1) * 5);
        const retryAt = new Date(Date.now() + delaySec * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await this.db.run(
          `UPDATE scheduled_jobs SET status='pending', available_at=?, last_error=?, started_at=NULL WHERE id=?`,
          [retryAt, err, id],
        );
        await this.logAttempt(id, attempt, 'retry', err, Date.now() - t0);
      }
      return false;
    }
  }

  private async recoverStale(): Promise<number> {
    try {
      const cols = await this.db.columns('scheduled_jobs');
      if (!cols.includes('started_at')) return 0;
      const cutoff = new Date(Date.now() - 900_000).toISOString().slice(0, 19).replace('T', ' ');
      await this.db.run(
        `UPDATE scheduled_jobs SET status='pending', available_at=?, last_error=COALESCE(last_error,'') || ' [stale recovery]'
         WHERE status='running' AND started_at < ?`,
        [new Date().toISOString().slice(0, 19).replace('T', ' '), cutoff],
      );
      return 0;
    } catch {
      return 0;
    }
  }

  private async logAttempt(jobId: number, attempt: number, status: string, error: string | null, ms: number): Promise<void> {
    if (!(await this.db.tableExists('job_attempts'))) return;
    try {
      await this.db.run(
        'INSERT INTO job_attempts (job_id, attempt, status, error, duration_ms) VALUES (?, ?, ?, ?, ?)',
        [jobId, attempt, status, error, ms],
      );
    } catch {
      // optional table
    }
  }

  private async setMeta(key: string, value: string): Promise<void> {
    if (!(await this.db.tableExists('scheduler_meta'))) return;
    try {
      if (this.db.driver() === 'sqlite') {
        await this.db.run(
          `INSERT INTO scheduler_meta (meta_key, meta_value) VALUES (?, ?)
           ON CONFLICT(meta_key) DO UPDATE SET meta_value=excluded.meta_value`,
          [key, value],
        );
      } else {
        await this.db.run(
          `INSERT INTO scheduler_meta (meta_key, meta_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value)`,
          [key, value],
        );
      }
    } catch {
      // optional
    }
  }

  async getMeta(key: string): Promise<string | null> {
    if (!(await this.db.tableExists('scheduler_meta'))) return null;
    try {
      const row = await this.db.one('SELECT meta_value FROM scheduler_meta WHERE meta_key=?', [key]);
      return row?.meta_value != null ? String(row.meta_value) : null;
    } catch {
      return null;
    }
  }
}
