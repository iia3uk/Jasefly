<?php
declare(strict_types=1);

/**
 * Offline lifecycle checks for Platform SDK certification reference.
 * Included from run.php (uses global assert_true).
 */

use App\Platform\Analysis\CompatibilityChecker;
use App\Platform\Analysis\SdkCliService;

$repoRoot = dirname(__DIR__, 2);
$fsr = $repoRoot . '/modules-src/forms-sdk-reference';
if (!is_dir($fsr)) {
    $fsr = $repoRoot . '/backend/tests/fixtures/modules/forms-sdk-reference';
}

assert_true(is_dir($fsr), 'forms-sdk-reference directory exists');

// module.json sdk_version === 1
$mfRaw = (string) file_get_contents($fsr . '/module.json');
$mf = json_decode($mfRaw, true);
assert_true(is_array($mf), 'forms-sdk-reference module.json parses');
$sdkVer = (int) ($mf['jasefly']['sdk_version'] ?? 0);
assert_true($sdkVer === 1, 'forms-sdk-reference sdk_version is 1');

// No App\Core|Services|Modules|Controllers in PHP sources
$forbidden = false;
$phpFiles = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($fsr, FilesystemIterator::SKIP_DOTS)
);
foreach ($phpFiles as $file) {
    if (!$file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }
    $src = (string) file_get_contents($file->getPathname());
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
}
assert_true(!$forbidden, 'forms-sdk-reference PHP has no App\\Core|Services|Modules|Controllers');

// Uninstall SQL exists
$uninstallSql = $fsr . '/migrations/uninstall/001_drop.sql';
assert_true(is_file($uninstallSql), 'forms-sdk-reference uninstall SQL exists');
$uninstallBody = (string) file_get_contents($uninstallSql);
assert_true(str_contains($uninstallBody, 'DROP TABLE'), 'uninstall SQL drops tables');

// frontend-dist register + sdkVersion
$feIndex = $fsr . '/frontend-dist/index.js';
assert_true(is_file($feIndex), 'forms-sdk-reference frontend-dist/index.js exists');
$feSrc = (string) file_get_contents($feIndex);
assert_true(str_contains($feSrc, 'sdkVersion') && preg_match('/sdkVersion\s*:\s*1/', $feSrc) === 1, 'frontend sdkVersion 1');
assert_true(str_contains($feSrc, 'register') && str_contains($feSrc, 'unregister'), 'frontend register/unregister');

// CompatibilityChecker — no critical findings
$compat = (new CompatibilityChecker())->checkDirectory($fsr);
$critical = 0;
foreach ($compat['findings'] ?? [] as $f) {
    if (($f['severity'] ?? '') === 'critical') {
        $critical++;
    }
}
assert_true($critical === 0, 'forms-sdk-reference no critical compatibility findings');
assert_true(isset($compat['score']), 'forms-sdk-reference compatibility score present');

// Certify via SdkCliService (offline steps)
$cli = new SdkCliService(null, $repoRoot, dirname(__DIR__));
$cert = $cli->certify('forms-sdk-reference');
assert_true($cert['ok'] === true, 'forms-sdk-reference certify ok (score ' . ($cert['score'] ?? '?') . ')');
