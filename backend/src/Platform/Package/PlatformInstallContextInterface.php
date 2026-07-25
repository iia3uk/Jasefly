<?php
declare(strict_types=1);

namespace App\Platform\Package;

/**
 * Public install/update/uninstall hook context (no Core types).
 */
interface PlatformInstallContextInterface
{
    public function slug(): string;

    public function version(): string;

    public function operation(): string;

    public function moduleRoot(): string;

    public function storageRoot(): string;

    public function storagePath(string $relative = ''): string;

    public function log(string $message): void;
}
