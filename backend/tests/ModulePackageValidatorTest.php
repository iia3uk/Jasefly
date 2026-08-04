<?php
declare(strict_types=1);

/**
 * Unit tests for ModulePackageValidator (no DB).
 * Run via: php backend/tests/run.php
 */

use App\Core\Modules\ModuleManifest;
use App\Platform\Analysis\PackageStaticAnalyzer;
use App\Services\Modules\ModulePackageValidator;

require_once dirname(__DIR__) . '/src/Services/Modules/ModulePackageValidator.php';
require_once dirname(__DIR__) . '/src/Services/Modules/ModuleSignatureService.php';
require_once dirname(__DIR__) . '/src/Core/Modules/ModuleDependencyResolver.php';
require_once dirname(__DIR__) . '/src/Core/Modules/ModuleManifest.php';

$validator = new ModulePackageValidator();

// —— dangerous path ——
assert_true($validator->isDangerousPath('../etc/passwd') === true, 'dangerous path: parent segment');
assert_true($validator->isDangerousPath('/etc/passwd') === true, 'dangerous path: absolute unix');
assert_true($validator->isDangerousPath('C:/Windows/system.ini') === true, 'dangerous path: absolute windows');
assert_true($validator->isDangerousPath('backend/DemoKitModule.php') === false, 'safe relative path');

// —— valid manifest shape ——
$validManifest = [
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Demo Kit',
    'slug' => 'demo-kit',
    'version' => '1.0.0',
    'jasefly' => ['min_version' => '1.0.0', 'api_version' => 1],
    'entrypoints' => [
        'backend' => 'backend/DemoKitModule.php',
        'frontend_manifest' => 'frontend-dist/manifest.json',
    ],
];
$shapeErrors = $validator->validateManifestShape($validManifest);
assert_true($shapeErrors === [], 'valid manifest shape has no errors');

// —— invalid slug ——
$badSlug = $validManifest;
$badSlug['slug'] = 'Bad_Slug';
$slugErrors = $validator->validateManifestShape($badSlug);
assert_true($slugErrors !== [] && str_contains(implode(' ', $slugErrors), 'slug'), 'invalid slug rejected');

// —— checksum mismatch (temp dir) ——
$tmp = sys_get_temp_dir() . '/jasefly-modval-' . bin2hex(random_bytes(4));
@mkdir($tmp, 0775, true);
$payloadPath = $tmp . '/payload.txt';
file_put_contents($payloadPath, 'hello');
$checksumsPath = $tmp . '/checksums.json';
file_put_contents($checksumsPath, json_encode([
    'files' => [
        'payload.txt' => 'sha256:' . str_repeat('a', 64),
    ],
], JSON_UNESCAPED_SLASHES));
$ck = $validator->verifyChecksums($tmp, $checksumsPath);
assert_true($ck['ok'] === false, 'checksum mismatch detected');
assert_true(
    count(array_filter($ck['errors'], static fn(string $e) => str_contains($e, 'Checksum mismatch'))) > 0,
    'checksum mismatch error message present'
);

// —— installer .htaccess must not fail checksum listing ——
file_put_contents($tmp . '/.htaccess', "Require all denied\n");
file_put_contents($checksumsPath, json_encode([
    'files' => [
        'payload.txt' => 'sha256:' . hash_file('sha256', $payloadPath),
    ],
], JSON_UNESCAPED_SLASHES));
$ckHt = $validator->verifyChecksums($tmp, $checksumsPath);
assert_true($ckHt['ok'] === true, 'installer .htaccess ignored in checksum scan');

// cleanup temp
@unlink($payloadPath);
@unlink($checksumsPath);
@unlink($tmp . '/.htaccess');
@rmdir($tmp);

