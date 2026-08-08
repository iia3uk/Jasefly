<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';
$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Support'), 'bundled Modules/Support removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Support'), 'legacy Support removed after live verify');
jasefly_test_assert_package_identity('support', $repoRoot);
$pkg = jasefly_test_package_dir('support');
assert_true(is_dir($pkg), 'support package directory exists');
$mf = json_decode((string) file_get_contents($pkg . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'support', 'support manifest slug');
assert_true(($mf['install']['preserve_data_on_uninstall'] ?? false) === true, 'support preserves data on uninstall');
assert_true(in_array('support.agent', $mf['permissions'] ?? [], true) && in_array('support.manage', $mf['permissions'] ?? [], true), 'support permissions retained');
$forbidden = false; foreach (glob($pkg . '/backend/*.php') ?: [] as $file) { $src=(string)file_get_contents($file); if(preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src)) $forbidden=true; }
assert_true(!$forbidden, 'support package has no Core/Services/Modules/Controllers imports');
$mod=(string)file_get_contents($pkg . '/backend/SupportModule.php'); $notifier=(string)file_get_contents($pkg . '/backend/SupportNotifier.php');
assert_true(str_contains($mod,'AbstractPackageModule') && str_contains($mod,'bootPlatform'), 'support is Platform package module');
assert_true(str_contains($mod,'softRateLimitMiddleware') && str_contains($mod,'rateLimitMiddleware'), 'support preserves soft poll and hard write limits');
assert_true(str_contains($notifier,'PlatformMailInterface') && str_contains($notifier,'PlatformHttpInterface'), 'notifier uses Platform Mail and HTTP');
assert_true(str_contains($notifier,'postJsonOutbound') && str_contains($notifier,'isSafeOutboundUrl'), 'notifier uses SSRF-safe outbound HTTP');
assert_true(!str_contains($notifier,'TelegramNotifier') && !str_contains($notifier,'MailAdapter'), 'notifier has no concrete transport dependency');
$http=(string)file_get_contents(dirname(__DIR__).'/src/Platform/Contracts/PlatformHttpInterface.php'); assert_true(str_contains($http,'softRateLimitMiddleware'), 'Platform HTTP exposes generic soft rate limit');
$fe=(string)file_get_contents($pkg.'/frontend-dist/index.js'); assert_true(str_contains($fe,'support.inbox') && str_contains($fe,'support.faq') && str_contains($fe,'site.runtime'), 'package FE registers host pages and runtime slot');
$main=(string)file_get_contents($repoRoot.'/frontend/src/main.tsx'); assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/support['\"]/",$main), 'host main has no static support import'); assert_true(str_contains($main,"provideHostAdminPage('support.inbox'") && str_contains($main,"provideHostAdminPage('support.site_widget'"), 'host provides Support pages and widget');
$layout=(string)file_get_contents($repoRoot.'/frontend/src/components/layout/SiteLayout.tsx'); assert_true(!str_contains($layout,"components/SupportWidget") && str_contains($layout,'<HostSlot id="site.runtime"'), 'SiteLayout mounts runtime slot without Support hardcode');
