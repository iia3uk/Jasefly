<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformMailInterface
{
    /**
     * @param list<string>|string $to
     * @return array{ok:bool, error?:string}
     */
    public function sendHtml(string|array $to, string $subject, string $htmlBody, ?string $textBody = null): array;
}
