<?php
declare(strict_types=1);

/**
 * Clean-install + update-from-previous smoke (SQLite).
 * 1) 001 + all migrations (clean install path)
 * 2) Fresh DB: stop after mid migration set, then apply remainder (upgrade path)
 */

use App\Services\MigrationService;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP CleanInstallSmoke (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';

// —— Clean install ——
$ctx = jasefly_test_sqlite_boot();
try {
    jasefly_test_apply_core_schema($ctx);
    $pdo = $ctx['pdo'];
    foreach (['users', 'permissions', 'roles', 'modules', 'installed_modules', 'pages'] as $table) {
        $ok = $pdo->query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table)
        )->fetch();
        assert_true((bool) $ok, "clean install has table {$table}");
    }

    // clean_base_seed if present (best-effort across drivers)
    $cleanPhp = $ctx['backendRoot'] . '/migrations/clean_base_seed.php';
    if (is_file($cleanPhp)) {
        require_once $cleanPhp;
        if (function_exists('seedCleanInstall')) {
            try {
                seedCleanInstall($pdo);
                $site = $pdo->query('SELECT id FROM site_settings WHERE id=1')->fetch();
                assert_true((bool) $site, 'clean_base_seed leaves site_settings row');
            } catch (Throwable $e) {
                // Seed may use MySQL-only SQL; record but don't fail the whole suite if tables exist.
                echo '  WARN clean_base_seed: ' . $e->getMessage() . "\n";
            }
        }
    }
} catch (Throwable $e) {
    assert_true(false, 'clean install: ' . $e->getMessage());
}
($ctx['cleanup'])();

// —— Update-from-previous: apply through 010, then remainder ——
$ctx2 = jasefly_test_sqlite_boot();
try {
    $backendRoot = $ctx2['backendRoot'];
    ($ctx2['applyFile'])($backendRoot . '/migrations/001_schema.sql');

    $early = [
        '002_enterprise.sql',
        '003_site_templates.sql',
        '004_project_media.sql',
        '005_page_layouts.sql',
        '006_page_revisions.sql',
        '007_plugins.sql',
        '008_security_2fa.sql',
        '009_commerce_catalog.sql',
        '010_maintenance_settings.sql',
    ];
    $svc = new MigrationService($ctx2['db'], $backendRoot . '/migrations', $ctx2['storageDir'], null);
    // Manually apply early files via MigrationService by temporarily limiting — use applyFile + mark applied
    foreach ($early as $file) {
        $path = $backendRoot . '/migrations/' . $file;
        if (!is_file($path)) {
            continue;
        }
        ($ctx2['applyFile'])($path);
        // Ensure meta tables then mark applied
        $svc->status(false);
        $ctx2['db']->run('INSERT OR IGNORE INTO `_migrations` (id) VALUES (?)', [$file]);
    }

    $pendingBefore = $svc->pendingFiles();
    assert_true(count($pendingBefore) > 0, 'upgrade-from-previous has later migrations pending');

    $upgrade = $svc->status(true);
    assert_true(empty($upgrade['error']), 'upgrade-from-previous applies without error');
    assert_true(empty($upgrade['pending']), 'upgrade-from-previous leaves no pending');

    $im = $ctx2['pdo']->query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='installed_modules'"
    )->fetch();
    assert_true((bool) $im, 'upgrade-from-previous created installed_modules');
} catch (Throwable $e) {
    assert_true(false, 'update-from-previous: ' . $e->getMessage());
}
($ctx2['cleanup'])();
