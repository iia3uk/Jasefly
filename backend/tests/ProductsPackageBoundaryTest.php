<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Products is package-owned; catalog routes and CRUD must not reintroduce
 * AdminController or host Services imports.
 */
$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Products'), 'bundled Modules/Products removed from discovery');

$pkgDir = jasefly_test_package_dir('products');
assert_true($pkgDir !== null, 'products package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'products module manifest exists');
assert_true(is_file($pkgDir . '/backend/ProductsModule.php'), 'products package backend entry exists');
assert_true(is_file($pkgDir . '/backend/ProductService.php'), 'products package CRUD service exists');
assert_true(is_file($pkgDir . '/backend/ProductCatalog.php'), 'products package catalog exists');

$manifest = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($manifest) && ($manifest['slug'] ?? '') === 'products', 'products package slug is stable');

$php = '';
foreach (['ProductsModule.php', 'ProductService.php', 'ProductCatalog.php', 'ProductTemplates.php'] as $file) {
    $php .= (string) file_get_contents($pkgDir . '/backend/' . $file);
}
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $php), 'products package has no Core/Services/Controllers imports');
assert_true(str_contains($php, 'registerBackend'), 'products registers catalog backend in bootPlatform');
assert_true(str_contains($php, "'/admin/products'") && str_contains($php, "'/products'"), 'products owns admin and public HTTP routes');
assert_true(str_contains($php, 'deleted_at=CURRENT_TIMESTAMP'), 'products delete is package-owned soft delete');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'hostPageKey') && str_contains($fe, 'products.admin'), 'products frontend uses host page keys');
assert_true(str_contains($fe, 'stableType:true') || str_contains($fe, 'stableType: true'), 'products-grid widget has stable type');
assert_true(!str_contains((string) file_get_contents($repoRoot . '/frontend/src/main.tsx'), "import '@/modules/products'"), 'main no longer statically imports products module');
