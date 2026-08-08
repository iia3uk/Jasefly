<?php
declare(strict_types=1);

/**
 * Module boundary: registration is a ZIP package using Platform Auth and Mail.
 * Included from run.php (uses global assert_true).
 */

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Registration'), 'bundled Modules/Registration removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Registration'), 'legacy Registration removed after live verify');
assert_true(!empty(glob($repoRoot . '/release/modules/jasefly-module-registration-*.zip')), 'registration ZIP present');

$pkg = is_dir($repoRoot . '/modules-src/registration')
    ? $repoRoot . '/modules-src/registration'
    : dirname(__DIR__) . '/tests/fixtures/modules/registration';
assert_true(is_dir($pkg), 'registration package directory exists');
assert_true(is_file($pkg . '/module.json'), 'registration manifest exists');
assert_true(is_file($pkg . '/backend/RegistrationModule.php'), 'registration backend entry exists');
assert_true(is_file($pkg . '/backend/RegistrationService.php'), 'registration service exists');

$manifest = json_decode((string) file_get_contents($pkg . '/module.json'), true);
assert_true(is_array($manifest) && ($manifest['slug'] ?? '') === 'registration', 'registration manifest has stable slug');
assert_true(in_array('mail.send', $manifest['capabilities']['requires'] ?? [], true), 'registration requires mail.send capability');
assert_true(in_array('auth.registration', $manifest['capabilities']['provides'] ?? [], true), 'registration provides auth.registration');

$php = '';
foreach (glob($pkg . '/backend/*.php') ?: [] as $file) {
    $php .= (string) file_get_contents($file);
}
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $php), 'registration package has no Core/Services/Modules/Controllers imports');

$module = (string) file_get_contents($pkg . '/backend/RegistrationModule.php');
assert_true(str_contains($module, 'AbstractPackageModule') && str_contains($module, 'bootPlatform'), 'registration is a Platform package module');
assert_true(str_contains($module, '$ctx->auth()') && str_contains($module, 'registerLoginGate'), 'registration registers its login gate through Platform Auth');
assert_true(str_contains($module, 'completeLogin'), 'registration completes sessions through Platform Auth');
assert_true(str_contains($module, "'/auth/register'") && str_contains($module, "'/auth/verify-email'"), 'registration preserves auth routes');

$service = (string) file_get_contents($pkg . '/backend/RegistrationService.php');
assert_true(str_contains($service, 'PlatformMailInterface'), 'registration uses Platform Mail interface');
assert_true(str_contains($service, 'isAvailable'), 'registration checks mail availability before verification email');
assert_true(str_contains($service, 'sendHtml'), 'registration sends verification email through Platform Mail');

$authInterface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformAuthInterface.php');
assert_true(str_contains($authInterface, 'registerLoginGate'), 'Platform Auth exposes registerLoginGate');
assert_true(str_contains($authInterface, 'completeLogin'), 'Platform Auth exposes completeLogin');

$frontend = (string) file_get_contents($pkg . '/frontend-dist/index.js');
assert_true(str_contains($frontend, "type: 'auth-register'") && (str_contains($frontend, 'stableType: true') || str_contains($frontend, 'stableType:true')), 'registration frontend owns auth-register as a stable widget');
assert_true(!str_contains($frontend, 'hostPageKey'), 'registration package has no host admin pages');

$main = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/registration['\"]/", $main), 'main has no static registration module import');

$stable = json_decode((string) file_get_contents($repoRoot . '/frontend/src/builder/manifest/package-stable-widget-types.v1.json'), true);
assert_true(($stable['widgets']['auth-register'] ?? '') === 'registration', 'stable widget map owns auth-registerв†’registration');

$migration = (string) file_get_contents($pkg . '/migrations/001_registration.sql');
assert_true(str_contains($migration, 'ADD COLUMN IF NOT EXISTS'), 'registration migration is additive');
assert_true(str_contains($migration, 'registration_source'), 'registration migration owns registration source data');
