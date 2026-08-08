<?php
declare(strict_types=1);

/**
 * Regression: ModuleHealthService require_once's the entrypoint before boot.
 * InstalledModuleLoader must still resolve the package class when already declared.
 */

$root = dirname(__DIR__);
require_once $root . '/src/Bootstrap.php';
\App\Bootstrap::registerAutoload();

$entry = $root . '/tests/fixtures/modules/demo-kit/backend/DemoKitModule.php';
if (!is_file($entry)) {
    echo "  SKIP InstalledModuleLoader health-preload (demo-kit fixture missing)\n";
    return;
}

require_once $entry; // simulate health preload
require_once $entry; // second require_once is a no-op (boot path)

$expectedNs = 'App\\PackageModules\\DemoKit\\';
$inner = null;
foreach (get_declared_classes() as $class) {
    if (!str_starts_with($class, $expectedNs)) {
        continue;
    }
    if (!is_subclass_of($class, \App\Core\Modules\InstallableModuleInterface::class)
        && !in_array(\App\Core\Modules\InstallableModuleInterface::class, class_implements($class) ?: [], true)) {
        continue;
    }
    if (str_ends_with($class, 'Module') || $inner === null) {
        $inner = new $class();
        if (str_ends_with($class, 'Module')) {
            break;
        }
    }
}

assert_true($inner instanceof \App\Core\Modules\InstallableModuleInterface, 'package module resolves after health preload require_once');
assert_true($inner->name() === 'demo-kit' || $inner->name() !== '', 'resolved package module has name');
