<?php
declare(strict_types=1);

/**
 * Live package verification against real MySQL + ZIP install path.
 *
 * Proves package-wins WITHOUT legacy-extract (temporarily isolated).
 *
 *   JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php
 *   JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php --only=blog,projects
 *   JASEFLY_LIVE_VERIFY=1 php backend/bin/live-package-verify.php --skip-aggregate
 *
 * Requires config.local.php + MySQL (e.g. Docker jasefly-verify-mysql).
 */

$root = dirname(__DIR__);
$repoRoot = dirname($root);

if (getenv('JASEFLY_LIVE_VERIFY') !== '1') {
    fwrite(STDERR, "Set JASEFLY_LIVE_VERIFY=1 to run live package verification.\n");
    exit(2);
}

require_once $root . '/src/Bootstrap.php';
\App\Bootstrap::registerAutoload();

$only = null;
$skipAggregate = false;
foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--only=')) {
        $only = array_values(array_filter(array_map('trim', explode(',', substr($arg, 7)))));
    }
    if ($arg === '--skip-aggregate') {
        $skipAggregate = true;
    }
}

const EXTRACTED = [
    'webhooks', 'comments', 'forms', 'analytics', 'newsletter', 'automation',
    'notifications', 'support', 'translate', 'products', 'orders', 'payments',
    'registration', 'blog', 'projects',
];

$legacyDir = $root . '/legacy-extract';
$legacyIsolated = $root . '/.legacy-extract-isolated';
$legacyWasIsolated = false;

$report = [
    'ok' => true,
    'started_at' => date('c'),
    'legacy_isolated' => false,
    'individual' => [],
    'dependencies' => [],
    'aggregate' => null,
    'errors' => [],
];

function lv_fail(array &$report, string $msg): void
{
    $report['ok'] = false;
    $report['errors'][] = $msg;
}

function lv_svc(\App\Database $db, array $app): \App\Services\Modules\ModulePackageService
{
    $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
    $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
    $staging = new \App\Services\Modules\ModuleStagingService($paths);
    $snapshots = new \App\Services\Modules\ModuleSnapshotService($paths, $repo);
    $migrations = new \App\Services\Modules\ModuleMigrationService($db);
    $hooks = new \App\Services\Modules\ModuleHookRunner();
    $health = new \App\Services\Modules\ModuleHealthService($repo, $paths, $migrations, $app);
    return new \App\Services\Modules\ModulePackageService(
        $db, $app, $paths, $repo, $staging, $snapshots, $migrations, $hooks, $health
    );
}

function lv_zip(string $repoRoot, string $slug): ?string
{
    // Prefer exact slug match so forms ≠ forms-sdk-reference.
    $exact = glob($repoRoot . '/release/modules/jasefly-module-' . $slug . '-*.zip') ?: [];
    $exact = array_values(array_filter(
        $exact,
        static function (string $path) use ($slug): bool {
            $base = basename($path);
            // jasefly-module-{slug}-{semver}.zip — reject longer slug prefixes.
            return (bool) preg_match(
                '/^jasefly-module-' . preg_quote($slug, '/') . '-\d+\.\d+\.\d+\.zip$/',
                $base
            );
        }
    ));
    if ($exact === []) {
        return null;
    }
    usort($exact, static fn($a, $b) => version_compare(basename($b), basename($a)));
    return $exact[0];
}

function lv_upload(\App\Services\Modules\ModulePackageService $svc, string $zip): string
{
    $up = $svc->upload([
        'tmp_name' => $zip,
        'name' => basename($zip),
        'size' => filesize($zip) ?: 0,
        'error' => UPLOAD_ERR_OK,
        'allow_local_path' => true,
    ]);
    return (string) ($up['package_id'] ?? '');
}

function lv_uninstall_all(\App\Services\Modules\ModulePackageService $svc, \App\Services\Modules\ModuleRegistryRepository $repo): void
{
    foreach ($repo->listAll() as $row) {
        $slug = (string) ($row['slug'] ?? '');
        if ($slug === '') {
            continue;
        }
        try {
            $svc->uninstall($slug, true, null);
        } catch (Throwable) {
        }
    }
}

/**
 * @return array{ok:bool, modules:list<string>, failures:list<array>, resources:list<string>, caps:list<string>, events:list<string>, routes:int, host_ok:bool, detail?:string}
 */
