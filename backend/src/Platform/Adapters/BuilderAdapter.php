<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformBuilderInterface;

final class BuilderAdapter implements PlatformBuilderInterface
{
    /** @var array<string, array<string, mixed>> */
    private static array $meta = [];

    public function __construct(private string $moduleSlug) {}

    public function registerBlockMeta(string $type, array $blockMeta): void
    {
        $key = str_contains($type, '.') ? $type : $this->moduleSlug . '.' . $type;
        self::$meta[$key] = array_merge($blockMeta, ['type' => $key, 'module' => $this->moduleSlug]);
    }

    public function listBlockMeta(): array
    {
        return array_values(self::$meta);
    }
}
