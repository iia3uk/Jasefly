<?php
declare(strict_types=1);

namespace App\Platform\Manifest;

use App\Core\Modules\ModuleManifest;

/**
 * Immutable public DTO adapted from the internal ModuleManifest.
 *
 * @internal Host may construct via fromCore(); packages only consume the interface.
 */
final class PlatformModuleManifest implements PlatformModuleManifestInterface
{
    /**
     * @param list<string> $requiredCapabilities
     * @param list<string> $providedCapabilities
     * @param list<string> $permissions
     */
    public function __construct(
        private string $slug,
        private string $name,
        private string $version,
        private string $description,
        private int $sdkVersion,
        private int $apiVersion,
        private array $requiredCapabilities,
        private array $providedCapabilities,
        private array $permissions,
        private string $backendEntrypoint,
        private ?string $frontendManifestPath,
    ) {}

    /** Host-only adapter — packages must not import ModuleManifest. */
    public static function fromCore(ModuleManifest $manifest): self
    {
        return new self(
            $manifest->slug(),
            $manifest->name(),
            $manifest->version(),
            $manifest->description(),
            $manifest->sdkVersion(),
            $manifest->apiVersion(),
            $manifest->requiredCapabilities(),
            $manifest->providedCapabilities(),
            $manifest->permissions(),
            $manifest->backendEntrypoint(),
            $manifest->frontendManifestPath(),
        );
    }

    public function slug(): string
    {
        return $this->slug;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function version(): string
    {
        return $this->version;
    }

    public function description(): string
    {
        return $this->description;
    }

    public function sdkVersion(): int
    {
        return $this->sdkVersion;
    }

    public function apiVersion(): int
    {
        return $this->apiVersion;
    }

    public function requiredCapabilities(): array
    {
        return $this->requiredCapabilities;
    }

    public function providedCapabilities(): array
    {
        return $this->providedCapabilities;
    }

    public function permissions(): array
    {
        return $this->permissions;
    }

    public function backendEntrypoint(): string
    {
        return $this->backendEntrypoint;
    }

    public function frontendManifestPath(): ?string
    {
        return $this->frontendManifestPath;
    }

    public function toPublicArray(): array
    {
        return [
            'slug' => $this->slug,
            'name' => $this->name,
            'version' => $this->version,
            'description' => $this->description,
            'sdk_version' => $this->sdkVersion,
            'api_version' => $this->apiVersion,
            'capabilities' => [
                'requires' => $this->requiredCapabilities,
                'provides' => $this->providedCapabilities,
            ],
            'permissions' => $this->permissions,
            'entrypoints' => [
                'backend' => $this->backendEntrypoint,
                'frontend_manifest' => $this->frontendManifestPath,
            ],
        ];
    }
}
