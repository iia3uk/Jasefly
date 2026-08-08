<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformNotificationsInterface;

/**
 * Soft facade for Platform notifications.
 * Concrete delivery lives in the package that registerBackend() during boot.
 * Disable/uninstall → clearOwner($slug) → isAvailable() false; callers no-op.
 */
final class NotificationsAdapter implements PlatformNotificationsInterface
{
    private static ?string $ownerSlug = null;

    /** @var (callable(string,string,string,array<string,mixed>):void)|null */
    private static $notifyAdminsImpl = null;

    /** @var (callable(int,string,string,string,array<string,mixed>):void)|null */
    private static $createImpl = null;

    public function __construct(
        private string $moduleSlug = '',
    ) {}

    public function isAvailable(): bool
    {
        return self::$notifyAdminsImpl !== null && self::$createImpl !== null;
    }

    public function notifyAdmins(string $type, string $title, string $body = '', array $data = []): void
    {
        if (self::$notifyAdminsImpl === null) {
            return;
        }
        (self::$notifyAdminsImpl)($type, $title, $body, $data);
    }

    public function create(int $userId, string $type, string $title, string $body = '', array $data = []): void
    {
        if (self::$createImpl === null) {
            return;
        }
        (self::$createImpl)($userId, $type, $title, $body, $data);
    }

    public function registerBackend(callable $notifyAdmins, callable $create): void
    {
        $slug = trim($this->moduleSlug);
        if ($slug === '') {
            throw new \RuntimeException('notifications.registerBackend requires a package slug context');
        }
        self::$ownerSlug = $slug;
        self::$notifyAdminsImpl = $notifyAdmins;
        self::$createImpl = $create;
    }

    /** Called on package disable/uninstall (generic — any provider slug). */
    public static function clearOwner(string $slug): void
    {
        $slug = trim($slug);
        if ($slug === '' || self::$ownerSlug !== $slug) {
            return;
        }
        self::$ownerSlug = null;
        self::$notifyAdminsImpl = null;
        self::$createImpl = null;
    }

    /** Test helper. */
    public static function resetForTests(): void
    {
        self::$ownerSlug = null;
        self::$notifyAdminsImpl = null;
        self::$createImpl = null;
    }
}
