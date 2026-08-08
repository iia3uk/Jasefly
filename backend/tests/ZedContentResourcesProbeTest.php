<?php
declare(strict_types=1);

use App\Platform\Adapters\ContentResourcesAdapter;
use App\Platform\Adapters\DatabaseAdapter;

$probeRoot = dirname(__DIR__) . '/tests/fixtures/modules/zed-content-probe';
assert_true(is_dir($probeRoot), 'zed content probe fixture exists');

// The host plumbing is generic: it must never learn the synthetic slug/table.
foreach ([
    dirname(__DIR__) . '/src/Controllers/AdminController.php',
    dirname(__DIR__) . '/src/Controllers/PublicController.php',
    dirname(__DIR__) . '/src/Middleware/PermissionMiddleware.php',
] as $coreFile) {
    $source = (string) file_get_contents($coreFile);
    assert_true(
        !str_contains($source, 'zed-content-probe') && !str_contains($source, 'zed-items') && !str_contains($source, 'zed_items'),
        basename($coreFile) . ' contains no zed probe hardcode'
    );
}

$moduleSource = (string) file_get_contents($probeRoot . '/backend/ZedContentProbeModule.php');
assert_true(str_contains($moduleSource, '->resources()->register('), 'probe registers opaque resource through SDK');
assert_true(str_contains($moduleSource, 'zed-content-probe.item.created'), 'probe publishes declared event');
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers|Middleware)\\\\/', $moduleSource), 'probe module stays Platform-only');

// —— In-memory runtime proof (no pdo_sqlite required) ——
// Proves registry + CRUD + relations + public projection + clearOwner for an opaque type
// without product-specific Core knowledge.
ContentResourcesAdapter::resetForTests();
$mem = new class implements \App\Platform\Contracts\ContentResourceHandler {
    /** @var array<int, array<string, mixed>> */
    private array $items = [];
    /** @var array<int, list<array{tag:string}>> */
    private array $tags = [];
    private int $seq = 0;

    public function list(array $query): array
    {
        return ['items' => array_values($this->items), 'total' => count($this->items)];
    }

    public function get(int|string $idOrSlug, array $opts = []): ?array
    {
        if (is_numeric($idOrSlug)) {
            return $this->items[(int) $idOrSlug] ?? null;
        }
        foreach ($this->items as $row) {
            if (($row['slug'] ?? '') === (string) $idOrSlug) {
                return $row;
            }
        }
        return null;
    }

    public function create(array $data, ?array $user): array
    {
        $id = ++$this->seq;
        $row = [
            'id' => $id,
            'slug' => (string) ($data['slug'] ?? 'item-' . $id),
            'title' => (string) ($data['title'] ?? ''),
            'status' => (string) ($data['status'] ?? 'draft'),
            'deleted_at' => null,
        ];
        $this->items[$id] = $row;
        return ['ok' => true, 'item' => $row];
    }

    public function update(int|string $id, array $data, ?array $user): array
    {
        $id = (int) $id;
        if (!isset($this->items[$id])) {
            return ['ok' => false, 'error' => 'not_found'];
        }
        foreach (['slug', 'title', 'status'] as $k) {
            if (array_key_exists($k, $data)) {
                $this->items[$id][$k] = $data[$k];
            }
        }
        return ['ok' => true, 'item' => $this->items[$id]];
    }

    public function delete(int|string $id, ?array $user): array
    {
        $id = (int) $id;
        if (!isset($this->items[$id])) {
            return ['ok' => false, 'error' => 'not_found'];
        }
        $this->items[$id]['deleted_at'] = date('c');
        return ['ok' => true];
    }

    public function publish(int|string $id, string $status, ?array $user): array
    {
        return $this->update($id, ['status' => $status], $user);
    }

    public function relations(int|string $id, string $relation): array
    {
        if ($relation !== 'tags') {
            return [];
        }
        return $this->tags[(int) $id] ?? [];
    }

    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array
    {
        if ($relation !== 'tags') {
            return ['ok' => false, 'error' => 'unknown_relation'];
        }
        $clean = [];
        foreach ($rows as $row) {
            $tag = trim((string) ($row['tag'] ?? ''));
            if ($tag !== '') {
                $clean[] = ['tag' => $tag];
            }
        }
        $this->tags[(int) $id] = $clean;
        return ['ok' => true];
    }

    public function publicList(array $query): array
    {
        $items = array_values(array_filter(
            $this->items,
            static fn(array $r): bool => ($r['status'] ?? '') === 'published' && empty($r['deleted_at'])
        ));
        return ['items' => $items, 'total' => count($items)];
    }

    public function publicGet(string $slug): ?array
    {
        $row = $this->get($slug);
        if ($row === null || ($row['status'] ?? '') !== 'published' || !empty($row['deleted_at'])) {
            return null;
        }
        return $row;
    }
};

$adapter = new ContentResourcesAdapter('zed-content-probe');
$adapter->register('zed-items', [
    'permission' => 'content.edit',
    'soft_delete' => true,
    'sitemap' => true,
    'translate' => true,
    'label' => 'Zed items',
], $mem);