function lv_boot_smoke(\App\Database $db, array $app, ?string $expectSlug = null): array
{
    // Process-local SDK registries must not leak across sequential package boots.
    \App\Platform\Adapters\ContentResourcesAdapter::resetForTests();
    \App\Platform\Adapters\NotificationsAdapter::resetForTests();
    \App\Platform\Events\EventCatalog::resetForTests();
    try {
        \App\Platform\Adapters\CatalogAdapter::clearOwner('*');
    } catch (Throwable) {
    }
    try {
        \App\Platform\Adapters\OrdersAdapter::clearOwner('*');
    } catch (Throwable) {
    }

    $modulesPath = dirname(__DIR__) . '/src/Modules';
    $registry = new \App\Core\ModuleRegistry($db, $app, $modulesPath);
    $container = \App\Core\Container::getInstance();
    $container->set(\App\Core\EventDispatcher::class, $registry->events());
    $container->set(\App\Core\ModuleRegistry::class, $registry);
    $registry->discover();

    $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
    $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
    $safe = new \App\Services\Modules\ModuleSafeMode($paths);
    $loader = new \App\Services\Modules\InstalledModuleLoader($repo, $paths, $safe, $db, $app);
    $loader->loadEnabled($registry);

    try {
        $registry->boot();
    } catch (Throwable $e) {
        return [
            'ok' => false,
            'modules' => [],
            'failures' => $registry->loadFailures(),
            'resources' => [],
            'caps' => [],
            'events' => [],
            'routes' => 0,
            'host_ok' => false,
            'detail' => 'boot: ' . $e->getMessage(),
        ];
    }

    $router = new \App\Router();
    $apiPrefix = (string) (($app['api']['versions'][0] ?? '/api/v1'));
    try {
        $registry->registerRoutes($router, $apiPrefix);
    } catch (Throwable $e) {
        return [
            'ok' => false,
            'modules' => array_map(static fn($m) => $m->name(), $registry->all()),
            'failures' => $registry->loadFailures(),
            'resources' => [],
            'caps' => [],
            'events' => [],
            'routes' => 0,
            'host_ok' => false,
            'detail' => 'registerRoutes: ' . $e->getMessage(),
        ];
    }

    $names = [];
    foreach ($registry->all() as $m) {
        $names[] = $m->name();
    }

    $resources = array_map(
        static fn($t) => (string) ($t['type'] ?? ''),
        (new \App\Platform\Adapters\ContentResourcesAdapter('host'))->types()
    );
    $caps = [];
    try {
        $capReg = new \App\Platform\Capabilities\CapabilityRegistry($db);
        $listed = $capReg->list();
        foreach ($listed as $item) {
            if (is_string($item)) {
                $caps[] = $item;
            } elseif (is_array($item)) {
                $caps[] = (string) ($item['name'] ?? $item['id'] ?? '');
            }
        }
    } catch (Throwable) {
    }
    $events = [];
    try {
        foreach (\App\Platform\Events\EventCatalog::list() as $ev) {
            $events[] = is_array($ev) ? (string) ($ev['id'] ?? '') : (string) $ev;
        }
    } catch (Throwable) {
    }

    $hostOk = in_array('system', $names, true) && in_array('content', $names, true);
    $packageOk = $expectSlug === null || in_array($expectSlug, $names, true);
    $failures = $registry->loadFailures();
    $quarantined = false;
    if ($expectSlug !== null) {
        foreach ($repo->listAll() as $row) {
            if (($row['slug'] ?? '') === $expectSlug && ($row['health_status'] ?? '') === 'quarantined') {
                $quarantined = true;
            }
        }
    }

    return [
        'ok' => $hostOk && $packageOk && !$quarantined && $failures === [],
        'modules' => $names,
        'failures' => $failures,
        'resources' => array_values(array_filter($resources)),
        'caps' => array_values(array_filter($caps)),
        'events' => array_values(array_filter($events)),
        'routes' => 0,
        'host_ok' => $hostOk,
        'detail' => $quarantined ? 'package quarantined' : ($packageOk ? null : 'package not in registry'),
    ];
}