// —— Zip Slip via validateZipFile ——
if (!class_exists(ZipArchive::class)) {
    echo "  SKIP ZipArchive tests (ext-zip missing)\n";
} else {
    $zipPath = sys_get_temp_dir() . '/jasefly-zipslip-' . bin2hex(random_bytes(4)) . '.zip';
    $zip = new ZipArchive();
    assert_true($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 'create zip for slip test');
    $zip->addFromString('../evil.php', '<?php');
    $zip->addFromString('module.json', json_encode($validManifest));
    $zip->addFromString('checksums.json', '{"files":{}}');
    $zip->close();
    $zipResult = $validator->validateZipFile($zipPath);
    assert_true($zipResult['ok'] === false, 'validateZipFile rejects Zip Slip entry');
    assert_true(
        count(array_filter($zipResult['errors'], static fn(string $e) => str_contains($e, 'Path traversal') || str_contains($e, 'absolute'))) > 0,
        'Zip Slip error mentions path traversal'
    );
    @unlink($zipPath);

    // —— missing manifest in ZIP ——
    $zipMissing = sys_get_temp_dir() . '/jasefly-zipmiss-' . bin2hex(random_bytes(4)) . '.zip';
    $zip2 = new ZipArchive();
    $zip2->open($zipMissing, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    $zip2->addFromString('readme.txt', 'no manifest');
    $zip2->close();
    $miss = $validator->validateZipFile($zipMissing);
    assert_true($miss['ok'] === false, 'validateZipFile rejects ZIP without module.json');
    assert_true(
        count(array_filter($miss['errors'], static fn(string $e) => str_contains($e, 'module.json'))) > 0,
        'missing module.json reported'
    );
    @unlink($zipMissing);
}

// —— validateExtracted: incomplete package ——
$extractTmp = sys_get_temp_dir() . '/jasefly-extract-' . bin2hex(random_bytes(4));
@mkdir($extractTmp, 0775, true);
$extracted = $validator->validateExtracted($extractTmp, '1.0.0');
assert_true($extracted['ok'] === false, 'validateExtracted fails without module.json/checksums');
@rmdir($extractTmp);

// —— fixtures/bad-module: PackageStaticAnalyzer must flag Core import ——
$fixtureRoot = dirname(__DIR__) . '/tests/fixtures/bad-module';
assert_true(is_dir($fixtureRoot), 'bad-module fixture exists');
$analyzer = new PackageStaticAnalyzer();
$report = $analyzer->analyzeDirectory($fixtureRoot);
$findingList = is_array($report['findings'] ?? null) ? $report['findings'] : [];
$hasForbiddenNs = ($report['ok'] ?? true) === false;
foreach ($findingList as $f) {
    if (!is_array($f)) {
        continue;
    }
    if (str_contains((string) ($f['rule'] ?? ''), 'forbidden')) {
        $hasForbiddenNs = true;
        break;
    }
}
assert_true($hasForbiddenNs, 'fixtures/bad-module forbidden Core import detected');

// —— permissions policy: manifest lists perms; registerPermissions must not auto-grant roles ——
$refManifestPath = dirname(__DIR__, 2) . '/modules-src/forms-sdk-reference/module.json';
if (!is_file($refManifestPath)) {
    $refManifestPath = __DIR__ . '/fixtures/modules/forms-sdk-reference/module.json';
}
$refManifest = json_decode((string) file_get_contents($refManifestPath), true);
assert_true(is_array($refManifest), 'forms-sdk-reference module.json readable');
$m = ModuleManifest::fromArray($refManifest);
assert_true(count($m->permissions()) >= 3, 'manifest declares module permissions');
$svcSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/Modules/ModulePackageService.php');
assert_true(preg_match('/private function registerPermissions\(.*?\{(.*?)\n    \}/s', $svcSrc, $mm) === 1, 'registerPermissions method located');
$body = $mm[1] ?? '';
assert_true(str_contains($body, 'permissions'), 'registerPermissions writes permissions catalog');
assert_true(!str_contains($body, 'role_permissions'), 'registerPermissions does not auto-grant role_permissions');
