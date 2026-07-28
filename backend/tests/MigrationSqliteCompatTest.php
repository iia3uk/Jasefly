<?php
declare(strict_types=1);

/**
 * Behavioral regression: SQLite migration compat (rowid triggers, MODIFY no-op, duplicate ADD).
 */

use App\Core\Db\SqlTranspiler;
use App\Core\Modules\ModulePackagePaths;
use App\Core\ModuleRegistry;
use App\Services\Modules\InstalledModuleLoader;
use App\Services\Modules\ModulePluginMirror;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\Modules\ModuleSafeMode;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP MigrationSqliteCompat (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';

// —— Group A: tables without id + updated_at trigger must accept UPDATE ——
$ctx = jasefly_test_sqlite_boot();
$pdo = $ctx['pdo'];
$t = new SqlTranspiler('sqlite');
$create = "CREATE TABLE settings_kv (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB";
foreach ($t->transpile($create) as $sql) {
    $pdo->exec($sql);
}
foreach ($t->drainTriggers() as $tr) {
    $pdo->exec($tr);
}
$pdo->exec("INSERT INTO settings_kv (setting_key, setting_value) VALUES ('k','1')");
try {
    $pdo->exec("UPDATE settings_kv SET setting_value='2' WHERE setting_key='k'");
    assert_true(true, 'UPDATE settings_kv succeeds with rowid-based trigger');
} catch (Throwable $e) {
    assert_true(false, 'UPDATE settings_kv must not fail OLD.id: ' . $e->getMessage());
}
$row = $pdo->query("SELECT setting_value FROM settings_kv WHERE setting_key='k'")->fetch(PDO::FETCH_ASSOC);
assert_true(($row['setting_value'] ?? '') === '2', 'settings_kv value updated');
($ctx['cleanup'])();

// —— Full MigrationService path after 001 completes (was masked by OLD.id) ——
$ctx2 = jasefly_test_sqlite_boot();
try {
    jasefly_test_apply_core_schema($ctx2);
    $im = $ctx2['pdo']->query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='installed_modules'"
    )->fetch();
    assert_true((bool) $im, 'full migrate creates installed_modules');
    $plugins = $ctx2['pdo']->query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='modules'"
    )->fetch();
    assert_true((bool) $plugins, 'full migrate creates modules (plugins) table');
} catch (Throwable $e) {
    assert_true(false, 'full sqlite migrate: ' . $e->getMessage());
}
($ctx2['cleanup'])();

// —— Group B: duplicate custom_html ADD is ignorable via MigrationService ——
$ctx3 = jasefly_test_sqlite_boot();
($ctx3['applyFile'])($ctx3['backendRoot'] . '/migrations/001_schema.sql');
($ctx3['applyFile'])($ctx3['backendRoot'] . '/migrations/003_site_templates.sql');
$cols = $ctx3['pdo']->query('PRAGMA table_info(theme_settings)')->fetchAll(PDO::FETCH_ASSOC);
$names = array_map(static fn($c) => (string) ($c['name'] ?? ''), $cols);
assert_true(in_array('custom_html', $names, true), 'theme_settings keeps custom_html after redundant 003');
assert_true(in_array('custom_js', $names, true), 'theme_settings keeps custom_js after redundant 003');
($ctx3['cleanup'])();

// —— Bootstrap mirror: missing modules table must not abort loader; diagnostics recorded ——
$ctx4 = jasefly_test_sqlite_boot();
$pdo4 = $ctx4['pdo'];
$pdo4->exec(
    "CREATE TABLE installed_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        installed_version TEXT NOT NULL DEFAULT '0.0.0',
        status TEXT NOT NULL DEFAULT 'enabled',
        source TEXT NOT NULL DEFAULT 'package',
        manifest_json TEXT NULL,
        health_status TEXT NULL,
        last_error TEXT NULL
    )"
);
$slug = 'boot-mirror';
$manifest = json_encode([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Boot Mirror',
    'slug' => $slug,
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/Missing.php'],
], JSON_UNESCAPED_UNICODE);
$pdo4->prepare(
    "INSERT INTO installed_modules (slug, name, installed_version, status, source, health_status, manifest_json)
     VALUES (?, 'Boot Mirror', '1.0.0', 'enabled', 'package', 'ok', ?)"
)->execute([$slug, $manifest]);

$app = [
    'version' => '1.0.0',
    'paths' => [
        'api_root' => $ctx4['tmpDir'] . '/api',
        'web_root' => $ctx4['tmpDir'] . '/web',
    ],
];
@mkdir($app['paths']['api_root'] . '/modules/' . $slug, 0775, true);
@mkdir($app['paths']['api_root'] . '/storage/modules/' . $slug, 0775, true);
@mkdir($app['paths']['web_root'] . '/modules/' . $slug, 0775, true);

// Isolate from monorepo storage (fromApp() ignores app paths and shares safe-mode file).
$paths = new ModulePackagePaths($app['paths']['api_root'], $app['paths']['web_root']);
$repo = new ModuleRegistryRepository($ctx4['db']);
$safe = new ModuleSafeMode($paths);
$safe->clear($slug);
$registry = new ModuleRegistry($ctx4['db'], $app, $ctx4['tmpDir'] . '/empty-modules');
@mkdir($ctx4['tmpDir'] . '/empty-modules', 0775, true);
// Intentionally no `modules` table — mirror must throw and be recorded, not crash bootstrap.
$loader = new InstalledModuleLoader($repo, $paths, $safe, $ctx4['db'], $app);
$threw = false;
try {
    $loader->loadEnabled($registry);
} catch (Throwable $e) {
    $threw = true;
    assert_true(false, 'loadEnabled must not throw on mirror failure: ' . $e->getMessage());
}
assert_true($threw === false, 'bootstrap loadEnabled completes when mirror DB unavailable');
$stages = [];
foreach ($registry->loadFailures() as $f) {
    if (($f['module'] ?? '') === $slug) {
        $stages[] = (string) ($f['stage'] ?? '');
    }
}
assert_true(in_array('package_load', $stages, true), 'bootstrap records package_load');
assert_true(in_array('plugin_mirror', $stages, true), 'bootstrap records plugin_mirror (not swallowed)');
$a = $repo->getBySlug($slug);
assert_true(($a['status'] ?? '') === 'failed', 'package status remains failed (not overwritten by mirror)');

// Intentional lifecycle sync must still propagate (R4 for ops path)
$mirror = new ModulePluginMirror($ctx4['db']);
$propagated = false;
try {
    $mirror->mirror($slug, false);
} catch (Throwable $e) {
    $propagated = true;
    assert_true(str_contains($e->getMessage(), 'Failed to mirror') || str_contains($e->getMessage(), 'mirror'), 'ops mirror throws structured failure');
}
assert_true($propagated, 'ModulePackageService-style mirror() propagates failure');

($ctx4['cleanup'])();
