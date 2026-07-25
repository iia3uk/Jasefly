<?php
declare(strict_types=1);

namespace App\Platform\Attributes;

/**
 * Marks a public SDK method/class as deprecated for Compatibility reports.
 */
#[\Attribute(\Attribute::TARGET_METHOD | \Attribute::TARGET_CLASS)]
final class DeprecatedApi
{
    public function __construct(
        public int $since,
        public int $removeIn,
        public string $replacement = '',
        public string $message = '',
    ) {}
}
