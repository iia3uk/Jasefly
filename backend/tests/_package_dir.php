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

/**
 * Core git tracks catalog identity, not distributable ZIPs (`*.zip` / release/modules gitignored).
 * Uses global assert_true from run.php.
 */
function jasefly_test_assert_package_identity(string $slug, ?string $repoRoot = null): void
{
    $repoRoot ??= dirname(__DIR__, 2);
    $manifest = $repoRoot . '/release/catalog/manifests/' . $slug . '.json';
    assert_true(is_file($manifest), "{$slug} catalog identity manifest present");

    $catalogPath = $repoRoot . '/release/catalog/packages.json';
    assert_true(is_file($catalogPath), 'packages.json catalog index present');
    $catalog = json_decode((string) file_get_contents($catalogPath), true);
    $packages = is_array($catalog['packages'] ?? null) ? $catalog['packages'] : [];
    $slugs = [];
    foreach ($packages as $row) {
        if (is_array($row) && isset($row['slug'])) {
            $slugs[] = (string) $row['slug'];
        }
    }
    assert_true(in_array($slug, $slugs, true), "{$slug} listed in packages.json");

    $id = json_decode((string) file_get_contents($manifest), true);
    assert_true(is_array($id) && ($id['slug'] ?? '') === $slug, "{$slug} identity slug matches");
}
