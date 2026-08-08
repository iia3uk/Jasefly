<?php
declare(strict_types=1);

namespace App\PackageModules\Translate;

use App\Platform\Contracts\PlatformContentInterface;

/**
 * Compatibility wrapper; content discovery belongs to the host SDK.
 */
final class TranslateCorpus
{
    public function __construct(private PlatformContentInterface $content) {}

    /** @return list<string> */
    public function collect(int $max = 2500): array
    {
        return $this->content->collectHumanReadableStrings($max);
    }
}
