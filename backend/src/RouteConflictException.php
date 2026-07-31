<?php
declare(strict_types=1);

namespace App;

/**
 * Duplicate METHOD + path registration (package modules must not override core routes).
 */
final class RouteConflictException extends \RuntimeException
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        ?\Throwable $previous = null,
    ) {
        parent::__construct(
            'Route conflict: ' . strtoupper($method) . ' ' . $path . ' already registered',
            0,
            $previous,
        );
    }
}
