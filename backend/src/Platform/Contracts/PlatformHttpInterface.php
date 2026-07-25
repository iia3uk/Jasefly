<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

use App\Middleware\AuthMiddleware;
use App\Request;
use App\Router;

/**
 * HTTP surface for package modules — register routes without owning the core Router type long-term.
 * Packages may type-hint this interface only.
 */
interface PlatformHttpInterface
{
    public function router(): Router;

    public function apiPrefix(): string;

    /** @param list<object> $middleware */
    public function get(string $path, callable $handler, array $middleware = []): void;

    /** @param list<object> $middleware */
    public function post(string $path, callable $handler, array $middleware = []): void;

    /** @param list<object> $middleware */
    public function put(string $path, callable $handler, array $middleware = []): void;

    /** @param list<object> $middleware */
    public function delete(string $path, callable $handler, array $middleware = []): void;

    public function authMiddleware(): AuthMiddleware;

    /** Permission gate middleware (implementation type is internal — do not import it). */
    public function permissionMiddleware(): object;
}
