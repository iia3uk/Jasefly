<?php
declare(strict_types=1);

/**
 * Priority 3 — operation integrity: behavioral contracts where possible.
 * Full install→update→rollback DB proof: JASEFLY_LIFECYCLE_DB=1 php backend/bin/certify-lifecycle.php
 */

use App\Services\Modules\ModulePackageService;
use App\Services\Modules\ModulePluginMirror;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\PageScheduleService;
use App\Support\SoftPluginGate;

// —— Behavioral: soft plugin gate + package mirror API surface ——
assert_true(
    SoftPluginGate::decide(false, 'POST', false) === 'plugin_disabled',
    'disabled mutations decide plugin_disabled (Design B)'
);
assert_true(
    method_exists(ModulePackageService::class, 'reconcilePluginMirror'),
    'ModulePackageService exposes reconcilePluginMirror'
);
assert_true(
    method_exists(ModulePluginMirror::class, 'reconcile'),
    'ModulePluginMirror::reconcile exists'
);
assert_true(
    method_exists(ModuleRegistryRepository::class, 'replaceModuleMigrations'),
    'replaceModuleMigrations exists for snapshot rollback'
);

// —— Documented contract: package success payload never claims DB rollback ——
$pkgSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/Modules/ModulePackageService.php');
assert_true(
    preg_match("/'db_rollback_available'\\s*=>\\s*false/", $pkgSrc) === 1,
    'runPipeline success sets db_rollback_available => false'
);
assert_true(
    str_contains($pkgSrc, 'DB migration revert is NOT implemented'),
    'explicit comment documents missing DB revert'
);
assert_true(
    str_contains($pkgSrc, 'Restored snapshot after post-copy failure (update)'),
    'update post-copy failure restores snapshot'
);

$snapSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/Modules/ModuleSnapshotService.php');
assert_true(str_contains($snapSrc, "'module_files'"), 'snapshot stores module_files inventory');
assert_true(str_contains($snapSrc, 'replaceModuleMigrations'), 'restore reapplies module_migrations');

$importerSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Support/ContentPackImporter.php');
assert_true(
    str_contains($importerSrc, 'Content wipe failed on table'),
    'content pack clearContent fails fast on DELETE errors'
);

$cliSrc = (string) file_get_contents(dirname(__DIR__) . '/import-content.php');
assert_true(
    str_contains($cliSrc, '--confirm'),
    'import-content CLI requires --confirm'
);

// —— Optional MySQL lifecycle behavioral gate (CI lifecycle job) ——
// When JASEFLY_LIFECYCLE_DB is unset: explicit SKIP (not a pass).
// When set to 1: execute certify-lifecycle.php and fail on non-zero exit.
if (getenv('JASEFLY_LIFECYCLE_DB') === '1') {
    $certify = dirname(__DIR__) . '/bin/certify-lifecycle.php';
    assert_true(is_file($certify), 'certify-lifecycle.php present for DB lifecycle proof');
    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    $cmd = escapeshellarg($php) . ' ' . escapeshellarg($certify);
    $output = [];
    $exitCode = 1;
    exec($cmd . ' 2>&1', $output, $exitCode);
    $joined = implode("\n", $output);
    if ($exitCode !== 0) {
        fwrite(STDERR, "certify-lifecycle output:\n" . $joined . "\n");
    }
    assert_true($exitCode === 0, 'certify-lifecycle.php exits 0 when JASEFLY_LIFECYCLE_DB=1 (got ' . $exitCode . ')');
} else {
    echo "  SKIP MySQL lifecycle behavioral certify (set JASEFLY_LIFECYCLE_DB=1)\n";
}

// —— PageScheduleService with SQLite ——
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP PageScheduleService DB checks (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$pdo = $ctx['pdo'];
$pdo->exec(
    "CREATE TABLE pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        status TEXT NOT NULL,
        published_at TEXT NULL,
        scheduled_at TEXT NULL,
        title TEXT NULL
    )"
);
$pdo->exec(
    "INSERT INTO pages (slug, status, scheduled_at, title) VALUES
     ('due-page', 'draft', datetime('now', '-1 hour'), 'Due'),
     ('future-page', 'draft', datetime('now', '+1 day'), 'Future'),
     ('live', 'published', NULL, 'Live')"
);

$svc = new PageScheduleService($ctx['db']);
$result = $svc->promoteDue();
assert_true(is_array($result) && array_key_exists('promoted', $result), 'promoteDue returns structured result');
assert_true(($result['error'] ?? null) === null, 'promoteDue has no error on happy path');
assert_true(($result['promoted'] ?? 0) >= 1, 'promoteDue promotes at least the due draft');

$due = $pdo->query("SELECT status, scheduled_at FROM pages WHERE slug='due-page'")->fetch(PDO::FETCH_ASSOC);
assert_true(($due['status'] ?? '') === 'published', 'due draft became published');
assert_true($due['scheduled_at'] === null || $due['scheduled_at'] === '', 'scheduled_at cleared');

$future = $pdo->query("SELECT status FROM pages WHERE slug='future-page'")->fetch(PDO::FETCH_ASSOC);
assert_true(($future['status'] ?? '') === 'draft', 'future draft stays draft');

($ctx['cleanup'])();