assert_true($adapter->has('zed-items'), 'in-memory: opaque type registered');
assert_true($adapter->owner('zed-items') === 'zed-content-probe', 'in-memory: owner is package slug');
$created = $adapter->create('zed-items', ['slug' => 'first-zed', 'title' => 'First Zed'], ['id' => 1]);
assert_true(($created['ok'] ?? false) === true, 'in-memory: create ok');
$id = (int) ($created['item']['id'] ?? 0);
assert_true(($adapter->get('zed-items', 'first-zed')['title'] ?? null) === 'First Zed', 'in-memory: get by slug');
assert_true(($adapter->update('zed-items', $id, ['title' => 'Updated'], ['id' => 1])['item']['title'] ?? null) === 'Updated', 'in-memory: update');
assert_true(($adapter->publish('zed-items', $id, 'published', ['id' => 1])['ok'] ?? false) === true, 'in-memory: publish');
assert_true(count($adapter->publicList('zed-items')['items'] ?? []) === 1, 'in-memory: publicList published only');
assert_true(($adapter->publicGet('zed-items', 'first-zed')['id'] ?? null) === $id, 'in-memory: publicGet');
assert_true(($adapter->replaceRelations('zed-items', $id, 'tags', [['tag' => 'a'], ['tag' => 'b']], ['id' => 1])['ok'] ?? false) === true, 'in-memory: replaceRelations');
assert_true(count($adapter->relations('zed-items', $id, 'tags')) === 2, 'in-memory: relations');
assert_true(($adapter->delete('zed-items', $id, ['id' => 1])['ok'] ?? false) === true, 'in-memory: delete');
assert_true($adapter->publicGet('zed-items', 'first-zed') === null, 'in-memory: deleted hidden from public');
$adapter->clearOwner('zed-content-probe');
assert_true(!$adapter->has('zed-items'), 'in-memory: clearOwner removes type');
$adapter->register('zed-items', ['label' => 'Zed items'], $mem);
assert_true($adapter->has('zed-items'), 'in-memory: re-register after enable');
// Foreign owner cannot steal type
$other = new ContentResourcesAdapter('other-pkg');
$threw = false;
try {
    $other->register('zed-items', [], $mem);
} catch (\Throwable) {
    $threw = true;
}
assert_true($threw, 'in-memory: type ownership conflict enforced');
ContentResourcesAdapter::resetForTests();

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP zed content resources SQLite persistence proof (pdo_sqlite missing)\n";
} else {
    require_once __DIR__ . '/helpers.php';
    require_once $probeRoot . '/backend/ZedItemHandler.php';

    $ctx = jasefly_test_sqlite_boot();
    $ctx['applyFile']($probeRoot . '/migrations/001_zed_items.sql');
    $adapter = new ContentResourcesAdapter('zed-content-probe');
    ContentResourcesAdapter::resetForTests();
    $adapter->register('zed-items', [
        'permission' => 'content.edit',
        'soft_delete' => true,
        'sitemap' => true,
        'translate' => true,
        'media' => [],
        'label' => 'Zed items',
    ], new \App\PackageModules\ZedContentProbe\ZedItemHandler(new DatabaseAdapter($ctx['db'])));

    assert_true($adapter->has('zed-items'), 'registered opaque type available');
    assert_true($adapter->owner('zed-items') === 'zed-content-probe', 'resource owner is package slug');
    assert_true(($adapter->definition('zed-items')['owner'] ?? null) === 'zed-content-probe', 'adapter stamps owner metadata');

    $created = $adapter->create('zed-items', ['slug' => 'first-zed', 'title' => 'First Zed'], ['id' => 1]);
    assert_true(($created['ok'] ?? false) === true, 'resource create succeeds');
    $id = (int) ($created['item']['id'] ?? 0);
    assert_true($id > 0, 'resource create returns item');
    assert_true(count($adapter->list('zed-items')['items'] ?? []) === 1, 'resource list delegates');
    assert_true(($adapter->get('zed-items', 'first-zed')['title'] ?? null) === 'First Zed', 'resource get by slug delegates');

    $updated = $adapter->update('zed-items', $id, ['title' => 'Updated Zed'], ['id' => 1]);
    assert_true(($updated['item']['title'] ?? null) === 'Updated Zed', 'resource update delegates');
    assert_true(($adapter->publish('zed-items', $id, 'published', ['id' => 1])['ok'] ?? false) === true, 'resource publish delegates');
    assert_true(count($adapter->publicList('zed-items')['items'] ?? []) === 1, 'public list exposes published item only');
    assert_true(($adapter->publicGet('zed-items', 'first-zed')['id'] ?? null) === $id, 'public get exposes published item');

    $relations = $adapter->replaceRelations('zed-items', $id, 'tags', [['tag' => 'php'], ['tag' => 'cms']], ['id' => 1]);
    assert_true(($relations['ok'] ?? false) === true && count($adapter->relations('zed-items', $id, 'tags')) === 2, 'relation replacement delegates');
    assert_true(($adapter->delete('zed-items', $id, ['id' => 1])['ok'] ?? false) === true, 'resource soft delete delegates');
    assert_true($adapter->publicGet('zed-items', 'first-zed') === null, 'deleted item leaves public projection');

    $adapter->clearOwner('zed-content-probe');
    assert_true(!$adapter->has('zed-items'), 'disable clearOwner removes package type');
    $adapter->register('zed-items', [], new \App\PackageModules\ZedContentProbe\ZedItemHandler(new DatabaseAdapter($ctx['db'])));
    assert_true($adapter->has('zed-items'), 'enable can re-register package type');
    ContentResourcesAdapter::resetForTests();
    ($ctx['cleanup'])();
}
