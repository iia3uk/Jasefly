<?php
declare(strict_types=1);

/**
 * Jasefly API front controller.
 * Deployed as public_html/api/public/index.php
 *
 * Production: error details are never returned in HTTP responses.
 * Ops: create api/storage/.show_errors temporarily, or set APP_ENV=local.
 * Admins: System → Last error (authenticated).
 */

function portfolio_wants_debug(): bool
{
    // Autoload may not be ready during very early fatals — keep a local fallback.
    if (class_exists(\App\Services\ErrorReportService::class, false)
        || is_file(dirname(__DIR__) . '/src/Services/ErrorReportService.php')) {
        require_once dirname(__DIR__) . '/src/Services/ErrorReportService.php';
        return \App\Services\ErrorReportService::shouldExposeDetails();
    }
    if (is_file(dirname(__DIR__) . '/storage/.show_errors')) {
        return true;
    }
    $env = strtolower((string) (getenv('APP_ENV') ?: ($_ENV['APP_ENV'] ?? '')));
    return in_array($env, ['local', 'development', 'dev', 'test'], true);
}

function portfolio_json_error(Throwable $e): never
{
    $logDir = dirname(__DIR__) . '/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    @file_put_contents(
        $logDir . '/error.log',
        date('c') . ' ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString() . "\n\n",
        FILE_APPEND
    );

    $request = [
        'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
        'uri' => (string) ($_SERVER['REQUEST_URI'] ?? ''),
        'query' => (string) ($_SERVER['QUERY_STRING'] ?? ''),
        'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    ];

    // Persist structured report for Admin → System debugger (even when response is generic).
    try {
        if (!class_exists(\App\Services\ErrorReportService::class, false)) {
            $svcFile = dirname(__DIR__) . '/src/Services/ErrorReportService.php';
            if (is_file($svcFile)) {
                require_once $svcFile;
            }
        }
        if (class_exists(\App\Services\ErrorReportService::class)) {
            \App\Services\ErrorReportService::store(
                \App\Services\ErrorReportService::fromThrowable($e, $request)
            );
        }
    } catch (Throwable) {
        // never break error rendering
    }

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }

    $show = portfolio_wants_debug();
    $payload = [
        'success' => false,
        'error' => $show ? $e->getMessage() : 'Internal server error',
        'errors' => $show ? [
            'debugger' => true,
            'message' => $e->getMessage(),
            'type' => $e::class,
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => array_slice(array_map(static function (array $f): array {
                return [
                    'file' => $f['file'] ?? null,
                    'line' => $f['line'] ?? null,
                    'fn' => ($f['class'] ?? '') . ($f['type'] ?? '') . ($f['function'] ?? ''),
                ];
            }, $e->getTrace()), 0, 25),
            'request' => $request,
            'php' => PHP_VERSION,
            'hint' => 'Скопируйте этот блок в отладчик админки или откройте System → Last error.',
        ] : [
            'hint' => 'Войдите в админку → System → Last error. Временно: api/storage/.show_errors (затем удалите). Лог: api/storage/logs/error.log',
        ],
        'data' => null,
    ];
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

set_exception_handler(static function (Throwable $e): void {
    portfolio_json_error($e);
});

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    // Throw so callers (e.g. InstalledModuleLoader) can quarantine bad packages.
    // Fatal shutdown handler still covers uncaught cases.
    throw new ErrorException($message, 0, $severity, $file, $line);
});

register_shutdown_function(static function (): void {
    $err = error_get_last();
    if (!$err) {
        return;
    }
    $fatal = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array($err['type'], $fatal, true)) {
        return;
    }
    // Avoid double output if something already printed
    if (headers_sent()) {
        return;
    }
    portfolio_json_error(new ErrorException($err['message'], 0, $err['type'], $err['file'], $err['line']));
});

require dirname(__DIR__) . '/src/Bootstrap.php';

[$app, $db, $registry] = \App\Bootstrap::init();

try {
    \App\Support\HttpsPolicy::learnFromRequest(isset($app['storage']) ? (string) $app['storage'] : null);
} catch (\Throwable) {
    // never block API boot
}

if (($app['jwt_secret'] ?? '') === '') {
    \App\Response::error('JWT_SECRET is not configured. Run install.php.', 503);
}

$router = new \App\Router();
$router->middleware(new \App\Middleware\CorsMiddleware($app['cors_origins'] ?? []));
$router->middleware(new \App\Middleware\SecurityHeadersMiddleware($app['csp']['script_cdn'] ?? []));
// CSRF Origin allowlist for all modules' mutating /admin/* (MCP Bearer exempt).
$router->middleware(new \App\Middleware\OriginCheckMiddleware($app));
// Plugin-contributed global guards (DDoS edge verification, under-attack mode, …).
foreach ($registry->globalMiddleware() as $mw) {
    $router->middleware($mw);
}

$versions = $app['api']['versions'] ?? ['/api/v1', '/api'];
foreach ($versions as $prefix) {
    $registry->registerRoutes($router, $prefix);
}

$req = \App\Request::fromGlobals();
// CORS preflight must run even when no route matches (otherwise browsers get 404 without ACAO).
if (strtoupper($req->method) === 'OPTIONS') {
    (new \App\Middleware\CorsMiddleware($app['cors_origins'] ?? []))(
        $req,
        static fn () => \App\Response::json(['ok' => true], 204)
    );
}

$router->dispatch($req);