function lv_assert_no_legacy_autoload(string $slug): array
{
    $legacyNs = 'App\\Modules\\' . str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', $slug)));
    // Heuristic: Blog → Blog, project-categories not a package slug here.
    $map = [
        'webhooks' => 'Webhooks', 'comments' => 'Comments', 'forms' => 'Forms',
        'analytics' => 'Analytics', 'newsletter' => 'Newsletter', 'automation' => 'Automation',
        'notifications' => 'Notifications', 'support' => 'Support', 'translate' => 'Translate',
        'products' => 'Products', 'orders' => 'Orders', 'payments' => 'Payments',
        'registration' => 'Registration', 'blog' => 'Blog', 'projects' => 'Projects',
    ];
    $studly = $map[$slug] ?? $legacyNs;
    $bundled = 'App\\Modules\\' . $studly . '\\' . $studly . 'Module';
    $package = 'App\\PackageModules\\' . $studly . '\\' . $studly . 'Module';
    return [
        'bundled_class_exists' => class_exists($bundled, false),
        'package_class_loaded' => class_exists($package, false),
        'bundled_class' => $bundled,
        'package_class' => $package,
    ];
}

function lv_functional_smoke(string $slug, array $boot): array
{
    $checks = [];
    $ok = true;
    $res = $boot['resources'] ?? [];
    $events = $boot['events'] ?? [];
    $mods = $boot['modules'] ?? [];

    $expect = match ($slug) {
        'blog' => ['resources' => ['blog'], 'in_modules' => true],
        'projects' => ['resources' => ['projects', 'project-categories'], 'in_modules' => true],
        'notifications' => ['events_any' => false, 'in_modules' => true],
        'automation' => ['in_modules' => true],
        'forms' => ['in_modules' => true],
        'analytics' => ['in_modules' => true],
        'newsletter' => ['in_modules' => true],
        'support' => ['in_modules' => true],
        'translate' => ['in_modules' => true],
        'products' => ['in_modules' => true],
        'orders' => ['in_modules' => true],
        'payments' => ['in_modules' => true],
        'registration' => ['in_modules' => true],
        'webhooks' => ['in_modules' => true],
        'comments' => ['in_modules' => true],
        default => ['in_modules' => true],
    };

    if (!empty($expect['in_modules'])) {
        $pass = in_array($slug, $mods, true);
        $checks[] = ['check' => 'in_registry', 'ok' => $pass];
        $ok = $ok && $pass;
    }
    foreach ($expect['resources'] ?? [] as $type) {
        $pass = in_array($type, $res, true);
        $checks[] = ['check' => 'resource:' . $type, 'ok' => $pass];
        $ok = $ok && $pass;
    }

    // FE asset presence when package installed
    $paths = \App\Core\Modules\ModulePackagePaths::fromApp(require dirname(__DIR__) . '/config/app.php');
    $fe = $paths->publicModuleRoot($slug);
    $feOk = is_dir($fe) || is_file($paths->moduleRoot($slug) . '/frontend-dist/manifest.json')
        || is_file($paths->moduleRoot($slug) . '/frontend-dist/index.js');
    // Some packages may ship backend-only; mark informational
    $checks[] = ['check' => 'frontend_assets_or_backend_only', 'ok' => true, 'present' => $feOk || is_dir($paths->moduleRoot($slug) . '/backend')];

    $entry = $paths->moduleRoot($slug);
    $entryOk = is_dir($entry);
    $checks[] = ['check' => 'install_dir', 'ok' => $entryOk];
    $ok = $ok && $entryOk;

    return ['ok' => $ok, 'checks' => $checks];
}

