<?php
declare(strict_types=1);

/**
 * Synthetic unknown-slug package boundary.
 * Proves ZIP modules work without core slug allowlists.
 * Included from run.php (uses global assert_true).
 */

use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;

$repoRoot = dirname(__DIR__, 2);
$fixture = dirname(__DIR__) . '/tests/fixtures/modules/sdk-boundary-probe';
assert_true(is_dir($fixture), 'sdk-boundary-probe fixture exists');

$probeSlug = 'sdk-boundary-probe';

// —— Core must not know this slug ——
$coreRoots = [
    $repoRoot . '/backend/src',
    $repoRoot . '/frontend/src',
];
$coreHits = [];
foreach ($coreRoots as $coreRoot) {
    if (!is_dir($coreRoot)) {
        continue;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($coreRoot, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile()) {
            continue;
        }
        $name = $file->getFilename();
        if (!preg_match('/\.(php|ts|tsx|js|json)$/', $name)) {
            continue;
        }
        $src = (string) file_get_contents($file->getPathname());
        if (str_contains($src, $probeSlug) || str_contains($src, 'SdkBoundaryProbe')) {
            $coreHits[] = str_replace($repoRoot . DIRECTORY_SEPARATOR, '', $file->getPathname());
        }
    }
}
assert_true($coreHits === [], 'core/host has zero references to sdk-boundary-probe');
if ($coreHits !== []) {
    echo '    leaked into: ' . implode(', ', array_slice($coreHits, 0, 8)) . "\n";
}

$mwSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Middleware/PermissionMiddleware.php');
assert_true(!str_contains($mwSrc, $probeSlug), 'PermissionMiddleware unaware of probe slug');
assert_true(!str_contains($mwSrc, '/admin/webhooks'), 'PermissionMiddleware has no pilot webhook path list');

$mf = json_decode((string) file_get_contents($fixture . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === $probeSlug, 'probe manifest slug');
assert_true(in_array('sdk-boundary-probe.view', $mf['permissions'] ?? [], true), 'probe declares permission');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'probe requires system');

$phpFiles = glob($fixture . '/backend/*.php') ?: [];
$forbidden = false;
foreach ($phpFiles as $file) {
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', (string) file_get_contents($file)) === 1) {
        $forbidden = true;
        break;
    }
}
assert_true(!$forbidden, 'probe PHP uses Platform SDK only');

$modSrc = (string) file_get_contents($fixture . '/backend/SdkBoundaryProbeModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'probe extends AbstractPackageModule');
assert_true(str_contains($modSrc, 'collectHumanReadableStrings') && str_contains($modSrc, 'isContentResource'), 'unknown package reaches generic content corpus APIs');
assert_true(str_contains($modSrc, '->subscribe('), 'probe subscribes to events');
assert_true(str_contains($modSrc, "publish('sdk-boundary-probe.ping'") || str_contains($modSrc, 'sdk-boundary-probe.ping'), 'probe publishes event');
assert_true(str_contains($modSrc, "delete('/admin/sdk-boundary-probe/hits'"), 'probe registers DELETE without content resource');

$fe = (string) file_get_contents($fixture . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'stableType: true') || str_contains($fe, 'stableType:true'), 'probe FE uses stableType');
assert_true(str_contains($fe, "type: 'sdk-probe'") || str_contains($fe, 'type:"sdk-probe"'), 'probe registers stable widget type');
assert_true(str_contains($fe, 'Component:'), 'probe ships own admin Component');
assert_true(!preg_match('/hostPageKey\s*:/', $fe), 'probe does not bind host-bound admin pages');

$mig = (string) file_get_contents($fixture . '/migrations/001_probe.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'probe migration non-destructive');

assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/SdkBoundaryProbe'), 'no bundled Modules/ mirror for probe');

// —— Runtime: package registers under ModuleRegistry without core discovery ——
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP sdk-boundary-probe runtime (pdo_sqlite missing)\n";
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
    $pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('{$probeSlug}', 1)");
    $app = array_merge($ctx['app'] ?? [], [
        'modules' => ['disabled' => []],
        'jwt_secret' => 'test-secret-sdk-probe',
    ]);
    $registryPath = sys_get_temp_dir() . '/jasefly-sdk-probe-' . getmypid();
    @mkdir($registryPath, 0775, true);
    $registry = new ModuleRegistry($db, $app, $registryPath);

    $manifest = ModuleManifest::fromArray([
        'schema_version' => 1,
        'type' => 'jasefly-module',
        'name' => 'SDK Boundary Probe',
        'slug' => $probeSlug,
        'version' => '1.0.0',
        'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
        'entrypoints' => ['backend' => 'backend/SdkBoundaryProbeModule.php'],
        'dependencies' => ['required' => ['system' => '>=1.0.0']],
        'permissions' => ['sdk-boundary-probe.view'],
    ]);
    require_once $fixture . '/backend/SdkBoundaryProbeModule.php';
    $inner = new \App\PackageModules\SdkBoundaryProbe\SdkBoundaryProbeModule();
    $inner->setPackageManifest($manifest);
    $registry->register(new PackageModuleAdapter($inner, $manifest));

    $found = null;
    foreach ($registry->all() as $mod) {
        if ($mod->name() === $probeSlug) {
            $found = $mod;
            break;
        }
    }
    assert_true($found instanceof PackageModuleAdapter, 'probe package registered by slug without core map');

    // Disable: remove from registry / mark disabled — discover without package dir must not invent probe
    $emptyReg = new ModuleRegistry($db, $app, $registryPath);
    $emptyReg->discover();
    $hasBundled = false;
    foreach ($emptyReg->all() as $mod) {
        if ($mod->name() === $probeSlug) {
            $hasBundled = true;
        }
    }
    assert_true($hasBundled === false, 'probe absent when not installed as package');

    ($ctx['cleanup'])();
}

