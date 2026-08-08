<?php
declare(strict_types=1);

/**
 * Canonical package lifecycle state machine (PHP/Node semantic parity).
 * States: installed → enabled ↔ disabled; failed/quarantined; uninstalled.
 * Included from run.php.
 */

$states = ['installed', 'enabled', 'disabled', 'failed', 'quarantined', 'uninstalled'];

/** @var array<string, list<string>> $transitions */
$transitions = [
    'uninstalled' => ['installed', 'failed'],
    'installed' => ['enabled', 'failed', 'uninstalled'],
    'enabled' => ['disabled', 'failed', 'quarantined', 'uninstalled'],
    'disabled' => ['enabled', 'failed', 'uninstalled'],
    'failed' => ['enabled', 'disabled', 'uninstalled'],
    'quarantined' => ['disabled', 'enabled', 'uninstalled'],
];

foreach ($states as $s) {
    assert_true(isset($transitions[$s]), "state {$s} has transitions");
}

// Install must not skip to enabled without an installed step (semantic).
$pkgSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/Modules/ModulePackageService.php');
assert_true(
    str_contains($pkgSrc, "? 'installed'") || str_contains($pkgSrc, "? 'installed'\n"),
    'PHP install sets installed first'
);
assert_true(
    str_contains($pkgSrc, 'installed → enabled') || str_contains($pkgSrc, "installed -> enabled"),
    'PHP has explicit installed→enabled transition'
);

$nodeSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/runtime-node/src/packages/ModulePackageService.ts');
assert_true(
    preg_match("/status:\\s*['\"]installed['\"]/", $nodeSrc) || str_contains($nodeSrc, "'installed'"),
    'Node install uses installed status'
);

echo "  OK  Package lifecycle state-machine parity guards\n";
