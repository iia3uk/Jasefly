<?php
declare(strict_types=1);

namespace App\PackageModules\JaseflyCharacter;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class JaseflyCharacterModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'jasefly-character';
    }

    public function label(): string
    {
        return 'Jasefly Character';
    }

    public function priority(): int
    {
        return 40;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Оформление',
            'path' => '/admin/jasefly-character',
            'label' => 'Дух CMS',
            'permission' => 'jasefly-character.view',
            'icon' => 'sparkles',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        $db = $ctx->database();
        self::ensureSchema($db);

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/jasefly-character/config', static function () use ($db) {
            PlatformResponse::json(['data' => self::loadCharacterSettings($db)]);
        });

        $http->get('/admin/jasefly-character/settings', static function (PlatformRequestInterface $r) use ($perms, $db) {
            $perms->require($r->user() ?? [], 'jasefly-character.view');
            PlatformResponse::json(['data' => self::loadCharacterSettings($db)]);
        }, $protected);

        $http->put('/admin/jasefly-character/settings', static function (PlatformRequestInterface $r) use ($perms, $db) {
            $perms->require($r->user() ?? [], 'jasefly-character.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            self::ensureSchema($db);
            $now = gmdate('Y-m-d H:i:s');
            $bindings = $body['bindings'] ?? null;
            $bindingsJson = null;
            if (is_array($bindings)) {
                $bindingsJson = json_encode(self::sanitizeBindings($bindings), JSON_UNESCAPED_UNICODE);
            } elseif (is_string($body['bindings_json'] ?? null)) {
                $decoded = json_decode((string) $body['bindings_json'], true);
                $bindingsJson = is_array($decoded)
                    ? json_encode(self::sanitizeBindings($decoded), JSON_UNESCAPED_UNICODE)
                    : null;
            }

            $row = [
                (int) ((bool) ($body['enabled'] ?? 1)),
                (int) ((bool) ($body['show_on_landing'] ?? 1)),
                (int) ((bool) ($body['show_on_admin_welcome'] ?? 1)),
                (int) ((bool) ($body['show_on_module_ops'] ?? 1)),
                $bindingsJson,
                max(5, min(600, (int) ($body['cooldown_sec'] ?? 45))),
                max(1, min(60, (int) ($body['max_per_hour'] ?? 8))),
                max(1, min(60, (int) ($body['idle_minutes'] ?? 4))),
                (int) ((bool) ($body['playful'] ?? 1)),
                max(1, min(30, (int) ($body['play_interval_sec'] ?? 2))),
                $now,
            ];
            try {
                $exists = $db->one('SELECT id FROM jasefly_character_settings WHERE id=1');
                if ($exists) {
                    $db->run(
                        'UPDATE jasefly_character_settings SET enabled=?, show_on_landing=?, show_on_admin_welcome=?, show_on_module_ops=?, bindings_json=?, cooldown_sec=?, max_per_hour=?, idle_minutes=?, playful=?, play_interval_sec=?, updated_at=? WHERE id=1',
                        $row
                    );
                } else {
                    $db->run(
                        'INSERT INTO jasefly_character_settings (id, enabled, show_on_landing, show_on_admin_welcome, show_on_module_ops, bindings_json, cooldown_sec, max_per_hour, idle_minutes, playful, play_interval_sec, created_at, updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)',
                        [...$row, $now]
                    );
                }
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 500);
            }
            PlatformResponse::json(['data' => self::loadCharacterSettings($db), 'message' => 'Сохранено']);
        }, $protected);
    }

    private static function ensureSchema(PlatformDatabaseInterface $db): void
    {
        $alters = [
            'bindings_json' => 'ALTER TABLE jasefly_character_settings ADD COLUMN bindings_json LONGTEXT NULL',
            'cooldown_sec' => 'ALTER TABLE jasefly_character_settings ADD COLUMN cooldown_sec INT NOT NULL DEFAULT 45',
            'max_per_hour' => 'ALTER TABLE jasefly_character_settings ADD COLUMN max_per_hour INT NOT NULL DEFAULT 8',
            'idle_minutes' => 'ALTER TABLE jasefly_character_settings ADD COLUMN idle_minutes INT NOT NULL DEFAULT 4',
            'playful' => 'ALTER TABLE jasefly_character_settings ADD COLUMN playful TINYINT(1) NOT NULL DEFAULT 1',
            'play_interval_sec' => 'ALTER TABLE jasefly_character_settings ADD COLUMN play_interval_sec INT NOT NULL DEFAULT 2',
        ];
        foreach ($alters as $col => $sql) {
            try {
                $row = $db->one(
                    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
                    ['jasefly_character_settings', $col]
                );
                if ($row) {
                    continue;
                }
                $db->run($sql);
            } catch (\Throwable) {
                try {
                    $db->run($sql);
                } catch (\Throwable) {
                    /* already exists or table missing until migration */
                }
            }
        }
    }

    /** @return array<string, array{emotion:string,pose:string,duration:int,badge:?string,anchor?:string}> */
    public static function defaultBindings(): array
    {
        return [
            'module.install.start' => ['emotion' => 'loading', 'pose' => 'celebrate', 'duration' => 0, 'badge' => null],
            'module.install.success' => ['emotion' => 'success', 'pose' => 'celebrate', 'duration' => 2400, 'badge' => '✓'],
            'module.install.error' => ['emotion' => 'error', 'pose' => 'inspect', 'duration' => 3400, 'badge' => null],
            'module.update.success' => ['emotion' => 'success', 'pose' => 'celebrate', 'duration' => 2200, 'badge' => '✓'],
            'admin.welcome' => ['emotion' => 'happy', 'pose' => 'wave', 'duration' => 2800, 'badge' => null],
            'admin.idle' => ['emotion' => 'sleep', 'pose' => 'sleep', 'duration' => 4200, 'badge' => null],
            'content.publish' => ['emotion' => 'happy', 'pose' => 'hover', 'duration' => 2200, 'badge' => null],
            'content.save' => ['emotion' => 'neutral', 'pose' => 'idle', 'duration' => 1600, 'badge' => null],
            'cms.error' => ['emotion' => 'error', 'pose' => 'inspect', 'duration' => 3000, 'badge' => null],
            'indexnow.done' => ['emotion' => 'success', 'pose' => 'wave', 'duration' => 2000, 'badge' => null],
            'ai.finished' => ['emotion' => 'think', 'pose' => 'thinking', 'duration' => 2200, 'badge' => null],
            'build.success' => ['emotion' => 'success', 'pose' => 'celebrate', 'duration' => 2400, 'badge' => '✓'],
            'build.error' => ['emotion' => 'error', 'pose' => 'inspect', 'duration' => 3400, 'badge' => null],
            'landing.visit' => ['emotion' => 'happy', 'pose' => 'hover', 'duration' => 5200, 'badge' => null, 'anchor' => 'logo'],
        ];
    }

    /**
     * @param array<mixed> $raw
     * @return array<string, array{emotion:string,pose:string,duration:int,badge:?string,anchor?:string}>
     */
    private static function sanitizeBindings(array $raw): array
    {
        $emotions = ['neutral', 'happy', 'sleep', 'think', 'love', 'angry', 'loading', 'error', 'success'];
        $poses = ['idle', 'hover', 'wave', 'look', 'thinking', 'inspect', 'sleep', 'celebrate'];
        $out = [];
        foreach ($raw as $event => $rule) {
            if (!is_string($event) || $event === '' || !is_array($rule)) {
                continue;
            }
            $event = preg_replace('/[^a-z0-9._\-]/i', '', $event) ?? '';
            if ($event === '' || strlen($event) > 64) {
                continue;
            }
            $emotion = (string) ($rule['emotion'] ?? 'neutral');
            $pose = (string) ($rule['pose'] ?? 'idle');
            if (!in_array($emotion, $emotions, true)) {
                $emotion = 'neutral';
            }
            if (!in_array($pose, $poses, true)) {
                $pose = 'idle';
            }
            $duration = (int) ($rule['duration'] ?? 2200);
            $duration = max(0, min(20000, $duration));
            $badge = $rule['badge'] ?? null;
            $badge = is_string($badge) && $badge !== '' ? mb_substr($badge, 0, 4) : null;
            $anchor = $rule['anchor'] ?? null;
            $item = [
                'emotion' => $emotion,
                'pose' => $pose,
                'duration' => $duration,
                'badge' => $badge,
            ];
            if (is_string($anchor) && in_array($anchor, ['corner', 'logo'], true)) {
                $item['anchor'] = $anchor;
            }
            $out[$event] = $item;
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private static function loadCharacterSettings(PlatformDatabaseInterface $db): array
    {
        $defaults = [
            'enabled' => 1,
            'show_on_landing' => 1,
            'show_on_admin_welcome' => 1,
            'show_on_module_ops' => 1,
            'bindings' => self::defaultBindings(),
            'cooldown_sec' => 45,
            'max_per_hour' => 8,
            'idle_minutes' => 4,
            'playful' => 1,
            'play_interval_sec' => 2,
        ];
        try {
            self::ensureSchema($db);
            $row = $db->one('SELECT * FROM jasefly_character_settings WHERE id=1');
        } catch (\Throwable) {
            return $defaults;
        }
        if (!$row) {
            return $defaults;
        }
        $bindings = self::defaultBindings();
        $raw = $row['bindings_json'] ?? null;
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && $decoded !== []) {
                $bindings = array_merge($bindings, self::sanitizeBindings($decoded));
            }
        }
        return [
            'enabled' => (int) ($row['enabled'] ?? 1),
            'show_on_landing' => (int) ($row['show_on_landing'] ?? 1),
            'show_on_admin_welcome' => (int) ($row['show_on_admin_welcome'] ?? 1),
            'show_on_module_ops' => (int) ($row['show_on_module_ops'] ?? 1),
            'bindings' => $bindings,
            'cooldown_sec' => (int) ($row['cooldown_sec'] ?? 45),
            'max_per_hour' => (int) ($row['max_per_hour'] ?? 8),
            'idle_minutes' => (int) ($row['idle_minutes'] ?? 4),
            'playful' => (int) ($row['playful'] ?? 1),
            'play_interval_sec' => (int) ($row['play_interval_sec'] ?? 2),
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
}