// —— Second random slug: clone fixture, zero core edits ——
$randSlug = 'zed-' . bin2hex(random_bytes(3)) . '-probe';
$tmp = sys_get_temp_dir() . '/jasefly-' . $randSlug;
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
$copy($fixture, $tmp);

$pascal = 'Zed' . strtoupper(bin2hex(random_bytes(2))) . 'Probe';
$replaceInTree = static function (string $dir) use (&$replaceInTree, $probeSlug, $randSlug, $pascal): void {
    foreach (scandir($dir) ?: [] as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            $replaceInTree($path);
            continue;
        }
        $raw = (string) file_get_contents($path);
        $raw = str_replace('SdkBoundaryProbe', $pascal, $raw);
        $raw = str_replace($probeSlug, $randSlug, $raw);
        $raw = str_replace('sdk_boundary_probe', str_replace('-', '_', $randSlug), $raw);
        file_put_contents($path, $raw);
        if ($item === 'SdkBoundaryProbeModule.php') {
            rename($path, $dir . DIRECTORY_SEPARATOR . $pascal . 'Module.php');
        }
    }
};
$replaceInTree($tmp);

// Rewrite module.json entrypoint if rename happened
$mf2 = json_decode((string) file_get_contents($tmp . '/module.json'), true);
assert_true(($mf2['slug'] ?? '') === $randSlug, 'cloned random slug in manifest');
$mf2['entrypoints']['backend'] = 'backend/' . $pascal . 'Module.php';
$mf2['name'] = 'Random Probe';
file_put_contents($tmp . '/module.json', json_encode($mf2, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// Core still must not mention the random slug
$randHits = [];
foreach ($coreRoots as $coreRoot) {
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
assert_true($randHits === [], 'core/host has zero references to random probe slug');

$randPhp = (string) file_get_contents($tmp . '/backend/' . $pascal . 'Module.php');
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $randPhp), 'random probe Platform-only');
assert_true(str_contains($randPhp, 'AbstractPackageModule'), 'random probe extends AbstractPackageModule');

$randFe = (string) file_get_contents($tmp . '/frontend-dist/index.js');
assert_true(str_contains($randFe, 'stableType: true') || str_contains($randFe, 'stableType:true'), 'random FE stableType');
assert_true(str_contains($randFe, 'Component:'), 'random FE own Component');

if (extension_loaded('pdo_sqlite')) {
    require_once __DIR__ . '/helpers.php';
    $ctx2 = jasefly_test_sqlite_boot();
    $db2 = $ctx2['db'];
    $pdo2 = $ctx2['pdo'];
    $pdo2->exec(
        "CREATE TABLE IF NOT EXISTS modules (
            name TEXT PRIMARY KEY,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            settings TEXT NULL
        )"
    );
    $pdo2->exec("INSERT INTO modules (name, is_enabled) VALUES ('{$randSlug}', 1)");
    $app2 = array_merge($ctx2['app'] ?? [], [
        'modules' => ['disabled' => []],
        'jwt_secret' => 'test-secret-rand-probe',
    ]);
    $regPath2 = sys_get_temp_dir() . '/jasefly-rand-probe-' . getmypid();
    @mkdir($regPath2, 0775, true);
    $reg2 = new ModuleRegistry($db2, $app2, $regPath2);
    $manifest2 = ModuleManifest::fromArray([
        'schema_version' => 1,
        'type' => 'jasefly-module',
        'name' => 'Random Probe',
        'slug' => $randSlug,
        'version' => '1.0.0',
        'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
        'entrypoints' => ['backend' => 'backend/' . $pascal . 'Module.php'],
        'dependencies' => ['required' => ['system' => '>=1.0.0']],
    ]);
    require_once $tmp . '/backend/' . $pascal . 'Module.php';
    $class = 'App\\PackageModules\\' . $pascal . '\\' . $pascal . 'Module';
    assert_true(class_exists($class), 'random probe class loads');
    $inner2 = new $class();
    $inner2->setPackageManifest($manifest2);
    $reg2->register(new PackageModuleAdapter($inner2, $manifest2));
    $ok = false;
    foreach ($reg2->all() as $mod) {
        if ($mod->name() === $randSlug && $mod instanceof PackageModuleAdapter) {
            $ok = true;
        }
    }
    assert_true($ok, 'random slug package registers without core changes');
    ($ctx2['cleanup'])();
}

echo "  note: second probe slug was {$randSlug}\n";
