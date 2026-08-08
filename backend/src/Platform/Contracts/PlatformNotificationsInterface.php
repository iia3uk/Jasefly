<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformNotificationsInterface
{
    /**
     * True when a package has registered a notifications backend for this process.
     * Consumers must degrade when false — never import a concrete NotificationService.
     */
    public function isAvailable(): bool;

    /** @param array<string, mixed> $data */
    public function notifyAdmins(string $type, string $title, string $body = '', array $data = []): void;

    /** @param array<string, mixed> $data */
    public function create(int $userId, string $type, string $title, string $body = '', array $data = []): void;

    /**
     * Package that owns delivery registers once during bootPlatform.
     * Owner slug is forced from the adapter context (no core slug map).
     *
     * @param callable(string,string,string,array<string,mixed>):void $notifyAdmins
     * @param callable(int,string,string,string,array<string,mixed>):void $create
     */
    public function registerBackend(callable $notifyAdmins, callable $create): void;
}
