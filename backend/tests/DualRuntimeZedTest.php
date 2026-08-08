<?php
declare(strict_types=1);

/**
 * Dual-runtime unknown package identity proof.
 * One fixture (runtime-node/tests/fixtures/modules/zed) declares PHP + Node entrypoints.
 * Included from run.php.
 */

use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;

$repoRoot = dirname(__DIR__, 2);
$fixture = $repoRoot . '/runtime-node/tests/fixtures/modules/zed';
assert_true(is_dir($fixture), 'dual-runtime zed fixture exists');

$slug = 'zed';
$mf = json_decode((string) file_get_contents($fixture . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === $slug, 'zed manifest slug');
assert_true(($mf['entrypoints']['backend'] ?? '') === 'backend/ZedProbeModule.php', 'zed declares PHP entrypoint');
assert_true(($mf['entrypoints']['node'] ?? '') !== '', 'zed declares Node entrypoint');
assert_true(is_file($fixture . '/' . $mf['entrypoints']['backend']), 'PHP entry file present');
assert_true(is_file($fixture . '/' . $mf['entrypoints']['node']), 'Node entry file present');
assert_true(is_file($fixture . '/migrations/001_zed.sql'), 'shared package migration present');
assert_true(is_array($mf['surfaces'] ?? null), 'zed v2 declares surfaces');
assert_true(!empty($mf['surfaces']['trash']), 'zed declares trash surface');
assert_true(!empty($mf['surfaces']['schema']), 'zed declares schema ownership');
assert_true(in_array('zed.view', $mf['permissions'] ?? [], true), 'zed declares permission for ACL seam');

// Host must not whitelist zed
$registerAll = (string) file_get_contents($repoRoot . '/runtime-node/src/modules/registerAll.ts');
assert_true(!preg_match("/from ['\"]\\.\\/zed(\\.js)?['\"]/", $registerAll), 'registerAll has no zed import');
assert_true(!is_file($repoRoot . '/runtime-node/src/modules/zed.ts'), 'no host Node zed module');
assert_true(!is_dir($repoRoot . '/backend/src/Modules/Zed'), 'no host PHP Modules/Zed');

$phpSrc = (string) file_get_contents($fixture . '/backend/ZedProbeModule.php');
assert_true(str_contains($phpSrc, 'AbstractPackageModule'), 'zed PHP extends AbstractPackageModule');
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $phpSrc), 'zed PHP uses Platform SDK only');

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP dual-runtime zed PHP boot (pdo_sqlite missing)\n";
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
    $pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('{$slug}', 1)");
    $app = array_merge($ctx['app'] ?? [], [
        'modules' => ['disabled' => []],
        'jwt_secret' => 'test-secret-zed-dual',
    ]);
    $registryPath = sys_get_temp_dir() . '/jasefly-zed-dual-' . getmypid();
    @mkdir($registryPath, 0775, true);
    $registry = new ModuleRegistry($db, $app, $registryPath);

    $manifest = ModuleManifest::fromArray($mf);
    require_once $fixture . '/backend/ZedProbeModule.php';
    $inner = new \App\PackageModules\Zed\ZedProbeModule();
    $inner->setPackageManifest($manifest);
    $registry->register(new PackageModuleAdapter($inner, $manifest));

    $found = null;
    foreach ($registry->all() as $mod) {
        if ($mod->name() === $slug) {
            $found = $mod;
            break;
        }
    }
    assert_true($found instanceof PackageModuleAdapter, 'zed PHP package registered without core map');

    // Boot surfaces via adapter (manifest + runtime register)
    \App\Platform\Surfaces\PackageSurfaceRegistry::resetForTests();
    $router = new \App\Router();
    try {
        $found->registerRoutes($router, $db, $app, '/api/v1');
    } catch (\Throwable $e) {
        // boot may require more schema; surface registration happens before handlers
    }
    $trash = \App\Platform\Surfaces\PackageSurfaceRegistry::trashable();
    assert_true(($trash['zed-items'] ?? null) === 'zed_items', 'zed surfaces registered into PackageSurfaceRegistry');
    $schema = \App\Platform\Surfaces\PackageSurfaceRegistry::schemaOwners();
    assert_true(($schema['zed_items'] ?? null) === 'zed', 'zed owns zed_items schema');

    $emptyReg = new ModuleRegistry($db, $app, $registryPath);
    $emptyReg->discover();
    $hasBundled = false;
    foreach ($emptyReg->all() as $mod) {
        if ($mod->name() === $slug) {
            $hasBundled = true;
        }
    }
    assert_true($hasBundled === false, 'zed absent from host discover without install');

    ($ctx['cleanup'])();
}

echo "  OK  Dual-runtime zed package identity (PHP+Node entrypoints)\n";
