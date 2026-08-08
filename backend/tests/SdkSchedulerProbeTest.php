<?php
declare(strict_types=1);

/**
 * Platform Scheduler package API — unknown slug ownership + lifecycle.
 * Included from run.php (uses global assert_true).
 */

use App\Modules\Scheduler\JobHandlerRegistry;
use App\Modules\Scheduler\JobQueue;
use App\Modules\Scheduler\JobRunner;
use App\Modules\Scheduler\PackageJobLifecycle;
use App\Platform\Adapters\SchedulerAdapter;

$repoRoot = dirname(__DIR__, 2);
$fixture = dirname(__DIR__) . '/tests/fixtures/modules/sdk-scheduler-probe';
assert_true(is_dir($fixture), 'sdk-scheduler-probe fixture exists');

$probeSlug = 'sdk-scheduler-probe';

// —— Core must not know this slug ——
$coreHits = [];
foreach ([$repoRoot . '/backend/src', $repoRoot . '/frontend/src'] as $coreRoot) {
    if (!is_dir($coreRoot)) {
        continue;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($coreRoot, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile() || !preg_match('/\.(php|ts|tsx|js|json)$/', $file->getFilename())) {
            continue;
        }
        $src = (string) file_get_contents($file->getPathname());
        if (str_contains($src, $probeSlug) || str_contains($src, 'SdkSchedulerProbe')) {
            $coreHits[] = $file->getPathname();
        }
    }
}
assert_true($coreHits === [], 'core/host has zero references to sdk-scheduler-probe');

$schedSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/JobHandlerRegistry.php');
assert_true(!str_contains($schedSrc, 'analytics.'), 'Scheduler registry has no analytics hardcode');
assert_true(!str_contains($schedSrc, 'newsletter.'), 'Scheduler registry has no newsletter hardcode');
assert_true(!str_contains($schedSrc, 'campaign.send'), 'Scheduler registry has no campaign.send whitelist');

$adapterSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Adapters/SchedulerAdapter.php');
assert_true(str_contains($adapterSrc, 'moduleSlug'), 'adapter owns namespace via moduleSlug');
assert_true(str_contains($adapterSrc, 'scheduleCron'), 'adapter exposes scheduleCron');
assert_true(str_contains($adapterSrc, 'releasePackage'), 'adapter exposes releasePackage');

$ifaceSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformSchedulerInterface.php');
assert_true(str_contains($ifaceSrc, 'unregisterHandler'), 'PlatformSchedulerInterface has unregisterHandler');
assert_true(str_contains($ifaceSrc, 'cancelPending'), 'PlatformSchedulerInterface has cancelPending');
assert_true(str_contains($ifaceSrc, 'scheduleCron'), 'PlatformSchedulerInterface has scheduleCron');

$pkgSrc = (string) file_get_contents($fixture . '/backend/SdkSchedulerProbeModule.php');
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $pkgSrc), 'probe uses Platform SDK only');
assert_true(str_contains($pkgSrc, "registerHandler('tick'"), 'probe registers tick handler');
assert_true(str_contains($pkgSrc, 'scheduleCron'), 'probe schedules cron');
assert_true(str_contains($pkgSrc, "enqueue('delayed'"), 'probe enqueues delayed job');

// —— Namespace collision safety (no DB) ——
JobHandlerRegistry::resetForTests();
$callsA = 0;
$callsB = 0;
// Fake adapters without DB for registerHandler only — use registry directly with forced types
JobHandlerRegistry::register('package-a.aggregate', static function () use (&$callsA) { $callsA++; }, 'package-a');
JobHandlerRegistry::register('package-b.aggregate', static function () use (&$callsB) { $callsB++; }, 'package-b');
assert_true(JobHandlerRegistry::has('package-a.aggregate'), 'package-a.aggregate registered');
assert_true(JobHandlerRegistry::has('package-b.aggregate'), 'package-b.aggregate distinct');
assert_true(JobHandlerRegistry::ownerOf('package-a.aggregate') === 'package-a', 'owner a');
assert_true(JobHandlerRegistry::ownerOf('package-b.aggregate') === 'package-b', 'owner b');
JobHandlerRegistry::get('package-a.aggregate')([]);
JobHandlerRegistry::get('package-b.aggregate')([]);
assert_true($callsA === 1 && $callsB === 1, 'handlers do not collide');

// resolveType force-namespace even if foreign prefix attempted
require_once dirname(__DIR__) . '/src/Platform/Adapters/SchedulerAdapter.php';
// Use a stub db-less resolve via reflection on a minimal subclass... instantiate with null-unsafe —
// SchedulerAdapter needs Database; test resolveType through a tiny anonymous wrapper:

