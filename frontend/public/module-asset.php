<?php
declare(strict_types=1);

/**
 * Auth-aware gate for /modules/{slug}/… package frontend assets.
 * Public packs: anyone. Admin-only packs: staff/demo cookie or Bearer required.
 * Light boot: JWT secret only (no DB / module registry).
 */

$rel = (string) ($_GET['f'] ?? '');
$rel = str_replace('\\', '/', $rel);
$rel = ltrim($rel, '/');
if ($rel === '' || str_contains($rel, "\0") || str_contains($rel, '..')) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Bad path';
    exit;
}

$webRoot = str_replace('\\', '/', realpath(__DIR__) ?: __DIR__);
$modulesRoot = $webRoot . '/modules';
$absolute = $modulesRoot . '/' . $rel;
$realModules = realpath($modulesRoot);
$realFile = realpath($absolute);
if ($realModules === false || $realFile === false || !is_file($realFile)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}
$realModules = str_replace('\\', '/', $realModules);
$realFile = str_replace('\\', '/', $realFile);
if (!str_starts_with($realFile, $realModules . '/')) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit;
}

$parts = explode('/', $rel);
$slug = strtolower((string) ($parts[0] ?? ''));
$baseName = basename($realFile);
if ($baseName === '.access.json' || str_starts_with($baseName, '.')) {
    http_response_code(403);
    exit;
}

$adminOnlyDefault = in_array($slug, ['ai-content-optimizer', 'indexnow'], true);
$isPublic = !$adminOnlyDefault;
$accessFile = $modulesRoot . '/' . $slug . '/.access.json';
if (is_file($accessFile)) {
    $decoded = json_decode((string) file_get_contents($accessFile), true);
    if (is_array($decoded) && array_key_exists('public', $decoded)) {
        $isPublic = (bool) $decoded['public'];
    }
}

if (!$isPublic) {
    $apiSrc = is_dir($webRoot . '/api/src') ? $webRoot . '/api/src' : (is_dir(dirname($webRoot) . '/backend/src') ? dirname($webRoot) . '/backend/src' : '');
    $apiConfig = is_dir($webRoot . '/api/config') ? $webRoot . '/api/config' : (is_dir(dirname($webRoot) . '/backend/config') ? dirname($webRoot) . '/backend/config' : '');
    $ok = false;
    if ($apiSrc !== '' && $apiConfig !== '' && is_file($apiSrc . '/Bootstrap.php')) {
        require_once $apiSrc . '/Bootstrap.php';
        \App\Bootstrap::registerAutoload();
        if (is_file($apiSrc . '/Support/EnvFile.php')) {
            require_once $apiSrc . '/Support/EnvFile.php';
            \App\Support\EnvFile::load($apiConfig . '/.env');
        }
        $app = is_file($apiConfig . '/app.php') ? require $apiConfig . '/app.php' : [];
        $jwtSecret = is_array($app) ? (string) ($app['jwt_secret'] ?? '') : '';
        if ($jwtSecret !== '') {
            $ok = \App\Support\ModuleAssetGate::requestHasStaffSession($jwtSecret);
        }
    }
    if (!$ok) {
        http_response_code(401);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: private, no-store');
        echo 'Unauthorized';
        exit;
    }
}

$ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
$types = [
    'js' => 'application/javascript; charset=utf-8',
    'mjs' => 'application/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
    'map' => 'application/json; charset=utf-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'woff2' => 'font/woff2',
    'woff' => 'font/woff',
];
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: ' . ($isPublic ? 'public, max-age=3600, must-revalidate' : 'private, no-store'));
header('X-Robots-Tag: noindex, nofollow');
readfile($realFile);
exit;
