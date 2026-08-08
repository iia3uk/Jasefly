<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Payments'), 'bundled Modules/Payments removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Payments'), 'legacy Payments removed after live verify');
assert_true(!empty(glob($repoRoot . '/release/modules/jasefly-module-payments-*.zip')), 'payments ZIP present');

$pkg = jasefly_test_package_dir('payments');
assert_true(is_file($pkg . '/module.json'), 'payments package manifest exists');
assert_true(is_file($pkg . '/backend/PaymentsModule.php'), 'payments package entry exists');

$manifest = json_decode((string) file_get_contents($pkg . '/module.json'), true);
assert_true(is_array($manifest) && ($manifest['slug'] ?? '') === 'payments', 'payments manifest has stable slug');

$php = '';
foreach (glob($pkg . '/backend/*.php') ?: [] as $file) {
    $php .= (string) file_get_contents($file);
}
foreach (glob($pkg . '/backend/Providers/*.php') ?: [] as $file) {
    $php .= (string) file_get_contents($file);
}
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $php), 'payments package has no Core/Services/Modules/Controllers imports');
assert_true(str_contains($php, 'AbstractPackageModule') && str_contains($php, 'bootPlatform'), 'payments is a Platform package module');
assert_true(str_contains($php, '$ctx->orders()') && str_contains($php, '$ctx->catalog()'), 'payments uses Orders and Catalog platform facades');
assert_true(str_contains($php, 'requestOutbound'), 'providers use Platform outbound HTTP');
assert_true(str_contains($php, "'/payments/webhook'") && str_contains($php, "'/commerce/catalog'") && str_contains($php, "'/admin/payments'"), 'payments owns preserved API routes');

$frontend = (string) file_get_contents($pkg . '/frontend-dist/index.js');
assert_true(str_contains($frontend, 'hostPageKey') && str_contains($frontend, 'stableType:true'), 'payments frontend has host page and stable widgets');
$main = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/payments/", $main), 'main has no static payments module import');
assert_true(str_contains($main, "provideHostAdminPage('payments.admin'"), 'host provides payments admin page');
