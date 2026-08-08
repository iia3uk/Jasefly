<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

use App\Database;

/**
 * Host-side hygiene when a ZIP package is disabled / uninstalled.
 * Cancels pending namespaced jobs, deactivates crons, drops in-process handlers.
 */
final class PackageJobLifecycle
{
    /**
     * @return array{handlers:int, cancelled:int, crons:int}
     */
    public static function release(Database $db, string $slug): array
    {
        $slug = trim($slug);
        if ($slug === '' || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return ['handlers' => 0, 'cancelled' => 0, 'crons' => 0];
        }

        $handlers = JobHandlerRegistry::unregisterByOwner($slug);
        $cancelled = 0;
        $crons = 0;

        try {
            $cancelled = $db->run(
                "UPDATE scheduled_jobs
                 SET status='cancelled', finished_at=NOW(),
                     last_error=CONCAT(COALESCE(last_error,''), ' [owner_disabled]')
                 WHERE status='pending' AND type LIKE ?",
                [$slug . '.%']
            )->rowCount();
        } catch (\Throwable) {
            $cancelled = 0;
        }

        try {
            $crons = $db->run(
                "UPDATE cron_schedules SET is_active=0
                 WHERE name LIKE ? OR job_type LIKE ?",
                [$slug . ':%', $slug . '.%']
            )->rowCount();
        } catch (\Throwable) {
            $crons = 0;
        }

        return ['handlers' => $handlers, 'cancelled' => $cancelled, 'crons' => $crons];
    }
}
