<?php
declare(strict_types=1);

/**
 * empty-all / emptyTrash must not 500 on TRASHABLE tables without deleted_at
 * (prod: pages, education).
 */

use App\Services\SoftDeleteService;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP SoftDeleteEmptyTrash (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$pdo = $ctx['pdo'];
$db = $ctx['db'];

$pdo->exec(
    "CREATE TABLE education (
        id INTEGER PRIMARY KEY,
        institution TEXT NOT NULL,
        degree TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )"
);
$pdo->exec(
    "CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        deleted_at TEXT NULL
    )"
);
$pdo->exec("INSERT INTO education (id, institution, degree) VALUES (1, 'U', 'BSc')");
$pdo->exec("INSERT INTO projects (id, title, deleted_at) VALUES (1, 'A', CURRENT_TIMESTAMP)");
$pdo->exec("INSERT INTO projects (id, title, deleted_at) VALUES (2, 'B', NULL)");

$soft = new SoftDeleteService($db);

assert_true($soft->emptyTrash('education') === 0, 'emptyTrash without deleted_at returns 0');
assert_true(
    (int) ($db->one('SELECT COUNT(*) c FROM education')['c'] ?? 0) === 1,
    'emptyTrash without deleted_at does not DELETE live rows'
);

$n = $soft->emptyTrash('projects');
assert_true($n === 1, 'emptyTrash with deleted_at purges soft-deleted rows');
assert_true(
    (int) ($db->one('SELECT COUNT(*) c FROM projects')['c'] ?? 0) === 1,
    'emptyTrash keeps non-deleted rows'
);

assert_true($soft->restore('education', 1) === false, 'restore without deleted_at returns false');
assert_true($soft->restore('projects', 2) === true, 'restore with deleted_at succeeds');

// Simulate empty-all walk over TRASHABLE including a no-column table
$total = 0;
foreach (SoftDeleteService::TRASHABLE as $table) {
    try {
        $total += $soft->emptyTrash($table);
    } catch (Throwable $e) {
        assert_true(false, 'emptyTrash must not throw on ' . $table . ': ' . $e->getMessage());
    }
}
assert_true($total >= 0, 'empty-all walk over TRASHABLE completes without exception');

$ctx['cleanup']();
