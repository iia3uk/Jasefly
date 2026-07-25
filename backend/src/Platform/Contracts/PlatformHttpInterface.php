<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * HTTP surface for package modules — no Core Router / Middleware types.
 *
 * Handlers receive PlatformRequestInterface (and optional route params as extra args).
 */
interface PlatformHttpInterface
{
    public function apiPrefix(): string;

    /** @param callable(PlatformRequestInterface, mixed...): mixed $handler @param list<object> $middleware */
    public function get(string $path, callable $handler, array $middleware = []): void;

    /** @param callable(PlatformRequestInterface, mixed...): mixed $handler @param list<object> $middleware */
    public function post(string $path, callable $handler, array $middleware = []): void;

    /** @param callable(PlatformRequestInterface, mixed...): mixed $handler @param list<object> $middleware */
    public function put(string $path, callable $handler, array $middleware = []): void;

    /** @param callable(PlatformRequestInterface, mixed...): mixed $handler @param list<object> $middleware */
    public function delete(string $path, callable $handler, array $middleware = []): void;

    /** Auth JWT middleware (opaque object — do not type-hint the concrete class). */
    public function authMiddleware(): object;

    /** Permission gate middleware (opaque). */
    public function permissionMiddleware(): object;

    /**
     * Soft rate-limit middleware for public endpoints.
     *
     * @return object Opaque middleware instance
     */
    public function rateLimitMiddleware(int $maxAttempts = 20, int $windowSeconds = 60): object;

    /**
     * Stream a file download / CSV response and exit the request.
     *
     * @param array<string, string> $headers
     */
    public function download(string $filename, string $body, string $contentType = 'text/csv; charset=utf-8', array $headers = []): never;
}
