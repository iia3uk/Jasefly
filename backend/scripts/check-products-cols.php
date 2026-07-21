<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/Bootstrap.php';
[, $db] = App\Bootstrap::init();
$cols = array_column($db->all('SHOW COLUMNS FROM products'), 'Field');
echo implode(', ', $cols) . PHP_EOL;
if (!in_array('badge', $cols, true)) {
    $db->run('ALTER TABLE `products` ADD COLUMN `badge` VARCHAR(120) NULL DEFAULT NULL AFTER `sku`');
    echo "added badge\n";
}
