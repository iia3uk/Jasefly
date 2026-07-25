<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Platform\Contracts\PlatformHttpInterface;
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

    public function router(): Router
    {
        return $this->router;
    }

    public function apiPrefix(): string
    {
        return $this->apiPrefix;
    }

    public function get(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->get($this->p($path), $handler, $middleware);
    }

    public function post(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->post($this->p($path), $handler, $middleware);
    }

    public function put(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->put($this->p($path), $handler, $middleware);
    }

    public function delete(string $path, callable $handler, array $middleware = []): void
    {
        $this->router->delete($this->p($path), $handler, $middleware);
    }

    public function authMiddleware(): AuthMiddleware
    {
        return new AuthMiddleware((string) ($this->app['jwt_secret'] ?? ''));
    }

    public function permissionMiddleware(): object
    {
        $db = $this->db ?? throw new \RuntimeException('Database required for permission middleware');
        return new PermissionMiddleware(new PermissionService($db));
    }

    private function p(string $path): string
    {
        if (str_starts_with($path, '/api')) {
            return $path;
        }
        return rtrim($this->apiPrefix, '/') . '/' . ltrim($path, '/');
    }
}
