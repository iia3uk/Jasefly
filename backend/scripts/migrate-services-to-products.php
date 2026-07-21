<?php
declare(strict_types=1);

/**
 * Миграция портфолио-услуг → развёрнутая витрина products (attrs/tabs/tags).
 *
 * Не трогает остальные таблицы. Источник (по приоритету):
 *   1) content/content-pack.json → products[]
 *   2) content/content-pack.json → services[] → автоконверсия
 *   3) таблица services в БД → автоконверсия
 *
 * Usage:
 *   php scripts/migrate-services-to-products.php
 *   php scripts/migrate-services-to-products.php --template=digital
 *   php scripts/migrate-services-to-products.php /path/to/content-pack.json
 */

require dirname(__DIR__) . '/src/Bootstrap.php';
require_once dirname(__DIR__) . '/src/Support/ContentPackImporter.php';

use App\Bootstrap;
use App\Core\ModuleRegistry;
use App\Core\Services\PageSeedService;
use App\Modules\Products\ProductTemplates;
use App\Modules\System\SystemTemplates;
use App\Support\ContentPackImporter;

[$app, $db, $registry] = Bootstrap::init();

$templateId = ProductTemplates::defaultId();
$packPath = dirname(__DIR__, 2) . '/content/content-pack.json';

foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--template=')) {
        $templateId = substr($arg, strlen('--template='));
        continue;
    }
    if ($arg !== '' && !str_starts_with($arg, '--')) {
        $packPath = $arg;
    }
}

if (ProductTemplates::get($templateId) === null) {
    fwrite(STDERR, "Unknown template: {$templateId}\n");
    fwrite(STDERR, 'Allowed: ' . implode(', ', ProductTemplates::ids()) . PHP_EOL);
    exit(1);
}

// Шаблоны страниц витрины (если ещё не залиты).
try {
    (new PageSeedService($db))->ensureEntries(SystemTemplates::demoPages());
} catch (Throwable $e) {
    echo 'WARN templates: ' . $e->getMessage() . PHP_EOL;
}

$products = [];
if (is_file($packPath)) {
    $raw = file_get_contents($packPath);
    $pack = json_decode((string) $raw, true);
    if (!is_array($pack)) {
        fwrite(STDERR, "Invalid JSON: {$packPath}\n");
        exit(1);
    }
    if (is_array($pack['products'] ?? null) && $pack['products'] !== []) {
        $products = $pack['products'];
        echo "Source: pack products[] (" . count($products) . ")\n";
    } elseif (is_array($pack['services'] ?? null) && $pack['services'] !== []) {
        $products = ContentPackImporter::servicesToProducts($pack['services']);
        echo "Source: pack services[] → products (" . count($products) . ")\n";
    }
}

if ($products === []) {
    try {
        $services = $db->all('SELECT * FROM services WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC');
    } catch (Throwable) {
        $services = [];
    }
    if ($services === []) {
        fwrite(STDERR, "No products/services found. Put content-pack.json or seed services first.\n");
        exit(1);
    }
    $products = ContentPackImporter::servicesToProducts($services);
    echo 'Source: DB services → products (' . count($products) . ")\n";
}

$pdo = $db->pdo();
$importer = new ContentPackImporter($pdo);
$count = $importer->syncProducts($products);

// Навигация «Услуги» → /products (если ещё старый href).
try {
    $db->run(
        "UPDATE navigation_items SET href = '/products'
         WHERE (label LIKE '%Услуг%' OR href IN ('/services', '#services')) AND is_visible = 1"
    );
} catch (Throwable $e) {
    echo 'WARN nav: ' . $e->getMessage() . PHP_EOL;
}

try {
    $db->run(
        "UPDATE homepage_sections SET cta_href = '/products'
         WHERE cta_href IN ('/services', '#services') OR section_key = 'services'"
    );
} catch (Throwable) {
    // column names may differ — ignore
}

/** @var ModuleRegistry $registry */
$module = $registry->get('Products');
if ($module) {
    $current = $registry->state()->getSettings($module);
    $registry->state()->setSettings($module, array_merge($current, [
        'storefront_template' => $templateId,
    ]));
    echo "storefront_template = {$templateId}\n";
} else {
    echo "WARN: Products module not registered — set template in admin\n";
}

echo json_encode([
    'ok' => true,
    'synced' => $count,
    'template' => $templateId,
    'slugs' => array_values(array_map(
        static fn(array $p) => (string) ($p['slug'] ?? ''),
        $products,
    )),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
