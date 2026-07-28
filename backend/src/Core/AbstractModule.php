<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Thin base for modules — override only what you need.
 * Provides safe defaults for every PluginInterface method so legacy
 * modules keep working without changes.
 */
abstract class AbstractModule implements Contract\ModuleInterface
{
    abstract public function name(): string;

    public function label(): string
    {
        return ucfirst(str_replace(['-', '_'], ' ', $this->name()));
    }

    public function description(): string
    {
        return (string) (PluginCatalogMeta::get($this->name())['description'] ?? '');
    }

    public function longDescription(): string
    {
        return (string) (PluginCatalogMeta::get($this->name())['long_description'] ?? '');
    }

    public function category(): string
    {
        return (string) (PluginCatalogMeta::get($this->name())['category'] ?? 'other');
    }

    public function requires(): array
    {
        return PluginCatalogMeta::requires($this->name());
    }

    public function suggests(): array
    {
        return PluginCatalogMeta::suggests($this->name());
    }

    public function priority(): int
    {
        return 100;
    }

    public function enabled(array $app): bool
    {
        $disabled = $app['modules']['disabled'] ?? [];
        return !in_array($this->name(), $disabled, true);
    }

    public function boot(\App\Database $db, array $app): void
    {
        // no-op
    }

    public function adminNav(): array
    {
        return [];
    }

    public function resources(): array
    {
        return [];
    }

    public function blueprints(): array
    {
        return [];
    }

    public function hooks(): array
    {
        return [];
    }

    public function blocks(): array
    {
        return [];
    }

    public function publicRoutes(): array
    {
        return [];
    }

    public function settingsSchema(): array
    {
        return [];
    }

    public function settings(): array
    {
        return [];
    }

    public function demoPages(): array
    {
        return [];
    }

    public function registersRoutesWhenDisabled(): bool
    {
        return false;
    }

    public function globalMiddleware(\App\Database $db, array $app): array
    {
        return [];
    }
}
