<?php
declare(strict_types=1);

/**
 * Emergency recovery (no Bootstrap): quarantine a broken package module that
 * causes uncatchable compile fatals during boot.
 *
 * Upload to: public_html/api/public/emergency-module-quarantine.php
 * Open:     /api/public/emergency-module-quarantine.php?slug=jasefly-character&confirm=1&token=MCP_API_TOKEN
 * Then DELETE this file.
 *
 * Token = api/config/.env → MCP_API_TOKEN (same as mcp-cms CMS_MCP_TOKEN).
 */
header('Content-Type: application/json; charset=utf-8');

$apiRoot = dirname(__DIR__);
$slug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) ($_GET['slug'] ?? ''))) ?? '';
$confirm = (string) ($_GET['confirm'] ?? '') === '1';
$provided = (string) ($_GET['token'] ?? '');
if ($provided === '' && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    if (preg_match('/Bearer\s+(\S+)/i', (string) $_SERVER['HTTP_AUTHORIZATION'], $m)) {
        $provided = $m[1];
    }
}

$expected = '';
$envFile = $apiRoot . '/config/.env';
if (is_file($envFile)) {
    $lines = @file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        if (trim($k) === 'MCP_API_TOKEN') {
            $expected = trim($v, " \t\"'");
            break;
        }
    }
}

if ($expected === '' || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden — pass token=MCP_API_TOKEN'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($slug === '' || !$confirm) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Usage: ?slug=jasefly-character&confirm=1&token=…',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$moduleRoot = $apiRoot . '/modules/' . $slug;
if (!is_dir($moduleRoot)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Module dir missing', 'path' => $moduleRoot], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$stamp = gmdate('YmdHis');
$quarantine = $apiRoot . '/storage/module-quarantine/' . $slug . '-' . $stamp;
if (!is_dir(dirname($quarantine)) && !@mkdir(dirname($quarantine), 0775, true) && !is_dir(dirname($quarantine))) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot create quarantine dir'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ok = @rename($moduleRoot, $quarantine);
if (!$ok) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'rename failed', 'from' => $moduleRoot, 'to' => $quarantine], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

$dbNote = null;
$configLocal = $apiRoot . '/config/config.local.php';
if (is_file($configLocal)) {
    try {
        $local = require $configLocal;
        $pdo = new PDO(
            sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $local['db_host'] ?? 'localhost',
                $local['db_name'] ?? '',
                $local['db_charset'] ?? 'utf8mb4'
            ),
            $local['db_user'] ?? '',
            $local['db_pass'] ?? '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $stmt = $pdo->prepare("UPDATE installed_modules SET status='disabled', health_status='failed', last_error=? WHERE slug=?");
        $stmt->execute(['quarantined via emergency-module-quarantine.php', $slug]);
        $dbNote = 'installed_modules status → disabled (' . $stmt->rowCount() . ' rows)';
    } catch (Throwable $e) {
        $dbNote = 'db skip: ' . $e->getMessage();
    }
}

echo json_encode([
    'ok' => true,
    'slug' => $slug,
    'moved_to' => $quarantine,
    'db' => $dbNote,
    'next' => 'DELETE this emergency script, then reinstall fixed module ZIP 1.0.1+',
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
