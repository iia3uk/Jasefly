<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformTranslationsInterface
{
    public function t(string $key, ?string $locale = null, array $replace = []): string;

    /** @param array<string, string> $messages */
    public function register(string $locale, array $messages): void;
}
