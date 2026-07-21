<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/Bootstrap.php';

use App\Bootstrap;

[, $db] = Bootstrap::init();
$sql = file_get_contents(dirname(__DIR__) . '/src/Modules/Products/migrations/002_storefront_fields.sql');
foreach (preg_split('/;\s*\n/', (string) $sql) as $stmt) {
    $stmt = trim($stmt);
    if ($stmt === '' || str_starts_with($stmt, '--')) {
        continue;
    }
    try {
        $db->run($stmt);
        echo 'OK: ' . substr($stmt, 0, 70) . "...\n";
    } catch (Throwable $e) {
        echo 'SKIP: ' . $e->getMessage() . "\n";
    }
}

$id = 'plugin:Products:002_storefront_fields.sql';
try {
    $db->run('INSERT IGNORE INTO `_migrations` (id) VALUES (?)', [$id]);
    echo "Tracked: $id\n";
} catch (Throwable $e) {
    echo 'Track skip: ' . $e->getMessage() . "\n";
}
