<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Request;

/** @internal Host wrapper around App\Request */
final class PlatformRequest implements PlatformRequestInterface
{
    public function __construct(private Request $request) {}

    public function method(): string
    {
        return (string) $this->request->method;
    }

    public function path(): string
    {
        return (string) $this->request->path;
    }

    public function ip(): string
    {
        return $this->request->ip();
    }

    public function query(): array
    {
        return $_GET;
    }

    public function body(): array
    {
        return $this->request->all();
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->request->input($key, $default);
    }

    public function header(string $name, ?string $default = null): ?string
    {
        return $this->request->header($name) ?? $default;
    }

    public function user(): ?array
    {
        $u = $this->request->user ?? null;
        return is_array($u) ? $u : null;
    }

    public function raw(): mixed
    {
        return $this->request;
    }
}
