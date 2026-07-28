<?php
declare(strict_types=1);

/**
 * Priority 3 — operation / schedule / snapshot integrity contracts (lightweight).
 */

use App\Services\PageScheduleService;

// —— Source contracts (no DB) ——
$pkgSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/Modules/ModulePackageService.php');
assert_true(
    str_contains($pkgSrc, 'db_rollback_available') && str_contains($pkgSrc, 'db_rollback_available\' => false'),
    'update success does not advertise unimplemented db_rollback'
);
assert_true(
    str_contains($pkgSrc, 'Restored snapshot after post-copy failure (update)'),
    'update post-copy failure restores snapshot'
);
assert_true(
    method_exists(\App\Services\Modules\ModuleRegistryRepository::class, 'replaceModuleMigrations'),
    'replaceModuleMigrations exists for snapshot rollback'
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
