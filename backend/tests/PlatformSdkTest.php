<?php
declare(strict_types=1);

/**
 * Platform SDK checks — included from run.php (uses global assert_true).
 */

use App\Core\Modules\ModuleManifest;
use App\Platform\Analysis\CompatibilityChecker;
use App\Platform\Analysis\PackageStaticAnalyzer;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Capabilities\ServiceRegistry;
use App\Platform\Compatibility\CompatibilityLayer;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Manifest\PlatformModuleManifest;
use App\Platform\SdkVersion;

assert_true(SdkVersion::supports(1), 'sdk v1 supported');
assert_true(SdkVersion::supports(2), 'sdk v2 supported');
assert_true(!SdkVersion::supports(3), 'sdk v3 not supported');
assert_true(SdkVersion::isStable(1), 'sdk v1 stable');
assert_true(SdkVersion::stability(1) === 'stable', 'sdk v1 stability stable');
$v3 = CompatibilityLayer::checkSdkVersion(3);
assert_true(!$v3['ok'], 'sdk v3 blocked');
$v1 = CompatibilityLayer::checkSdkVersion(1);
assert_true($v1['ok'], 'sdk v1 ok');
$v1Deprecated = false;
foreach ($v1['warnings'] as $w) {
    if (str_contains(strtolower($w), 'deprecated')) {
        $v1Deprecated = true;
    }
}
assert_true(!$v1Deprecated, 'sdk v1 stable no deprecated warning');

$caps = new CapabilityRegistry(null);
assert_true($caps->has('mail.send'), 'mail.send present');
assert_true($caps->has('admin.pages'), 'admin.pages present');
assert_true($caps->has('settings.module'), 'settings.module present');
assert_true($caps->resolveProvider('mail.send') !== null, 'mail provider');
$caps->register('demo.cap', 'module.demo', 'demo', 200);
assert_true($caps->resolveProvider('demo.cap') === 'module.demo', 'provider resolve');

$reg = new ServiceRegistry();
$dbStub = new class implements PlatformDatabaseInterface {
    public function all(string $sql, array $params = []): array { return []; }
    public function one(string $sql, array $params = []): ?array { return null; }
    public function run(string $sql, array $params = []): void {}
    public function lastInsertId(): int { return 0; }
    public function transaction(callable $callback): mixed { return $callback(); }
};
$reg->set('db', $dbStub);
assert_true($reg->require('db') instanceof PlatformDatabaseInterface, 'typed service ok');
$threw = false;
try {
    $reg->require('App\\Mailer');
} catch (Throwable) {
    $threw = true;
}
assert_true($threw, 'unknown service id rejected');
$threw2 = false;
try {
    $reg->set('evil', new stdClass());
} catch (Throwable) {
    $threw2 = true;
}
assert_true($threw2, 'non-catalog service registration rejected');

$coreMf = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'T',
    'slug' => 't-mod',
    'version' => '1.0.0',
    'jasefly' => ['min_version' => '1.0.0', 'api_version' => 1, 'sdk_version' => 1],
    'capabilities' => ['requires' => ['mail.send'], 'provides' => []],
    'permissions' => ['t.view'],
    'entrypoints' => ['backend' => 'backend/T.php'],
]);
$pub = PlatformModuleManifest::fromCore($coreMf);
assert_true($pub->slug() === 't-mod', 'public manifest slug');
assert_true($pub->sdkVersion() === 1, 'public manifest sdk');
assert_true($pub->requiredCapabilities() === ['mail.send'], 'public caps');

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
assert_true(count($scan['findings']) > 0, 'bad module has findings');

$evilTmp = sys_get_temp_dir() . '/jasefly-sdk-evil-' . bin2hex(random_bytes(4));
mkdir($evilTmp . '/backend', 0777, true);
file_put_contents($evilTmp . '/module.json', json_encode([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Evil',
    'slug' => 'evil-mod',
    'version' => '1.0.0',
    'jasefly' => ['min_version' => '1.0.0', 'api_version' => 1, 'sdk_version' => 1],
    'entrypoints' => ['backend' => 'backend/Evil.php'],
], JSON_UNESCAPED_UNICODE));
file_put_contents($evilTmp . '/backend/Evil.php', "<?php\n\$ctx->service('evil');\n");
$evilScan = (new PackageStaticAnalyzer())->analyzeDirectory($evilTmp);
assert_true(!$evilScan['ok'], 'evil service id fails static scan');
$hasServiceFinding = false;
foreach ($evilScan['findings'] as $f) {
    if (($f['rule'] ?? '') === 'forbidden_service_id') {
        $hasServiceFinding = true;
    }
}
assert_true($hasServiceFinding, 'service(evil) caught by analyzer');
@unlink($evilTmp . '/backend/Evil.php');
@unlink($evilTmp . '/module.json');
@rmdir($evilTmp . '/backend');
@rmdir($evilTmp);

$demo = dirname(__DIR__, 2) . '/modules-src/demo-kit';
if (!is_dir($demo)) {
    $demo = dirname(__DIR__) . '/tests/fixtures/modules/demo-kit';
}
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
