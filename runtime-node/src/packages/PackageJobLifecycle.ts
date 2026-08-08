/**
 * Host-side hygiene when a ZIP package is disabled / unloaded.
 * Parity with PHP App\Modules\Scheduler\PackageJobLifecycle.
 */
import type { Database } from '../db/Database.js';
import { clearOwnedJobHandlers } from '../scheduler/JobHandlerRegistry.js';

export type PackageJobReleaseResult = {
  handlers: number;
  cancelled: number;
  crons: number;
};

export async function releasePackageJobs(db: Database, slug: string): Promise<PackageJobReleaseResult> {
  const clean = slug.trim();
  if (!clean || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    return { handlers: 0, cancelled: 0, crons: 0 };
  }

  const handlers = clearOwnedJobHandlers(clean);
  let cancelled = 0;
  let crons = 0;

  try {
    if (await db.tableExists('scheduled_jobs')) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.run(
        `UPDATE scheduled_jobs
         SET status='cancelled', finished_at=?, last_error=?
         WHERE status='pending' AND type LIKE ?`,
        [now, 'owner_disabled', `${clean}.%`],
      );
      cancelled = 1;
    }
  } catch {
    cancelled = 0;
  }

  try {
    if (await db.tableExists('cron_schedules')) {
      await db.run(`UPDATE cron_schedules SET is_active=0 WHERE name LIKE ? OR job_type LIKE ?`, [
        `${clean}:%`,
        `${clean}.%`,
      ]);
      crons = 1;
    }
  } catch {
    crons = 0;
  }

  return { handlers, cancelled, crons };
}
