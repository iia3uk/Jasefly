<?php
declare(strict_types=1);

/**
 * Package surface registry + schema ownership + host hardcode guards.
 * Included from run.php.
 */

use App\Platform\Surfaces\PackageSurfaceRegistry;
use App\Services\SoftDeleteService;
use App\Services\PermissionService;

$repoRoot = dirname(__DIR__, 2);

PackageSurfaceRegistry::resetForTests();

// Unknown package can register surfaces without host edits
PackageSurfaceRegistry::register('zed', [
    'trash' => [['resource' => 'zed-items', 'table' => 'zed_items']],
    'dashboard' => [['table' => 'zed_items', 'count_as' => 'zed_items']],
    'sitemap' => [['table' => 'zed_items', 'path_prefix' => '/zed', 'where' => ['status' => 'published']]],
    'media' => [['table' => 'zed_items', 'columns' => ['cover_media_id']]],
    'content_acl' => [['resource' => 'zed-items']],
    'schema' => [['table' => 'zed_items', 'role' => 'owner']],
]);

$map = SoftDeleteService::trashableMap();
assert_true(($map['zed-items'] ?? null) === 'zed_items', 'soft-delete sees package trash surface');
assert_true(!isset(SoftDeleteService::HOST_TRASHABLE['blog']), 'host trash baseline has no blog');
assert_true(!isset(SoftDeleteService::HOST_TRASHABLE['projects']), 'host trash baseline has no projects');
assert_true(!isset(SoftDeleteService::HOST_TRASHABLE['products']), 'host trash baseline has no products');

$acl = PermissionService::contentResources();
assert_true(in_array('zed-items', $acl, true), 'content ACL includes package resource');
assert_true(!in_array('blog', PermissionService::hostContentResources(), true), 'host ACL baseline has no blog');
assert_true(!in_array('projects', PermissionService::hostContentResources(), true), 'host ACL baseline has no projects');

$owners = PackageSurfaceRegistry::schemaOwners();
assert_true(($owners['zed_items'] ?? null) === 'zed', 'schema owner for zed_items');

// Load package surface declarations and assert one owner per table
$ownerByTable = [];
foreach (['blog', 'projects', 'products', 'orders', 'payments', 'comments'] as $slug) {
    $candidates = [
        $repoRoot . '/modules-src/' . $slug . '/module.json',
        $repoRoot . '/release/catalog/manifests/' . $slug . '.json',
        dirname(__DIR__) . '/tests/fixtures/modules/' . $slug . '/module.json',
    ];
    $path = null;
    foreach ($candidates as $c) {
        if (is_file($c)) {
            $path = $c;
            break;
        }
    }
    assert_true($path !== null, "module.json identity exists for {$slug}");
    $mf = json_decode((string) file_get_contents($path), true);
    assert_true(is_array($mf['surfaces'] ?? null), "{$slug} declares surfaces");
    foreach (($mf['surfaces']['schema'] ?? []) as $row) {
        if (($row['role'] ?? '') !== 'owner') {
            continue;
        }
        $table = (string) ($row['table'] ?? '');
        assert_true($table !== '', "{$slug} schema owner has table");
        if (isset($ownerByTable[$table])) {
            assert_true(false, "duplicate schema owner for {$table}: {$ownerByTable[$table]} vs {$slug}");
        }
        $ownerByTable[$table] = $slug;
    }
}
assert_true(($ownerByTable['orders'] ?? null) === 'orders', 'orders owns orders table');
assert_true(($ownerByTable['payments'] ?? null) === 'payments', 'payments owns payments table');

// Host SoftDelete/Dashboard consumers must not hardcode extracted package tables
$softSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/SoftDeleteService.php');
assert_true(!preg_match("/'blog'\\s*=>\\s*'blog_posts'/", $softSrc), 'SoftDelete has no blog hardcode');
assert_true(!preg_match("/'projects'\\s*=>\\s*'projects'/", $softSrc), 'SoftDelete has no projects hardcode');
assert_true(!preg_match("/'products'\\s*=>\\s*'products'/", $softSrc), 'SoftDelete has no products hardcode');

$dashSrc = (string) file_get_contents($repoRoot . '/backend/src/Controllers/AdminController.php');
assert_true(
    str_contains($dashSrc, 'PackageSurfaceRegistry::dashboardMetrics'),
    'dashboard uses PackageSurfaceRegistry'
);
assert_true(
    !preg_match("/\\\$countTables\\s*=\\s*\\[[^\\]]*blog_posts/", $dashSrc),
    'dashboard countTables has no blog_posts hardcode'
);

$siteSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/SitemapService.php');
assert_true(str_contains($siteSrc, 'PackageSurfaceRegistry::sitemapEntries'), 'sitemap uses registry');
assert_true(!str_contains($siteSrc, "FROM blog_posts"), 'sitemap has no blog_posts SQL hardcode');
assert_true(!str_contains($siteSrc, "FROM projects "), 'sitemap has no projects SQL hardcode');
assert_true(!str_contains($siteSrc, "FROM products "), 'sitemap has no products SQL hardcode');

$mediaSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/MediaUsageService.php');
assert_true(str_contains($mediaSrc, 'PackageSurfaceRegistry::mediaCollectors'), 'media uses registry');
assert_true(!str_contains($mediaSrc, "FROM blog_posts"), 'media has no blog_posts hardcode');
assert_true(!str_contains($mediaSrc, "FROM products"), 'media has no products hardcode');

PackageSurfaceRegistry::clearOwner('zed');
assert_true(!isset(SoftDeleteService::trashableMap()['zed-items']), 'clearOwner removes surfaces');

PackageSurfaceRegistry::resetForTests();
echo "  OK  PackageSurfaceRegistry + schema ownership + host hardcode guards\n";
