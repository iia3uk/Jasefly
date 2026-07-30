<?php
declare(strict_types=1);

/**
 * SiteUpdater prunes Vite assets not present in the update package.
 */
$root = dirname(__DIR__);
require_once "$root/src/Bootstrap.php";
\App\Bootstrap::registerAutoload();

use App\Services\SiteUpdater;

$tmp = sys_get_temp_dir() . '/jasefly-assets-prune-' . bin2hex(random_bytes(4));
$web = $tmp . '/public_html';
$api = $web . '/api';
$assets = $web . '/assets';
@mkdir($assets, 0775, true);
@mkdir($api . '/src', 0775, true);
file_put_contents($api . '/src/Bootstrap.php', "<?php\n");
file_put_contents($web . '/index.php', "<?php\n");

// Live hosting has old + new hashed chunks
file_put_contents($assets . '/index-NEW.js', str_repeat('a', 100));
file_put_contents($assets . '/PublicPages-OLD.js', str_repeat('b', 200));
file_put_contents($assets . '/PublicPages-OLDER.js', str_repeat('c', 300));
@mkdir($assets . '/nested', 0775, true);
file_put_contents($assets . '/nested/stale.css', 'body{}');

$updater = new SiteUpdater(['storage' => $api . '/storage', 'version' => 'test'], null);

// Force hosting layout paths via reflection (constructor detects via index.php + api/)
$ref = new ReflectionClass($updater);
$webProp = $ref->getProperty('webRoot');
$webProp->setAccessible(true);
$webProp->setValue($updater, $web);
$hostProp = $ref->getProperty('hostingLayout');
$hostProp->setAccessible(true);
$hostProp->setValue($updater, true);

$method = $ref->getMethod('pruneStaleFrontendAssets');
$method->setAccessible(true);

$result = $method->invoke($updater, [
    'assets/index-NEW.js',
    'api/src/Bootstrap.php',
    'index.php',
]);

assert_true(($result['removed'] ?? 0) === 3, 'pruned 3 stale asset files');
assert_true(($result['bytes'] ?? 0) >= 500, 'pruned bytes counted');
assert_true(is_file($assets . '/index-NEW.js'), 'kept package asset');
assert_true(!is_file($assets . '/PublicPages-OLD.js'), 'removed old PublicPages chunk');
assert_true(!is_file($assets . '/PublicPages-OLDER.js'), 'removed older PublicPages chunk');
assert_true(!is_file($assets . '/nested/stale.css'), 'removed nested stale asset');

$skip = $method->invoke($updater, ['api/src/Bootstrap.php']);
assert_true(($skip['skipped'] ?? false) === true, 'api-only package skips prune');

// cleanup
$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($it as $item) {
    $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
}
@rmdir($tmp);

echo "SiteUpdaterAssetsPruneTest done\n";
