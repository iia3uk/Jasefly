<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModuleHookInterface as CoreModuleHookInterface;
use App\Core\Modules\ModuleInstallContext;
use App\Platform\Package\ModuleHookInterface as PlatformModuleHookInterface;
use App\Platform\Package\PlatformInstallContext;

/**
 * Executes install/update lifecycle hooks declared in module.json.
 */
final class ModuleHookRunner
{
    /**
     * @return list<string> log lines from hook context
     */
    public function run(string $hookName, ModuleInstallContext $context): array
    {
        $hooks = $context->manifest->hooks();
        $rel = $hooks[$hookName] ?? null;
        if ($rel === null || $rel === '') {
            return [];
        }

        $rel = str_replace('\\', '/', ltrim($rel, '/'));
        if (str_contains($rel, '..') || str_starts_with($rel, '/')) {
            throw new \RuntimeException('Hook path escapes module root');
        }

        $moduleRoot = rtrim(str_replace('\\', '/', $context->moduleRoot), '/');
        $hookFile = $moduleRoot . '/' . $rel;
        $hookReal = realpath($hookFile);
        $rootReal = realpath($moduleRoot);
        if ($hookReal === false || $rootReal === false) {
            throw new \RuntimeException('Hook file not found: ' . $rel);
        }
        $hookN = str_replace('\\', '/', $hookReal);
        $rootN = str_replace('\\', '/', $rootReal);
        if ($hookN !== $rootN && !str_starts_with($hookN, $rootN . '/')) {
            throw new \RuntimeException('Hook path outside module root');
        }

        $before = get_declared_classes();
        /** @var list<string> $before */
        require_once $hookReal;
        $newClasses = array_diff(get_declared_classes(), $before);

        $isHook = static function (string $class): bool {
            $impl = class_implements($class) ?: [];
            return is_subclass_of($class, PlatformModuleHookInterface::class)
                || is_subclass_of($class, CoreModuleHookInterface::class)
                || in_array(PlatformModuleHookInterface::class, $impl, true)
                || in_array(CoreModuleHookInterface::class, $impl, true);
        };

        $instance = null;
        foreach ($newClasses as $class) {
            if (!$isHook($class)) {
                continue;
            }
            $instance = new $class();
            break;
        }

        if ($instance === null) {
            $expectedNs = 'App\\PackageModules\\' . $context->manifest->studlySlug();
            foreach (get_declared_classes() as $class) {
                if (!str_starts_with($class, $expectedNs . '\\')) {
                    continue;
                }
                if ($isHook($class)) {
                    $instance = new $class();
                    break;
                }
            }
        }

        if ($instance === null || !method_exists($instance, 'run')) {
            throw new \RuntimeException('Hook class must implement ModuleHookInterface');
        }

        if ($instance instanceof PlatformModuleHookInterface) {
            $instance->run(PlatformInstallContext::fromCore($context));
        } else {
            $instance->run($context);
        }
        return $context->logs();
    }

    /** @return list<string> */
    public function runIfDefined(string $hookName, ModuleInstallContext $context): array
    {
        $hooks = $context->manifest->hooks();
        if (!isset($hooks[$hookName])) {
            return [];
        }
        return $this->run($hookName, $context);
    }
}
