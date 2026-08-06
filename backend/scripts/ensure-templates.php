<?php
declare(strict_types=1);

/**
 * Создаёт / обновляет системные шаблоны страниц (включая коммерцию).
 *
 * Usage: php scripts/ensure-templates.php
 */

require dirname(__DIR__) . '/src/Bootstrap.php';

use App\Bootstrap;
use App\Core\Services\PageSeedService;
use App\Modules\System\SystemTemplates;

[, $db] = Bootstrap::init();

$stats = (new PageSeedService($db))->ensureEntries(SystemTemplates::demoPagesForEnabled());

$commerce = [
    'payment', 'payment-success', 'payment-fail', 'offer', 'products', 'product-card', 'product-detail',
    'product-detail-simple', 'product-detail-storefront', 'product-detail-marketplace', 'product-detail-digital', 'product-detail-landing',
    'maintenance', 'register', 'admin-login',
];
$pages = [];
foreach ($commerce as $slug) {
    $row = $db->one('SELECT id, slug, title, status, template, layout_json FROM pages WHERE slug = ?', [$slug]);
    if (!$row) {
        $pages[$slug] = null;
        continue;
    }
    $layout = json_decode((string) ($row['layout_json'] ?? ''), true);
    $pages[$slug] = [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'status' => $row['status'],
        'useOnSite' => !empty($layout['meta']['useOnSite']),
        'seed' => !empty($layout['meta']['seed']),
        'widgets' => is_array($layout)
            ? substr_count((string) $row['layout_json'], '"widgetType"')
            : 0,
    ];
}

echo json_encode([
    'ok' => true,
    'stats' => $stats,
    'commerce_pages' => $pages,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
