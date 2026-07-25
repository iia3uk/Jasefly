<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformHealthInterface
{
    /** @return array{status:string, issues:list<string>, warnings:list<string>} */
    public function checkModule(string $slug): array;

    /** Record a non-fatal degradation warning for the current module (e.g. missing optional mail). */
    public function warn(string $message): void;

    /** @return list<string> */
    public function warnings(): array;
}
