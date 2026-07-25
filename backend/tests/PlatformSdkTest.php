<?php
declare(strict_types=1);

/**
 * Platform SDK checks — included from run.php (uses global assert_true).
 */

use App\Platform\Analysis\CompatibilityChecker;
use App\Platform\Analysis\PackageStaticAnalyzer;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Compatibility\CompatibilityLayer;
use App\Platform\SdkVersion;

assert_true(SdkVersion::supports(1), 'sdk v1 supported');
assert_true(SdkVersion::supports(2), 'sdk v2 supported');
assert_true(!SdkVersion::supports(3), 'sdk v3 not supported');
$v3 = CompatibilityLayer::checkSdkVersion(3);
assert_true(!$v3['ok'], 'sdk v3 blocked');
$v1 = CompatibilityLayer::checkSdkVersion(1);
assert_true($v1['ok'], 'sdk v1 ok');
assert_true($v1['warnings'] !== [], 'sdk v1 deprecated warning');

$caps = new CapabilityRegistry(null);
assert_true($caps->has('mail.send'), 'mail.send present');
assert_true($caps->resolveProvider('mail.send') !== null, 'mail provider');
$caps->register('demo.cap', 'module.demo', 'demo', 200);
assert_true($caps->resolveProvider('demo.cap') === 'module.demo', 'provider resolve');

$tmp = sys_get_temp_dir() . '/jasefly-sdk-test-' . bin2hex(random_bytes(4));
mkdir($tmp . '/backend', 0777, true);
file_put_contents($tmp . '/module.json', json_encode([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Bad',
    'slug' => 'bad-mod',
    'version' => '1.0.0',
    'jasefly' => ['min_version' => '1.0.0', 'api_version' => 1, 'sdk_version' => 1],
    'entrypoints' => ['backend' => 'backend/Bad.php'],
], JSON_UNESCAPED_UNICODE));
file_put_contents($tmp . '/backend/Bad.php', "<?php\nuse App\\Core\\EventDispatcher;\n");
$scan = (new PackageStaticAnalyzer())->analyzeDirectory($tmp);
assert_true(!$scan['ok'], 'bad module fails static scan');

$demo = dirname(__DIR__, 2) . '/modules-src/demo-kit';
if (is_dir($demo)) {
    $report = (new CompatibilityChecker())->checkDirectory($demo);
    assert_true(isset($report['score']), 'demo has score');
    assert_true($report['sdk']['platform'] === SdkVersion::CURRENT, 'platform sdk current');
    assert_true($report['ok'] || $report['static']['files_scanned'] > 0, 'demo scanned');
}

@unlink($tmp . '/backend/Bad.php');
@unlink($tmp . '/module.json');
@rmdir($tmp . '/backend');
@rmdir($tmp);
