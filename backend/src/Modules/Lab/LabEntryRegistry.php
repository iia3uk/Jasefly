<?php
declare(strict_types=1);

namespace App\Modules\Lab;

/**
 * Whitelist of frontend experiment entry keys.
 * Must stay in sync with frontend/src/modules/lab/experimentRegistry.ts.
 * Never resolve arbitrary paths / PHP / JS from the database.
 */
final class LabEntryRegistry
{
    /**
     * @return array<string, array{key: string, label: string, description: string}>
     */
    public static function all(): array
    {
        return [
            'starter' => [
                'key' => 'starter',
                'label' => 'Starter',
                'description' => 'Базовый изолированный эксперимент (карточки, кнопка, light/dark)',
            ],
            'reference' => [
                'key' => 'reference',
                'label' => 'Reference',
                'description' => 'Визуальный референс стиля, иерархии и локальной темы Lab',
            ],
        ];
    }

    /** @return list<array{key: string, label: string, description: string}> */
    public static function list(): array
    {
        return array_values(self::all());
    }

    public static function isKnown(string $key): bool
    {
        return isset(self::all()[$key]);
    }

    public static function assertKnown(string $key): void
    {
        if (!self::isKnown($key)) {
            throw new \InvalidArgumentException(
                'Unknown entry_key. Use only keys from GET /admin/lab/entries.'
            );
        }
    }
}