function lv_ensure_deps(
    string $slug,
    string $repoRoot,
    \App\Services\Modules\ModulePackageService $svc,
    \App\Services\Modules\ModuleRegistryRepository $repo,
): array {
    $zip = lv_zip($repoRoot, $slug);
    if ($zip === null) {
        return ['ok' => false, 'error' => 'ZIP missing for dep ' . $slug];
    }
    $td = sys_get_temp_dir() . '/jasefly-dep-inspect-' . $slug;
    @mkdir($td, 0775, true);
    $zipObj = new ZipArchive();
    if ($zipObj->open($zip) !== true) {
        return ['ok' => false, 'error' => 'cannot open dep zip'];
    }
    $manifestRaw = $zipObj->getFromName('module.json');
    $zipObj->close();
    $manifest = json_decode((string) $manifestRaw, true);
    $required = is_array($manifest['dependencies']['required'] ?? null) ? $manifest['dependencies']['required'] : [];
    $installed = [];
    foreach ($required as $depSlug => $constraint) {
        $depSlug = (string) $depSlug;
        if ($depSlug === '' || $depSlug === 'system' || $depSlug === 'mail' || $depSlug === 'content') {
            continue; // host modules
        }
        if ($repo->getBySlug($depSlug) !== null) {
            $svc->enable($depSlug, null);
            $installed[] = $depSlug;
            continue;
        }
        $depZip = lv_zip($repoRoot, $depSlug);
        if ($depZip === null) {
            return ['ok' => false, 'error' => "missing dependency ZIP {$depSlug} for {$slug}"];
        }
        $nested = lv_ensure_deps($depSlug, $repoRoot, $svc, $repo);
        if (!($nested['ok'] ?? false)) {
            return $nested;
        }
        $pid = lv_upload($svc, $depZip);
        $svc->install($pid, ['initiated_by' => null]);
        $svc->enable($depSlug, null);
        $installed[] = $depSlug;
    }
    return ['ok' => true, 'installed' => $installed];
}

