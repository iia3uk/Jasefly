<?php
declare(strict_types=1);

/**
 * CLI scheduler runner for shared hosting cron.
 *
 *   php backend/bin/scheduler.php run --limit=20
 */

$root = dirname(__DIR__);
$configFile = "$root/config/config.local.php";
if (!is_file($configFile)) {
    fwrite(STDERR, "Missing config/config.local.php\n");
    exit(1);
}

require_once "$root/src/Bootstrap.php";

use App\Bootstrap;
use App\Modules\Scheduler\SchedulerTick;

[$app, $db] = Bootstrap::init();

$cmd = $argv[1] ?? 'run';
$limit = 20;
foreach ($argv as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) {
        $limit = max(1, min(100, (int) $m[1]));
    }
}

if ($cmd !== 'run') {
    fwrite(STDERR, "Usage: php scheduler.php run [--limit=20]\n");
    exit(1);
}

$stats = (new SchedulerTick($db))->tick($limit, 25);
echo json_encode(['ok' => true, 'stats' => $stats], JSON_UNESCAPED_UNICODE) . "\n";
