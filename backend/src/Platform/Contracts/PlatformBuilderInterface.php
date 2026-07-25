<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Backend metadata for builder extensions (FE registers widgets via Frontend SDK).
 */
interface PlatformBuilderInterface
{
    /** @param array<string, mixed> $blockMeta */
    public function registerBlockMeta(string $type, array $blockMeta): void;

    /** @return list<array<string, mixed>> */
    public function listBlockMeta(): array;
}
