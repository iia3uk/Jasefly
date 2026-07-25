<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Request;
use App\Router;
use App\Services\PermissionService;

final class HttpAdapter implements PlatformHttpInterface
{
    public function __construct(
        private Router $router,
        private string $apiPrefix,
        private array $app,
        private ?Database $db = null,
    ) {}

    public function apiPrefix(): string
    {
        return $this->apiPrefix;
    }

    public function get(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->get($this->p($path), $this->wrap($handler), $middleware);
    }

    public function post(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->post($this->p($path), $this->wrap($handler), $middleware);
    }

    public function put(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->put($this->p($path), $this->wrap($handler), $middleware);
    }

    public function delete(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->delete($this->p($path), $this->wrap($handler), $middleware);
    }

    public function authMiddleware(): object
    {
        return new AuthMiddleware((string) ($this->app['jwt_secret'] ?? ''));
    }

    public function permissionMiddleware(): object
    {
        $db = $this->db ?? throw new \RuntimeException('Database required for permission middleware');
        return new PermissionMiddleware(new PermissionService($db));
    }

    public function rateLimitMiddleware(int $maxAttempts = 20, int $windowSeconds = 60): object
    {
        $db = $this->db ?? throw new \RuntimeException('Database required for rate limit middleware');
        return new RateLimitMiddleware($db, $maxAttempts, $windowSeconds);
    }

    public function download(string $filename, string $body, string $contentType = 'text/csv; charset=utf-8', array $headers = []): never
    {
        $safe = preg_replace('/[^\w.\-]+/', '_', $filename) ?: 'download.bin';
        if (!headers_sent()) {
            header('Content-Type: ' . $contentType);
            header('Content-Disposition: attachment; filename="' . $safe . '"');
            header('Cache-Control: no-store');
            foreach ($headers as $k => $v) {
                header($k . ': ' . $v);
            }
        }
        echo $body;
        exit;
    }

    /** @param callable(PlatformRequestInterface, mixed...): mixed $handler */
    private function wrap(callable $handler): callable
    {
        return static function (Request $r, mixed ...$args) use ($handler): mixed {
            return $handler(new PlatformRequest($r), ...$args);
        };
    }

    private function p(string $path): string
    {
        if (str_starts_with($path, '/api')) {
            return $path;
        }
        return rtrim($this->apiPrefix, '/') . '/' . ltrim($path, '/');
    }
}
