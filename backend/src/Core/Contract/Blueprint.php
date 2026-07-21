<?php
declare(strict_types=1);

namespace App\Core\Contract;

/**
 * Canonical blueprint format describing a content type declaratively.
 *
 * A blueprint is the single source of truth for:
 *  - DB schema (table, columns, indexes, soft-delete, slug, seo)
 *  - Admin UI (field widgets, validation, labels, permissions, visibility)
 *  - Auto-migration diffing (blueprint vs live DB)
 *  - Generic CRUD routing
 *
 * Modules return one or more blueprints via PluginInterface::blueprints().
 * The CMS kernel normalizes them through Blueprint::normalize().
 */
final class Blueprint
{
    /** @var array<string, mixed> */
    private array $data;

    /**
     * @param array<string, mixed> $data
     */
    public function __construct(array $data)
    {
        $this->data = self::normalize($data);
    }

    public function key(): string
    {
        return (string) $this->data['key'];
    }

    public function table(): string
    {
        return (string) $this->data['table'];
    }

    public function label(): string
    {
        return (string) $this->data['label'];
    }

    public function isSingleton(): bool
    {
        return (bool) $this->data['singleton'];
    }

    public function softDelete(): bool
    {
        return (bool) $this->data['soft_delete'];
    }

    public function sluggable(): bool
    {
        return (bool) $this->data['slug'];
    }

    public function hasSeo(): bool
    {
        return (bool) $this->data['seo'];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function columns(): array
    {
        return $this->data['columns'];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function indexes(): array
    {
        return $this->data['indexes'];
    }

    /**
     * @return list<string>
     */
    public function permissions(): array
    {
        return $this->data['permissions'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->data;
    }

    /**
     * Normalize a raw blueprint array into a canonical shape.
     *
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    public static function normalize(array $raw): array
    {
        $key = (string) ($raw['key'] ?? '');
        if ($key === '') {
            throw new \InvalidArgumentException('Blueprint requires "key".');
        }

        $table = (string) ($raw['table'] ?? $key);
        $columns = [];
        foreach (($raw['columns'] ?? []) as $name => $col) {
            if (!is_array($col)) {
                $col = ['type' => (string) $col];
            }
            $columns[$name] = array_merge([
                'type' => 'string',
                'widget' => null,
                'label' => ucfirst((string) $name),
                'required' => false,
                'default' => null,
                'nullable' => true,
                'index' => false,
                'permission' => null,
                'visible' => true,
                'options' => null,
                'min' => null,
                'max' => null,
                'pattern' => null,
                'help' => null,
            ], $col);
        }

        return [
            'key' => $key,
            'table' => $table,
            'label' => (string) ($raw['label'] ?? ucfirst(str_replace(['_', '-'], ' ', $key))),
            'singleton' => (bool) ($raw['singleton'] ?? false),
            'soft_delete' => (bool) ($raw['soft_delete'] ?? false),
            'slug' => (bool) ($raw['slug'] ?? false),
            'seo' => (bool) ($raw['seo'] ?? false),
            'columns' => $columns,
            'indexes' => array_values($raw['indexes'] ?? []),
            'permissions' => array_values($raw['permissions'] ?? []),
            'group' => (string) ($raw['group'] ?? 'Content'),
            'orderable' => (bool) ($raw['orderable'] ?? false),
            'icon' => $raw['icon'] ?? null,
        ];
    }
}
