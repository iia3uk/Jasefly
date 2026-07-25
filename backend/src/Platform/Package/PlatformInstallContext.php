<?php
declare(strict_types=1);

namespace App\Platform\Package;

use App\Core\Modules\ModuleInstallContext;

/** @internal Adapter from Core ModuleInstallContext to public SDK surface */
final class PlatformInstallContext implements PlatformInstallContextInterface
{
    public function __construct(private ModuleInstallContext $inner) {}

    public static function fromCore(ModuleInstallContext $inner): self
    {
        return new self($inner);
    }

    public function slug(): string
    {
        return $this->inner->manifest->slug();
    }

    public function version(): string
    {
        return $this->inner->manifest->version();
    }

    public function operation(): string
    {
        return $this->inner->operation;
    }

    public function moduleRoot(): string
    {
        return $this->inner->moduleRoot;
    }

    public function storageRoot(): string
    {
        return $this->inner->storageRoot;
    }

    public function storagePath(string $relative = ''): string
    {
        return $this->inner->storagePath($relative);
    }

    public function log(string $message): void
    {
        $this->inner->log($message);
    }
}