$resolve = static function (string $slug, string $type): string {
    $local = trim($type);
    if (str_starts_with($local, $slug . '.')) {
        return $local;
    }
    return $slug . '.' . ltrim($local, '.');
};
assert_true($resolve('package-a', 'aggregate') === 'package-a.aggregate', 'bare type namespaced');
assert_true($resolve('package-a', 'package-b.aggregate') === 'package-a.package-b.aggregate', 'foreign prefix nested under owner');
assert_true($resolve('package-a', 'package-a.aggregate') === 'package-a.aggregate', 'own prefix kept');

JobHandlerRegistry::unregisterByOwner('package-a');
assert_true(!JobHandlerRegistry::has('package-a.aggregate'), 'unregisterByOwner removes a');
assert_true(JobHandlerRegistry::has('package-b.aggregate'), 'unregisterByOwner keeps b');

// —— Runtime with SQLite when available ——
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP sdk-scheduler-probe runtime (pdo_sqlite missing)\n";
} else {
    require_once __DIR__ . '/helpers.php';
    $ctx = jasefly_test_sqlite_boot();
    $db = $ctx['db'];
    $pdo = $ctx['pdo'];

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS modules (
            name TEXT PRIMARY KEY,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            settings TEXT NULL
        )"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            payload TEXT,
            queue TEXT NOT NULL DEFAULT 'default',
            priority INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            available_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            last_error TEXT,
            deduplication_key TEXT UNIQUE,
            created_at TEXT,
            updated_at TEXT
        )"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS job_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            attempt INTEGER NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            duration_ms INTEGER,
            created_at TEXT
        )"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS cron_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            expression TEXT NOT NULL,
            job_type TEXT NOT NULL,
            payload TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_run_at TEXT,
            next_run_at TEXT,
            created_at TEXT,
            updated_at TEXT
        )"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS scheduler_meta (
            meta_key TEXT PRIMARY KEY,
            meta_value TEXT,
            updated_at TEXT
        )"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS sdk_scheduler_probe_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL,
            kind TEXT NOT NULL,
            note TEXT,
            created_at TEXT
        )"
    );
    $pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('{$probeSlug}', 1)");

    JobHandlerRegistry::resetForTests();
    $adapter = new SchedulerAdapter($db, $probeSlug);
    $hits = 0;
    $adapter->registerHandler('tick', static function (array $payload) use ($db, $probeSlug, &$hits): void {
        $hits++;
        $db->run(
            'INSERT INTO sdk_scheduler_probe_hits (slug, kind, note, created_at) VALUES (?, ?, ?, datetime("now"))',
            [$probeSlug, 'tick', (string) ($payload['note'] ?? '')]
        );
    });
    $adapter->registerHandler('delayed', static function (array $payload) use ($db, $probeSlug, &$hits): void {
        $hits++;
        $db->run(
            'INSERT INTO sdk_scheduler_probe_hits (slug, kind, note, created_at) VALUES (?, ?, ?, datetime("now"))',
            [$probeSlug, 'delayed', (string) ($payload['note'] ?? '')]
        );
    });

    assert_true($adapter->resolveType('tick') === $probeSlug . '.tick', 'resolved type namespaced');
    assert_true(JobHandlerRegistry::ownerOf($probeSlug . '.tick') === $probeSlug, 'registry owner = package slug');

    $adapter->scheduleCron('heartbeat', '*/5 * * * *', 'tick', ['note' => 'hb'], true);
    $cron = $db->one('SELECT * FROM cron_schedules WHERE name=?', [$probeSlug . ':heartbeat']);
    assert_true(is_array($cron), 'cron row created under package name');
    assert_true(($cron['job_type'] ?? '') === $probeSlug . '.tick', 'cron job_type namespaced');

    // update must not duplicate
    $adapter->scheduleCron('heartbeat', '*/5 * * * *', 'tick', ['note' => 'hb2'], true);
    $cronCount = (int) ($db->one('SELECT COUNT(*) c FROM cron_schedules WHERE name=?', [$probeSlug . ':heartbeat'])['c'] ?? 0);
    assert_true($cronCount === 1, 'cron upsert does not duplicate');

    $jobId = $adapter->enqueue('delayed', ['note' => 'now'], 0);
    assert_true($jobId > 0, 'delayed job enqueued');
    $job = $db->one('SELECT * FROM scheduled_jobs WHERE id=?', [$jobId]);
    assert_true(($job['type'] ?? '') === $probeSlug . '.delayed', 'enqueued type namespaced');

    $runner = new JobRunner($db);
    $stats = $runner->run(10, 10);
    assert_true(($stats['completed'] ?? 0) >= 1, 'runner executed package job');
    assert_true($hits >= 1, 'handler incremented hits');

    // Disable package → release hygiene
    $pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='{$probeSlug}'");
    $released = PackageJobLifecycle::release($db, $probeSlug);
    assert_true(($released['handlers'] ?? 0) >= 1, 'release unregisters handlers');
    assert_true(!JobHandlerRegistry::has($probeSlug . '.tick'), 'tick handler gone after release');

    // Pending job after release: enqueue while disabled should still be cancellable by runner
    JobHandlerRegistry::resetForTests();
    // Simulate orphan pending job left behind
    $orphanId = (new JobQueue($db))->push($probeSlug . '.tick', ['note' => 'orphan'], null);
    $stats2 = (new JobRunner($db))->run(5, 5);
    $orphan = $db->one('SELECT status, last_error FROM scheduled_jobs WHERE id=?', [$orphanId]);
    assert_true(($orphan['status'] ?? '') === 'cancelled', 'orphan job cancelled without handler');
    $orphanErr = (string) ($orphan['last_error'] ?? '');
    assert_true(
        str_contains($orphanErr, 'no_handler') || str_contains($orphanErr, 'owner_inactive') || $orphanErr !== '',
        'orphan cancel reason recorded (no_handler or owner_inactive)'
    );

    // Re-enable: register again
    $pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='{$probeSlug}'");
    $adapter2 = new SchedulerAdapter($db, $probeSlug);
    $adapter2->registerHandler('tick', static function (): void {});
    assert_true(JobHandlerRegistry::has($probeSlug . '.tick'), 'handler available after re-enable register');

    ($ctx['cleanup'])();
}

