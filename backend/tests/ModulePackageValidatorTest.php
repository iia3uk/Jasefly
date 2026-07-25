<?php
declare(strict_types=1);

/**
 * Unit tests for ModulePackageValidator (no DB).
 * Run via: php backend/tests/run.php
 */

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
