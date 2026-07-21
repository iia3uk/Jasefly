<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Bootstrap.php';

use App\Bootstrap;

[, $db] = Bootstrap::init();

$files = [
    'plugin:Products:001_create_products.sql' => dirname(__DIR__) . '/src/Modules/Products/migrations/001_create_products.sql',
    'plugin:Products:002_storefront_fields.sql' => dirname(__DIR__) . '/src/Modules/Products/migrations/002_storefront_fields.sql',
];

foreach ($files as $id => $path) {
    $sql = (string) file_get_contents($path);
    foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            continue;
        }
        try {
            $db->run($stmt);
            echo "OK [$id]: " . substr($stmt, 0, 60) . "...\n";
        } catch (Throwable $e) {
            echo "SKIP [$id]: " . $e->getMessage() . "\n";
        }
    }
    try {
        $db->run('INSERT IGNORE INTO `_migrations` (id) VALUES (?)', [$id]);
    } catch (Throwable) {
        // ignore
    }
}

echo "done\n";
