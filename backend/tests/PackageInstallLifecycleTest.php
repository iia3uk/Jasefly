<?php
declare(strict_types=1);

/**
 * Install lifecycle parity: install records installed, then explicit installed→enabled.
 * States are not mixed; BC keeps post-install observable status enabled.
 * Included from run.php (uses global assert_true).
 */

$repoRoot = dirname(__DIR__, 2);
$svcSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/Modules/ModulePackageService.php');
assert_true(
    str_contains($svcSrc, "? 'installed'") || preg_match("/install'\s*\n\s*\?\s*'installed'/s", $svcSrc) === 1,
    'ModulePackageService install sets status=installed first',
);
assert_true(
    !preg_match("/install'\s*\n\s*\?\s*'enabled'/s", $svcSrc),
    'ModulePackageService install must not jump directly to enabled',
);
assert_true(
    str_contains($svcSrc, 'installed → enabled') || str_contains($svcSrc, 'installed -> enabled'),
    'ModulePackageService has explicit installed→enabled transition (PHP BC)',
);

$loaderSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/Modules/InstalledModuleLoader.php');
assert_true(
    str_contains($loaderSrc, 'PackageSurfaceRegistry::register'),
    'InstalledModuleLoader registers manifest surfaces on boot',
);

$settingsSrc = (string) file_get_contents($repoRoot . '/backend/src/Platform/Adapters/SettingsAdapter.php');
assert_true(
    str_contains($settingsSrc, 'modules.settings') || str_contains($settingsSrc, 'SELECT settings FROM modules'),
    'SettingsAdapter reads modules.settings as canonical SoT',
);
