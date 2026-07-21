<?php
declare(strict_types=1);

namespace App\Modules\Ddos\Providers;

require_once __DIR__ . '/ProviderInterface.php';
require_once __DIR__ . '/Providers.php';

final class ProviderCatalog
{
    /** @var list<ProviderInterface>|null */
    private static ?array $cache = null;

    /** @return list<ProviderInterface> */
    public static function all(): array
    {
        return self::$cache ??= [
            new CloudflareProvider(),
            new DdosGuardProvider(),
            new StormWallProvider(),
            new QratorProvider(),
        ];
    }

    public static function get(string $id): ?ProviderInterface
    {
        foreach (self::all() as $p) {
            if ($p->id() === $id) {
                return $p;
            }
        }
        return null;
    }

    /** @return list<array<string, mixed>> */
    public static function settingsSchema(): array
    {
        $fields = [
            ['key' => '_heading_general', 'label' => 'Общая защита origin', 'type' => 'heading', 'default' => ''],
            ['key' => 'protection_enabled', 'label' => 'Включить ядро DDoS-защиты', 'type' => 'checkbox', 'default' => true,
                'help' => 'Мастер-выключатель middleware. Провайдеры ниже включаются отдельно.'],
            ['key' => 'under_attack', 'label' => 'Режим «под атакой» (локально)', 'type' => 'checkbox', 'default' => false,
                'help' => 'Жёсткий rate-limit + challenge cookie на origin. Можно синхронизировать с edge через кнопки в админке.'],
            ['key' => 'under_attack_rpm', 'label' => 'Лимит запросов / мин в under-attack', 'type' => 'number', 'default' => 30],
            ['key' => 'normal_rpm', 'label' => 'Лимит запросов / мин (обычный)', 'type' => 'number', 'default' => 120],
            ['key' => 'challenge_enabled', 'label' => 'JS/cookie challenge в under-attack', 'type' => 'checkbox', 'default' => true],
            ['key' => 'challenge_secret', 'label' => 'Секрет challenge cookie', 'type' => 'text', 'default' => '',
                'help' => 'Оставьте пустым — сгенерируется автоматически'],
            ['key' => 'block_message', 'label' => 'Сообщение при блокировке', 'type' => 'text', 'default' => 'Access denied by DDoS protection.'],
            ['key' => 'admin_bypass', 'label' => 'Не резать /admin и авторизованные API', 'type' => 'checkbox', 'default' => true],
            ['key' => '_heading_providers', 'label' => 'Провайдеры защиты', 'type' => 'heading', 'default' => '',
                'help' => 'Включайте только тот edge, через который реально идёт трафик'],
        ];

        foreach (self::all() as $p) {
            $fields[] = [
                'key' => 'enable_' . $p->id(),
                'label' => 'Включить: ' . $p->label(),
                'type' => 'checkbox',
                'default' => false,
                'help' => 'Доверять заголовкам ' . $p->label() . ' и применять правила origin shield',
            ];
            foreach ($p->credentialFields() as $f) {
                $fields[] = $f;
            }
        }

        return $fields;
    }

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        $out = [
            'protection_enabled' => true,
            'under_attack' => false,
            'under_attack_rpm' => 30,
            'normal_rpm' => 120,
            'challenge_enabled' => true,
            'challenge_secret' => '',
            'block_message' => 'Access denied by DDoS protection.',
            'admin_bypass' => true,
        ];
        foreach (self::all() as $p) {
            $out['enable_' . $p->id()] = false;
            foreach ($p->credentialFields() as $f) {
                $out[$f['key']] = $f['default'] ?? (isset($f['type']) && $f['type'] === 'checkbox' ? false : '');
            }
        }
        return $out;
    }
}
