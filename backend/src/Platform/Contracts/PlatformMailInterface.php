<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Package-facing mail capability (transactional HTML).
 * Host adapter owns transport; packages must not import concrete Mailer classes.
 */
interface PlatformMailInterface
{
    /**
     * True when the host can attempt delivery (transport present + basic config).
     * Packages use this to degrade (e.g. skip confirmation mail) without knowing mail module slug.
     */
    public function isAvailable(): bool;

    /**
     * Send a transactional HTML message (single or fan-out list).
     * Campaign batching stays in the package (via scheduler); this is one delivery unit.
     *
     * @param list<string>|string $to
     * @return array{ok:bool, error?:string}
     */
    public function sendHtml(string|array $to, string $subject, string $htmlBody, ?string $textBody = null): array;
}
