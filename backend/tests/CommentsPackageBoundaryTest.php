<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: comments is a ZIP package owning frozen builder widget IDs.
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Comments'), 'bundled Modules/Comments removed from discovery');

$pkgDir = jasefly_test_package_dir('comments');
assert_true($pkgDir !== null, 'comments package directory exists');
assert_true(is_dir($pkgDir), 'comments package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'comments module.json exists');
assert_true(is_file($pkgDir . '/backend/CommentsModule.php'), 'comments backend entry exists');
assert_true(is_file($pkgDir . '/backend/CommentsService.php'), 'comments service exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'comments', 'comments slug is comments');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'comments requires system');

$phpFiles = [$pkgDir . '/backend/CommentsModule.php', $pkgDir . '/backend/CommentsService.php'];
$forbidden = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
}
assert_true(!$forbidden, 'comments package has no Core/Services imports');

$modSrc = (string) file_get_contents($pkgDir . '/backend/CommentsModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'comments extends AbstractPackageModule');
assert_true(substr_count($modSrc, 'comments.view') + substr_count($modSrc, 'comments.moderate') + substr_count($modSrc, 'comments.manage') >= 3, 'comments permissions wired');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'stableType: true') || str_contains($fe, 'stableType:true'), 'FE uses stableType for frozen widgets');
foreach (['comments', 'reviews', 'rating-summary', 'review-form'] as $wid) {
    assert_true(str_contains($fe, "type: '{$wid}'") || str_contains($fe, "type:\"{$wid}\""), "FE registers widget {$wid}");
}

$freeze = dirname(__DIR__, 2) . '/frontend/src/builder/manifest/widget-types.v1.json';
$freezeJson = json_decode((string) file_get_contents($freeze), true);
$widgets = $freezeJson['widgets'] ?? [];
foreach (['comments', 'reviews', 'rating-summary', 'review-form'] as $wid) {
    assert_true(in_array($wid, $widgets, true), "frozen widget-types keeps {$wid}");
}

$mig = (string) file_get_contents($pkgDir . '/migrations/001_comments.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');

// вЂ”вЂ” Package wins over same-slug bundled вЂ”вЂ”
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP comments runtime boundary (pdo_sqlite missing)\n";
    return;
}

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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('comments', 1)");

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-comments-boundary',
]);

$registryPath = sys_get_temp_dir() . '/jasefly-comments-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);

$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'comments'; }
    public function label(): string { return 'Comments Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Comments',
    'slug' => 'comments',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/CommentsModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
]);

require_once $pkgDir . '/backend/CommentsService.php';
require_once $pkgDir . '/backend/CommentsModule.php';
$inner = new \App\PackageModules\Comments\CommentsModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'comments') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$has = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'comments') {
        $has = true;
    }
}
assert_true($has === false, 'clean discover without Modules/Comments has no comments');

($ctx['cleanup'])();
