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

    /**
     * Permission gate middleware (opaque).
     * When $capability is set, host resolves the principal and requires that permission (fail-closed).
     */
    public function permissionMiddleware(?string $capability = null): object;

    /**
     * Soft rate-limit middleware for public endpoints.
     *
     * @return object Opaque middleware instance
     */
    public function rateLimitMiddleware(int $maxAttempts = 20, int $windowSeconds = 60): object;

    /**
     * Soft rate-limit middleware: returns the supplied throttle payload instead of 429.
     *
     * @param array<string, mixed> $throttleData
     * @return object Opaque middleware instance
     */
    public function softRateLimitMiddleware(int $maxAttempts, int $windowSeconds, array $throttleData = []): object;

    /**
     * Stream a file download / CSV response and exit the request.
     *
     * @param array<string, string> $headers
     */
    public function download(string $filename, string $body, string $contentType = 'text/csv; charset=utf-8', array $headers = []): never;

    /**
     * SSRF-safe check for outbound http(s) URLs (packages must not roll their own).
     */
    public function isSafeOutboundUrl(string $url): bool;

    /**
     * Outbound JSON POST with SSRF guard + DNS pin. Returns false on block/failure.
     *
     * @param array<string, mixed>|string $body
     * @param list<string> $headers Extra header lines (e.g. HMAC signatures)
     */
    public function postJsonOutbound(string $url, array|string $body, array $headers = [], int $timeoutSeconds = 5): bool;

    /**
     * Response-bearing outbound HTTP (SSRF-safe). For provider/acquiring APIs that
     * need status + body. Unknown packages must use this instead of raw cURL.
     *
     * @param array{
     *   method?: string,
     *   body?: array<string, mixed>|string|null,
     *   headers?: list<string>,
     *   timeout?: int,
     *   json?: bool
     * } $options
     * @return array{ok:bool, status:int, body:string, json:?array, error?:string}
     */
    public function requestOutbound(string $url, array $options = []): array;
}
