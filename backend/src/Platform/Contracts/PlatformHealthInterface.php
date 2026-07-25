<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformHealthInterface
{
    /** @return array{status:string, issues:list<string>, warnings:list<string>} */
    public function checkModule(string $slug): array;
}