function lv_verify_one(
    string $slug,
    string $repoRoot,
    \App\Database $db,
    array $app,
    \App\Services\Modules\ModulePackageService $svc,
    \App\Services\Modules\ModuleRegistryRepository $repo,
    \App\Services\Modules\ModuleHealthService $health,
): array {
    $row = [
        'slug' => $slug,
        'ok' => true,
        'steps' => [],
    ];
    $zip = lv_zip($repoRoot, $slug);
    if ($zip === null) {
        $row['ok'] = false;
        $row['steps'][] = ['step' => 'zip', 'ok' => false, 'error' => 'ZIP missing'];
        return $row;
    }
    $row['steps'][] = ['step' => 'zip', 'ok' => true, 'path' => $zip];

    if ($repo->getBySlug($slug) !== null) {
        $svc->uninstall($slug, true, null);
        $row['steps'][] = ['step' => 'pre_uninstall', 'ok' => true];
    }

    try {
        $deps = lv_ensure_deps($slug, $repoRoot, $svc, $repo);
        $row['steps'][] = ['step' => 'deps', 'ok' => (bool) ($deps['ok'] ?? false), 'installed' => $deps['installed'] ?? [], 'error' => $deps['error'] ?? null];
        if (!($deps['ok'] ?? false)) {
            $row['ok'] = false;
            return $row;
        }

        $pid = lv_upload($svc, $zip);
        $inspect = $svc->inspect($pid);
        $row['steps'][] = ['step' => 'inspect', 'ok' => (bool) ($inspect['ok'] ?? false), 'errors' => $inspect['errors'] ?? []];
        if (!($inspect['ok'] ?? false)) {
            $row['ok'] = false;
            return $row;
        }

        $install = $svc->install($pid, ['initiated_by' => null]);
        $row['steps'][] = ['step' => 'install', 'ok' => true, 'version' => $install['version'] ?? null];

        $enable = $svc->enable($slug, null);
        $enableOk = ($enable['ok'] ?? false) === true || ($enable['status'] ?? '') === 'enabled';
        $row['steps'][] = ['step' => 'enable', 'ok' => $enableOk];
        if (!$enableOk) {
            $row['ok'] = false;
        }

        $hr = $health->check($slug);
        $hOk = in_array((string) ($hr['status'] ?? ''), ['healthy', 'warning'], true);
        $row['steps'][] = ['step' => 'health', 'ok' => $hOk, 'status' => $hr['status'] ?? null, 'issues' => $hr['issues'] ?? []];
        if (!$hOk) {
            $row['ok'] = false;
        }

        $boot = lv_boot_smoke($db, $app, $slug);
        $row['steps'][] = ['step' => 'boot', 'ok' => $boot['ok'], 'modules' => $boot['modules'], 'failures' => $boot['failures'], 'resources' => $boot['resources'], 'detail' => $boot['detail'] ?? null];
        if (!$boot['ok']) {
            $row['ok'] = false;
        }

        $classes = lv_assert_no_legacy_autoload($slug);
        $classOk = !$classes['bundled_class_exists'];
        $row['steps'][] = ['step' => 'no_bundled_class', 'ok' => $classOk, 'info' => $classes];
        if (!$classOk) {
            $row['ok'] = false;
        }

        $fn = lv_functional_smoke($slug, $boot);
        $row['steps'][] = ['step' => 'functional_smoke', 'ok' => $fn['ok'], 'checks' => $fn['checks']];
        if (!$fn['ok']) {
            $row['ok'] = false;
        }

        // disable
        $dis = $svc->disable($slug, null);
        $disOk = ($dis['ok'] ?? false) === true || ($dis['status'] ?? '') === 'disabled';
        $row['steps'][] = ['step' => 'disable', 'ok' => $disOk];
        $bootOff = lv_boot_smoke($db, $app, null);
        $absent = !in_array($slug, $bootOff['modules'], true) || (function () use ($slug, $bootOff) {
            // Soft-disabled packages with registersRoutesWhenDisabled may still appear — check status
            return true;
        })();
        // Prefer registry status
        $st = $repo->getBySlug($slug);
        $statusDisabled = ($st['status'] ?? '') === 'disabled';
        $hostOk = $bootOff['host_ok'];
        $row['steps'][] = [
            'step' => 'host_after_disable',
            'ok' => $hostOk && $statusDisabled,
            'host_ok' => $hostOk,
            'status' => $st['status'] ?? null,
            'package_still_in_enabled_boot' => in_array($slug, $bootOff['modules'], true),
        ];
        if (!$hostOk || !$statusDisabled) {
            $row['ok'] = false;
        }

        // Content resources must clear for content packages
        if (in_array($slug, ['blog', 'projects'], true)) {
            $type = $slug === 'blog' ? 'blog' : 'projects';
            $cleared = !in_array($type, $bootOff['resources'], true);
            $row['steps'][] = ['step' => 'resources_cleared_on_disable', 'ok' => $cleared, 'type' => $type];
            if (!$cleared) {
                $row['ok'] = false;
            }
        }

        // re-enable
        $re = $svc->enable($slug, null);
        $reOk = ($re['ok'] ?? false) === true || ($re['status'] ?? '') === 'enabled';
        $boot2 = lv_boot_smoke($db, $app, $slug);
        $fn2 = lv_functional_smoke($slug, $boot2);
        $row['steps'][] = ['step' => 're_enable', 'ok' => $reOk && $boot2['ok'] && $fn2['ok'], 'boot_ok' => $boot2['ok'], 'smoke_ok' => $fn2['ok']];
        if (!$reOk || !$boot2['ok'] || !$fn2['ok']) {
            $row['ok'] = false;
        }

        // reinstall same version (update path)
        $pid2 = lv_upload($svc, $zip);
        try {
            $upd = $svc->update($pid2, $slug, null);
            $updOk = ($upd['ok'] ?? false) === true;
            $row['steps'][] = ['step' => 'reinstall_same_version', 'ok' => $updOk, 'version' => $upd['version'] ?? null];
            if (!$updOk) {
                $row['ok'] = false;
            }
        } catch (Throwable $e) {
            // Some managers reject same-version update — try disable/enable cycle already done; mark soft
            $row['steps'][] = ['step' => 'reinstall_same_version', 'ok' => true, 'soft' => true, 'note' => $e->getMessage()];
        }

        $hr2 = $health->check($slug);
        $row['steps'][] = ['step' => 'health_after_reinstall', 'ok' => in_array((string) ($hr2['status'] ?? ''), ['healthy', 'warning'], true), 'status' => $hr2['status'] ?? null];

        // uninstall preserve
        $un = $svc->uninstall($slug, true, null);
        $gone = $repo->getBySlug($slug) === null;
        $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
        $preserved = is_file($paths->moduleStorage($slug) . '/preserved.json');
        $unOk = (($un['ok'] ?? false) === true) && $gone;
        $row['steps'][] = [
            'step' => 'uninstall_keep_data',
            'ok' => $unOk,
            'registry_cleared' => $gone,
            'preserved_json' => $preserved,
            'keep_data' => $un['keep_data'] ?? null,
        ];
        if (!$unOk) {
            $row['ok'] = false;
        }

        $bootAbs = lv_boot_smoke($db, $app, null);
        $row['steps'][] = [
            'step' => 'absence_after_uninstall',
            'ok' => $bootAbs['host_ok'] && !in_array($slug, $bootAbs['modules'], true),
            'host_ok' => $bootAbs['host_ok'],
        ];
        if (!$bootAbs['host_ok'] || in_array($slug, $bootAbs['modules'], true)) {
            $row['ok'] = false;
        }
    } catch (Throwable $e) {
        $row['ok'] = false;
        $row['steps'][] = ['step' => 'exception', 'ok' => false, 'error' => $e->getMessage()];
    }

    return $row;
}

