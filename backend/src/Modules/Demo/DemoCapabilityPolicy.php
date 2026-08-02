<?php
declare(strict_types=1);

namespace App\Modules\Demo;

/**
 * Fail-closed capability filter for demo sessions.
 * High/critical denied unless explicitly allowlisted.
 */
final class DemoCapabilityPolicy
{
    /** Caps demo explorer may hold (low/medium sandbox ops). */
    public const ALLOWED = [
        'demo.session',
        'demo.builder.edit',
        'demo.content.view',
        'demo.content.edit',
        'demo.media.view',
        'demo.preview',
        'dashboard.view',
        'content.view',
        'content.create',
        'content.edit_own',
        'content.update',
        'builder.use',
        'pages.manage',
        'media.manage',
        'modules.view',
        'settings.view',
        'seo.manage',
        'system.logs',
    ];

    /** @return list<string> */
    public static function allowedCapabilities(): array
    {
        return self::ALLOWED;
    }

    public static function allows(string $capability): bool
    {
        $cap = trim($capability);
        if ($cap === '') {
            return false;
        }
        return in_array($cap, self::ALLOWED, true);
    }

    /**
     * @param list<string> $caps
     * @return list<string>
     */
    public static function filter(array $caps): array
    {
        $out = [];
        foreach ($caps as $c) {
            if (self::allows((string) $c)) {
                $out[] = (string) $c;
            }
        }
        return array_values(array_unique($out));
    }

    /** Risk gate: high/critical never pass unless in ALLOWED (defensive). */
    public static function allowsRisk(string $risk): bool
    {
        $r = strtolower(trim($risk));
        return !in_array($r, ['high', 'critical'], true);
    }
}
