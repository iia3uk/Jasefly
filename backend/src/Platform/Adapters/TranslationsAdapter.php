<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformTranslationsInterface;

final class TranslationsAdapter implements PlatformTranslationsInterface
{
    /** @var array<string, array<string, string>> */
    private static array $bag = [];

    public function t(string $key, ?string $locale = null, array $replace = []): string
    {
        $locale = $locale ?? 'ru';
        $msg = self::$bag[$locale][$key] ?? self::$bag['en'][$key] ?? $key;
        foreach ($replace as $k => $v) {
            $msg = str_replace(':' . $k, (string) $v, $msg);
        }
        return $msg;
    }

    public function register(string $locale, array $messages): void
    {
        self::$bag[$locale] = array_merge(self::$bag[$locale] ?? [], $messages);
    }
}
