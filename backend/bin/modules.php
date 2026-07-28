<?php
declare(strict_types=1);

/**
 * CLI for Module Package Manager.
 *
 *   php backend/bin/modules.php list
 *   php backend/bin/modules.php inspect /path/to/pkg.zip
 *   php backend/bin/modules.php install /path/to/pkg.zip
 *   php backend/bin/modules.php update /path/to/pkg.zip
 *   php backend/bin/modules.php enable demo-kit
 *   php backend/bin/modules.php disable demo-kit
 *   php backend/bin/modules.php uninstall demo-kit [--keep-data|--remove-data]
 *   php backend/bin/modules.php rollback demo-kit
 *   php backend/bin/modules.php migrations demo-kit
 *   php backend/bin/modules.php health demo-kit
 *   php backend/bin/modules.php reconcile-mirror [--dry-run|--apply]
 */

$root = dirname(__DIR__);
$configFile = "$root/config/config.local.php";
if (!is_file($configFile)) {
    fwrite(STDERR, "Missing config/config.local.php\n");
    exit(1);
}

require_once "$root/src/Bootstrap.php";

use App\Bootstrap;
use App\Core\Modules\ModulePackagePaths;
use App\Services\Modules\ModuleHealthService;
use App\Services\Modules\ModuleHookRunner;
use App\Services\Modules\ModuleMigrationService;
use App\Services\Modules\ModulePackageService;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\Modules\ModuleSnapshotService;
use App\Services\Modules\ModuleStagingService;

[$app, $db] = Bootstrap::init();

function modules_cli_service(\App\Database $db, array $app): ModulePackageService
{
    $paths = ModulePackagePaths::fromApp($app);
    $registry = new ModuleRegistryRepository($db);
    $staging = new ModuleStagingService($paths);
    $snapshots = new ModuleSnapshotService($paths, $registry);
    $migrations = new ModuleMigrationService($db);
    $hooks = new ModuleHookRunner();
    $health = new ModuleHealthService($registry, $paths, $migrations, $app);

    return new ModulePackageService(
        $db,
        $app,
        $paths,
        $registry,
        $staging,
        $snapshots,
        $migrations,
        $hooks,
        $health,
    );
}

function modules_cli_upload_local(ModulePackageService $svc, string $zipPath): string
{
    if (!is_file($zipPath)) {
        throw new RuntimeException('ZIP not found: ' . $zipPath);
    }
    $size = filesize($zipPath);
    $result = $svc->upload([
        'tmp_name' => $zipPath,
        'name' => basename($zipPath),
        'size' => $size !== false ? $size : 0,
        'error' => UPLOAD_ERR_OK,
        'allow_local_path' => true,
    ]);
    return (string) ($result['package_id'] ?? '');
}

function modules_cli_json(mixed $data, int $exit = 0): never
{
    echo json_encode(['ok' => $exit === 0, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit($exit);
}

function modules_cli_fail(string $message, int $exit = 1): never
{
    fwrite(STDERR, $message . "\n");
    exit($exit);
}

$argv = $_SERVER['argv'] ?? [];
$cmd = $argv[1] ?? '';
$arg = $argv[2] ?? '';

$keepData = true;
foreach ($argv as $flag) {
    if ($flag === '--remove-data') {
        $keepData = false;
    }
    if ($flag === '--keep-data') {
        $keepData = true;
    }
}

$svc = modules_cli_service($db, $app);
$repo = new ModuleRegistryRepository($db);

try {
    switch ($cmd) {
        case 'list':
            $rows = $repo->listAll();
            modules_cli_json(array_map(static function (array $row): array {
                return [
                    'slug' => $row['slug'] ?? '',
                    'name' => $row['name'] ?? '',
                    'version' => $row['installed_version'] ?? '',
                    'status' => $row['status'] ?? '',
                    'health_status' => $row['health_status'] ?? '',
                ];
            }, $rows));

        case 'inspect':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php inspect <zip|package_id>');
            }
            if (is_file($arg)) {
                $packageId = modules_cli_upload_local($svc, $arg);
                modules_cli_json($svc->inspect($packageId));
            }
            modules_cli_json($svc->inspect($arg));

        case 'install':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php install <zip>');
            }
            if (!is_file($arg)) {
                modules_cli_fail('ZIP not found: ' . $arg);
            }
            $packageId = modules_cli_upload_local($svc, $arg);
            modules_cli_json($svc->install($packageId, ['initiated_by' => null]));

        case 'update':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php update <zip>');
            }
            if (!is_file($arg)) {
                modules_cli_fail('ZIP not found: ' . $arg);
            }
            $packageId = modules_cli_upload_local($svc, $arg);
            $inspect = $svc->inspect($packageId);
            if (!($inspect['ok'] ?? false)) {
                modules_cli_fail('Inspect failed: ' . implode('; ', $inspect['errors'] ?? []));
            }
            $slug = (string) ($inspect['slug'] ?? '');
            if ($slug === '') {
                modules_cli_fail('Cannot resolve package slug');
            }
            modules_cli_json($svc->update($packageId, $slug, null));

        case 'enable':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php enable <slug>');
            }
            modules_cli_json($svc->enable($arg, null));

        case 'disable':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php disable <slug>');
            }
            modules_cli_json($svc->disable($arg, null));

        case 'uninstall':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php uninstall <slug> [--keep-data|--remove-data]');
            }
            modules_cli_json($svc->uninstall($arg, $keepData, null));

        case 'rollback':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php rollback <slug>');
            }
            modules_cli_json($svc->rollback($arg, null));

        case 'migrations':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php migrations <slug>');
            }
            modules_cli_json($repo->listModuleMigrations($arg));

        case 'health':
            if ($arg === '') {
                modules_cli_fail('Usage: modules.php health <slug>');
            }
            $paths = ModulePackagePaths::fromApp($app);
            $migrations = new ModuleMigrationService($db);
            $health = new ModuleHealthService($repo, $paths, $migrations, $app);
            modules_cli_json($health->check($arg));

        case 'reconcile-mirror':
            $dryRun = !in_array('--apply', $argv, true);
            modules_cli_json($svc->reconcilePluginMirror($dryRun));

        default:
            modules_cli_fail(
                "Usage: php modules.php list|inspect <zip>|install <zip>|update <zip>|enable <slug>|disable <slug>|uninstall <slug>|rollback <slug>|migrations <slug>|health <slug>|reconcile-mirror [--dry-run|--apply]"
            );
    }
} catch (Throwable $e) {
    modules_cli_fail($e->getMessage());
}
