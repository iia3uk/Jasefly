<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformLoggerInterface
{
    public function info(string $message, array $context = []): void;

    public function warning(string $message, array $context = []): void;

    public function error(string $message, array $context = []): void;
}
