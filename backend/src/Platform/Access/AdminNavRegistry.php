<?php
declare(strict_types=1);

namespace App\Platform\Access;

/**
 * Host + ZIP admin navigation items with required capability.
 */
final class AdminNavRegistry
{
    /** @var list<array<string, mixed>> */
    private array $items = [];

    /** @param array<string, mixed> $item */
    public function register(array $item): void
    {
        $path = trim((string) ($item['path'] ?? ''));
        $capability = trim((string) ($item['capability'] ?? $item['permission'] ?? ''));
        if ($path === '' || $capability === '') {
            throw new \InvalidArgumentException('Admin nav item requires path and capability');
        }
        $this->items[] = [
            'group' => (string) ($item['group'] ?? 'Прочее'),
            'path' => $path,
            'label' => (string) ($item['label'] ?? $path),
            'capability' => $capability,
            'icon' => $item['icon'] ?? null,
            'permission' => $capability, // FE alias
        ];
    }

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        return $this->items;
    }

    /**
     * @param callable(string): bool $can
     * @return list<array{group: string, items: list<array<string, mixed>>}>
     */
    public function filteredGroups(callable $can): array
    {
        $byGroup = [];
        foreach ($this->items as $item) {
            if (!$can((string) $item['capability'])) {
                continue;
            }
            $g = (string) $item['group'];
            $byGroup[$g] ??= [];
            $byGroup[$g][] = $item;
        }
        $out = [];
        foreach ($byGroup as $group => $items) {
            if ($items === []) {
                continue;
            }
            $out[] = ['group' => $group, 'items' => $items];
        }
        return $out;
    }
}
