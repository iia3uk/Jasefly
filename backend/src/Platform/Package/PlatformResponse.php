<?php
declare(strict_types=1);

namespace App\Platform\Package;

use App\Response;

/** Thin public JSON helpers so packages never import App\Response. */
final class PlatformResponse
{
    /** @param array<string, mixed> $data */
    public static function json(array $data, int $status = 200): void
    {
        Response::json($data, $status);
    }

    public static function error(string $message, int $status = 400): void
    {
        Response::error($message, $status);
    }
}
