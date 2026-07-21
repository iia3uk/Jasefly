<?php
declare(strict_types=1);

/**
 * Crawler HTML entry (dynamic rendering).
 * Wired from document-root prerender.php + .htaccess bot rules.
 *
 * Test as a human: /prerender.php?path=/projects
 */

use App\Bootstrap;
use App\Services\PrerenderService;
use App\Services\SitemapService;

function prerender_bootstrap(): array
{
    require dirname(__DIR__) . '/src/Bootstrap.php';
    return Bootstrap::init();
}

try {
    [$app, $db] = prerender_bootstrap();

    $reqPath = (string) ($_GET['path'] ?? '');
    if ($reqPath === '') {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $reqPath = parse_url($uri, PHP_URL_PATH) ?: '/';
        // When called as /prerender.php, prefer Referer-less explicit path only.
        if (str_ends_with($reqPath, '/prerender.php') || str_ends_with($reqPath, 'prerender.php')) {
            $reqPath = '/';
        }
    }

    $path = '/' . trim(str_replace('\\', '/', $reqPath), '/');
    if ($path === '/prerender.php') {
        $path = '/';
    }

    // Root SEO files for all clients (not only bots)
    if ($path === '/sitemap.xml' || $path === 'sitemap.xml') {
        (new SitemapService($db, $app))->output();
    }
    if ($path === '/robots.txt' || $path === 'robots.txt') {
        $seo = $db->one('SELECT robots_txt, canonical_base_url FROM seo_settings LIMIT 1') ?: [];
        $body = $seo['robots_txt'] ?? null;
        if (!$body) {
            $base = rtrim((string) ($seo['canonical_base_url'] ?? $app['url'] ?? $app['app_url'] ?? ''), '/');
            $site = $db->one('SELECT * FROM site_settings LIMIT 1') ?: [];
            $adminBase = \App\Support\AdminBasePath::fromSiteSettings($site);
            $disallow = ["Disallow: /admin", "Disallow: /api/"];
            if ($adminBase !== 'admin') {
                $disallow[] = "Disallow: /{$adminBase}";
            }
            $body = "User-agent: *\nAllow: /\n" . implode("\n", $disallow) . "\nSitemap: {$base}/sitemap.xml\n";
        }
        header('Content-Type: text/plain; charset=utf-8');
        echo $body;
        exit;
    }

    $force = isset($_GET['prerender']) && (string) $_GET['prerender'] === '1';
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    $isBot = PrerenderService::isBot($ua);

    // Safety: if someone opens prerender.php without force and is not a bot, still render
    // (htaccess only sends bots here; direct hits with ?path= are for debugging).
    if (!$isBot && !$force && !isset($_GET['path'])) {
        $spa = dirname(__DIR__, 2) . '/index.html';
        if (is_file($spa)) {
            header('Content-Type: text/html; charset=utf-8');
            readfile($spa);
            exit;
        }
    }

    $svc = new PrerenderService($db, $app);
    $result = $svc->render($path === '' ? '/' : $path);
    if (!empty($result['redirect']) && in_array((int) $result['status'], [301, 302], true)) {
        header('Location: ' . $result['redirect'], true, (int) $result['status']);
        exit;
    }
    http_response_code($result['status']);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Prerender: ' . ($result['cached'] ? 'cache' : 'fresh'));
    header('X-Robots-Tag: all');
    echo $result['html'];
    exit;
} catch (Throwable $e) {
    $logDir = dirname(__DIR__) . '/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    @file_put_contents(
        $logDir . '/prerender.log',
        date('c') . ' ' . $e->getMessage() . "\n",
        FILE_APPEND
    );
    // Fail open: let the SPA handle the request
    $spa = dirname(__DIR__, 2) . '/index.html';
    if (is_file($spa)) {
        http_response_code(200);
        header('Content-Type: text/html; charset=utf-8');
        readfile($spa);
        exit;
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Prerender unavailable';
    exit;
}