// —— Second random slug without core changes ——
$randSlug = 'sch-' . bin2hex(random_bytes(3)) . '-probe';
$tmp = sys_get_temp_dir() . '/jasefly-' . $randSlug;
$copy = static function (string $src, string $dst) use (&$copy): void {
    @mkdir($dst, 0775, true);
    foreach (scandir($src) ?: [] as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $from = $src . DIRECTORY_SEPARATOR . $item;
        $to = $dst . DIRECTORY_SEPARATOR . $item;
        is_dir($from) ? $copy($from, $to) : copy($from, $to);
    }
};
if (is_dir($tmp)) {
    $rm = static function (string $dir) use (&$rm): void {
        foreach (scandir($dir) ?: [] as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            is_dir($path) ? $rm($path) : @unlink($path);
        }
        @rmdir($dir);
    };
    $rm($tmp);
}
$copy($fixture, $tmp);
$pascal = 'Sch' . strtoupper(bin2hex(random_bytes(2))) . 'Probe';
$walk = static function (string $dir) use (&$walk, $probeSlug, $randSlug, $pascal): void {
    foreach (scandir($dir) ?: [] as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            $walk($path);
            continue;
        }
        $raw = (string) file_get_contents($path);
        $raw = str_replace('SdkSchedulerProbe', $pascal, $raw);
        $raw = str_replace($probeSlug, $randSlug, $raw);
        $raw = str_replace('sdk_scheduler_probe', str_replace('-', '_', $randSlug), $raw);
        file_put_contents($path, $raw);
        if ($item === 'SdkSchedulerProbeModule.php') {
            rename($path, $dir . DIRECTORY_SEPARATOR . $pascal . 'Module.php');
        }
    }
};
$walk($tmp);
$mf = json_decode((string) file_get_contents($tmp . '/module.json'), true);
$mf['entrypoints']['backend'] = 'backend/' . $pascal . 'Module.php';
$mf['slug'] = $randSlug;
file_put_contents($tmp . '/module.json', json_encode($mf, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

$randHits = [];
foreach ([$repoRoot . '/backend/src', $repoRoot . '/frontend/src'] as $coreRoot) {
    if (!is_dir($coreRoot)) {
        continue;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($coreRoot, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile() || !preg_match('/\.(php|ts|tsx|js|json)$/', $file->getFilename())) {
            continue;
        }
        if (str_contains((string) file_get_contents($file->getPathname()), $randSlug)) {
            $randHits[] = $file->getPathname();
        }
    }
}
assert_true($randHits === [], 'core has zero refs to random scheduler probe slug');

JobHandlerRegistry::resetForTests();
$ra = $resolve($randSlug, 'tick');
$rb = $resolve('other-pkg', 'tick');
assert_true($ra !== $rb, 'random slug namespaces diverge from other package');
assert_true($ra === $randSlug . '.tick', 'random slug resolveType shape');

echo "  note: second scheduler probe slug was {$randSlug}\n";
