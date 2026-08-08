<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Orders'), 'bundled Modules/Orders removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Orders'), 'legacy Orders removed after live verify');
jasefly_test_assert_package_identity('orders', $repoRoot);

$pkg = jasefly_test_package_dir('orders');
assert_true(is_dir($pkg), 'orders package directory exists');

$manifest = json_decode((string) file_get_contents($pkg . '/module.json'), true);
assert_true(is_array($manifest) && ($manifest['slug'] ?? '') === 'orders', 'orders manifest has stable slug');
assert_true(($manifest['install']['preserve_data_on_uninstall'] ?? false) === true, 'orders preserves data on uninstall');
assert_true(in_array('orders.refund', $manifest['permissions'] ?? [], true), 'orders refund permission retained');

$php = '';
foreach (glob($pkg . '/backend/*.php') ?: [] as $file) {
    $php .= (string) file_get_contents($file);
}
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $php), 'orders package has no Core/Services/Modules/Controllers imports');

$module = (string) file_get_contents($pkg . '/backend/OrdersModule.php');
$service = (string) file_get_contents($pkg . '/backend/OrdersService.php');
assert_true(str_contains($module, 'AbstractPackageModule') && str_contains($module, 'bootPlatform'), 'orders is a Platform package module');
assert_true(str_contains($module, '$ctx->catalog()') && str_contains($module, 'registerBackend'), 'orders registers catalog-backed Orders adapter');
assert_true(str_contains($module, "'/orders/cart'") && str_contains($module, "'/admin/orders'"), 'orders owns public and admin Platform HTTP routes');
assert_true(str_contains($service, "'order.paid'"), 'orders dispatches order.paid on payment transition');

$frontend = (string) file_get_contents($pkg . '/frontend-dist/index.js');
assert_true(str_contains($frontend, 'hostPageKey') && str_contains($frontend, 'orders.admin'), 'orders frontend declares host admin page key');
$main = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/orders/", $main), 'main has no static orders module import');
assert_true(str_contains($main, "provideHostAdminPage('orders.admin'"), 'host provides orders admin page');

