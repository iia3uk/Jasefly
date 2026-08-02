<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Support\SecretRedactor;

/** Defense-in-depth JSON scrubbing for demo responses. */
final class DemoResponseSanitizer
{
    public static function sanitize(mixed $value): mixed
    {
        $redacted = SecretRedactor::redact($value, SecretRedactor::DEMO_KEYS);
        return self::scrubStrings($redacted);
    }

    private static function scrubStrings(mixed $value): mixed
    {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $k => $v) {
                $out[$k] = self::scrubStrings($v);
            }
            return $out;
        }
        if (!is_string($value) || $value === '') {
            return $value;
        }
        // Absolute-ish server paths
        $value = preg_replace('#(?:[A-Za-z]:)?[\\\\/](?:home|var|usr|etc|Users|inetpub)[\\\\/][^\s"\']+#', '[path]', $value) ?? $value;
        // Internal IPs
        $value = preg_replace('#\b(?:10|127|192\.168|169\.254)(?:\.\d{1,3}){2,3}\b#', '[ip]', $value) ?? $value;
        return $value;
    }
}
