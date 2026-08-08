<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Translate'), 'bundled Modules/Translate removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Translate'), 'legacy Translate removed after live verify');
jasefly_test_assert_package_identity('translate', $repoRoot);
$pkg = jasefly_test_package_dir('translate');
assert_true(is_dir($pkg), 'translate package directory exists');
$manifest = json_decode((string) file_get_contents($pkg . '/module.json'), true);
assert_true(is_array($manifest) && ($manifest['slug'] ?? '') === 'translate', 'translate manifest slug');
$php = '';
foreach (glob($pkg . '/backend/*.php') ?: [] as $file) {
    $php .= (string) file_get_contents($file);
}
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $php), 'translate package avoids host internals');
assert_true(str_contains($php, 'AbstractPackageModule') && str_contains($php, 'bootPlatform'), 'translate is Platform package');
assert_true(str_contains($php, 'collectHumanReadableStrings') && str_contains($php, 'isContentResource'), 'translate uses generic content seam');
assert_true(str_contains($php, 'softRateLimitMiddleware'), 'translate public endpoints use Platform soft rate limit');
$content = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformContentInterface.php');
assert_true(str_contains($content, 'collectHumanReadableStrings') && str_contains($content, 'isContentResource'), 'SDK content exposes generic corpus methods');
$controller = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/PublicController.php');
assert_true(!str_contains($controller, 'TranslateModule'), 'PublicController has no concrete TranslateModule dependency');
$layout = (string) file_get_contents($repoRoot . '/frontend/src/components/layout/SiteLayout.tsx');
assert_true(!str_contains($layout, 'TranslateWidget') && str_contains($layout, '<HostSlot id="site.runtime"'), 'SiteLayout uses runtime HostSlot');
$main = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/translate['\"]/", $main) && str_contains($main, "provideHostAdminPage('translate.site_widget'"), 'host binds Translate package UI');
