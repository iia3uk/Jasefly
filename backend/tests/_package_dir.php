<?php
declare(strict_types=1);

/** Resolve package authoring/fixture directory for Core tests (never required at runtime). */
function jasefly_test_package_dir(string $slug): ?string
{
    static $root = null;
    $root ??= dirname(__DIR__, 2);
    foreach ([
        $root . '/Jasefly-Modules/modules-src/' . $slug,
        $root . '/modules-src/' . $slug,
        __DIR__ . '/fixtures/modules/' . $slug,
    ] as $c) {
        if (is_dir($c) && is_file($c . '/module.json')) {
            return $c;
        }
    }
    return null;
}