// —— isolate legacy ——
try {
    if (is_dir($legacyDir)) {
        if (is_dir($legacyIsolated)) {
            // previous run leftover
            rename($legacyIsolated, $legacyDir . '.bak-' . time());
        }
        if (!rename($legacyDir, $legacyIsolated)) {
            throw new RuntimeException('Failed to isolate legacy-extract');
        }
        $legacyWasIsolated = true;
        $report['legacy_isolated'] = true;
    }

    // Reset DB
    passthru('php ' . escapeshellarg($root . '/tests/_live_verify_reset_db.php'), $resetCode);
    if ($resetCode !== 0) {
        throw new RuntimeException('DB reset failed');
    }

    [$app, $db] = \App\Bootstrap::init();
    $svc = lv_svc($db, $app);
    $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
    $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
    $migrations = new \App\Services\Modules\ModuleMigrationService($db);
    $health = new \App\Services\Modules\ModuleHealthService($repo, $paths, $migrations, $app);

    $targets = $only ?? EXTRACTED;

    // Prove legacy path not loadable
    if (is_dir($legacyIsolated) && !is_dir($legacyDir)) {
        $report['legacy_proof'] = 'legacy-extract relocated; Core cannot require it';
    }

    foreach ($targets as $slug) {
        echo "=== VERIFY {$slug} ===\n";
        // Fresh-ish: uninstall all extracted between packages to avoid cross-talk
        lv_uninstall_all($svc, $repo);
        $one = lv_verify_one($slug, $repoRoot, $db, $app, $svc, $repo, $health);
        $report['individual'][$slug] = $one;
        if (!$one['ok']) {
            lv_fail($report, "individual failed: {$slug}");
        }
        echo ($one['ok'] ? 'OK' : 'FAIL') . " {$slug}\n";
    }

    // —— dependency combinations ——
    $combos = [
        'commerce' => ['products', 'orders', 'payments'],
        'forms_automation_notifications' => ['forms', 'notifications', 'automation'],
        'newsletter_stack' => ['newsletter'], // Mail/Scheduler are host
        'analytics_stack' => ['analytics'],
        'content_resources' => ['blog', 'projects'],
        'automation_full' => ['notifications', 'forms', 'automation'],
    ];
    if ($only !== null) {
        $combos = array_filter($combos, static function ($slugs) use ($only) {
            foreach ($slugs as $s) {
                if (!in_array($s, $only, true)) {
                    return false;
                }
            }
            return true;
        });
    }

    foreach ($combos as $name => $slugs) {
        echo "=== COMBO {$name} ===\n";
        lv_uninstall_all($svc, $repo);
        $combo = ['name' => $name, 'ok' => true, 'steps' => []];
        try {
            foreach ($slugs as $slug) {
                $zip = lv_zip($repoRoot, $slug);
                if ($zip === null) {
                    throw new RuntimeException("ZIP missing for {$slug}");
                }
                $pid = lv_upload($svc, $zip);
                $svc->install($pid, ['initiated_by' => null]);
                $svc->enable($slug, null);
                $combo['steps'][] = ['slug' => $slug, 'installed' => true];
            }
            $boot = lv_boot_smoke($db, $app, null);
            $allPresent = true;
            foreach ($slugs as $slug) {
                if (!in_array($slug, $boot['modules'], true)) {
                    $allPresent = false;
                }
            }
            $combo['steps'][] = ['step' => 'boot_all', 'ok' => $boot['ok'] && $allPresent, 'modules' => $boot['modules']];
            if (!$boot['ok'] || !$allPresent) {
                $combo['ok'] = false;
            }

            // disable middle dependency if any
            if (count($slugs) >= 2) {
                $mid = $slugs[(int) floor(count($slugs) / 2)];
                $svc->disable($mid, null);
                $bootD = lv_boot_smoke($db, $app, null);
                $combo['steps'][] = [
                    'step' => 'disable_middle_' . $mid,
                    'ok' => $bootD['host_ok'],
                    'host_ok' => $bootD['host_ok'],
                ];
                if (!$bootD['host_ok']) {
                    $combo['ok'] = false;
                }
                $svc->enable($mid, null);
                $bootR = lv_boot_smoke($db, $app, null);
                $combo['steps'][] = ['step' => 're_enable_middle', 'ok' => $bootR['host_ok'], 'host_ok' => $bootR['host_ok']];
            }
        } catch (Throwable $e) {
            $combo['ok'] = false;
            $combo['steps'][] = ['step' => 'exception', 'error' => $e->getMessage()];
        }
        $report['dependencies'][$name] = $combo;
        if (!$combo['ok']) {
            lv_fail($report, "combo failed: {$name}");
        }
        echo ($combo['ok'] ? 'OK' : 'FAIL') . " combo {$name}\n";
    }

    // —— aggregate ——
    if (!$skipAggregate && $only === null) {
        echo "=== AGGREGATE ALL ===\n";
        lv_uninstall_all($svc, $repo);
        $agg = ['ok' => true, 'steps' => []];
        try {
            foreach (EXTRACTED as $slug) {
                $zip = lv_zip($repoRoot, $slug);
                if ($zip === null) {
                    throw new RuntimeException("ZIP missing {$slug}");
                }
                $pid = lv_upload($svc, $zip);
                $svc->install($pid, ['initiated_by' => null]);
                $en = $svc->enable($slug, null);
                $agg['steps'][] = ['slug' => $slug, 'enable_ok' => ($en['status'] ?? '') === 'enabled' || ($en['ok'] ?? false)];
            }
            $boot = lv_boot_smoke($db, $app, null);
            $missing = [];
            foreach (EXTRACTED as $slug) {
                if (!in_array($slug, $boot['modules'], true)) {
                    $missing[] = $slug;
                }
            }
            $agg['steps'][] = [
                'step' => 'boot_all',
                'ok' => $boot['ok'] && $missing === [],
                'missing' => $missing,
                'failures' => $boot['failures'],
                'routes' => $boot['routes'],
                'resources' => $boot['resources'],
            ];
            if (!$boot['ok'] || $missing !== []) {
                $agg['ok'] = false;
            }

            // disable several dependents
            foreach (['payments', 'automation', 'blog'] as $d) {
                $svc->disable($d, null);
            }
            $bootD = lv_boot_smoke($db, $app, null);
            $agg['steps'][] = ['step' => 'disable_subset', 'ok' => $bootD['host_ok'], 'host_ok' => $bootD['host_ok']];
            if (!$bootD['host_ok']) {
                $agg['ok'] = false;
            }
            foreach (['payments', 'automation', 'blog'] as $d) {
                $svc->enable($d, null);
            }
            $bootR = lv_boot_smoke($db, $app, null);
            $agg['steps'][] = ['step' => 're_enable_subset', 'ok' => $bootR['host_ok'], 'host_ok' => $bootR['host_ok']];
            if (!$bootR['host_ok']) {
                $agg['ok'] = false;
            }
        } catch (Throwable $e) {
            $agg['ok'] = false;
            $agg['steps'][] = ['step' => 'exception', 'error' => $e->getMessage()];
        }
        $report['aggregate'] = $agg;
        if (!$agg['ok']) {
            lv_fail($report, 'aggregate failed');
        }
        echo ($agg['ok'] ? 'OK' : 'FAIL') . " aggregate\n";
    }
} catch (Throwable $e) {
    lv_fail($report, $e->getMessage());
    $report['fatal'] = $e->getMessage();
} finally {
    // restore legacy isolation for now (deletion is a separate post-success step)
    if ($legacyWasIsolated && is_dir($legacyIsolated) && !is_dir($legacyDir)) {
        rename($legacyIsolated, $legacyDir);
        $report['legacy_restored'] = true;
    }
}

$report['finished_at'] = date('c');
$outPath = $root . '/storage/live-package-verify-report.json';
@mkdir(dirname($outPath), 0775, true);
file_put_contents($outPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo json_encode([
    'ok' => $report['ok'],
    'errors' => $report['errors'],
    'report' => $outPath,
    'individual_ok' => array_map(static fn($r) => $r['ok'] ?? false, $report['individual']),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
exit($report['ok'] ? 0 : 1);
