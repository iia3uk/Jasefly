<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * Public overlay translator + DB cache warmup (pre-translate site content).
 */
final class TranslateModule extends AbstractModule
{
    public function name(): string
    {
        return 'translate';
    }

    public function label(): string
    {
        return 'Переводчик сайта';
    }

    public function priority(): int
    {
        return 55;
    }

    public function boot(Database $db, array $app): void
    {
        try {
            (new TranslateCache($db))->ensureTable();
        } catch (\Throwable) {
        }
    }

    public function settingsSchema(): array
    {
        return [
            [
                'key' => '_heading',
                'label' => 'Оверлей-переводчик',
                'type' => 'heading',
                'help' => 'Виджет на сайте берёт переводы из кэша. При включённом автопрогреве сайт сам догоняет кэш в фоне, пока кто-то открывает страницы.',
            ],
            [
                'key' => 'widget_enabled',
                'label' => 'Показывать виджет на сайте',
                'type' => 'checkbox',
                'default' => true,
            ],
            [
                'key' => 'auto_warmup',
                'label' => 'Автопрогрев кэша (в фоне на сайте)',
                'type' => 'checkbox',
                'default' => true,
                'help' => 'Пока посетители или вы открываете сайт, сервер порциями переводит недостающие фразы. Ручной прогрев в меню «Переводчик» тоже доступен.',
            ],
            [
                'key' => 'source_lang',
                'label' => 'Исходный язык контента',
                'type' => 'select',
                'default' => 'ru',
                'options' => [
                    ['value' => 'ru', 'label' => 'Русский'],
                    ['value' => 'en', 'label' => 'English'],
                    ['value' => 'de', 'label' => 'Deutsch'],
                    ['value' => 'fr', 'label' => 'Français'],
                    ['value' => 'es', 'label' => 'Español'],
                ],
            ],
            [
                'key' => 'languages',
                'label' => 'Языки в виджете (коды через запятую)',
                'type' => 'text',
                'default' => 'en,de,fr,es',
                'help' => 'Чем меньше языков — тем быстрее прогрев. Рекомендуем 2–4.',
            ],
            [
                'key' => 'position',
                'label' => 'Позиция виджета',
                'type' => 'select',
                'default' => 'bottom-right',
                'options' => [
                    ['value' => 'bottom-right', 'label' => 'Справа снизу'],
                    ['value' => 'bottom-left', 'label' => 'Слева снизу'],
                    ['value' => 'top-right', 'label' => 'Справа сверху'],
                ],
            ],
            [
                'key' => 'provider',
                'label' => 'Движок перевода',
                'type' => 'select',
                'default' => 'mymemory',
                'options' => [
                    ['value' => 'mymemory', 'label' => 'MyMemory (бесплатно, без сервера)'],
                    ['value' => 'libretranslate', 'label' => 'LibreTranslate (свой URL)'],
                ],
            ],
            [
                'key' => 'api_url',
                'label' => 'LibreTranslate URL',
                'type' => 'text',
                'default' => '',
                'help' => 'Например https://translate.example.com — без /translate в конце.',
            ],
            [
                'key' => 'api_key',
                'label' => 'LibreTranslate API key (если нужен)',
                'type' => 'password',
                'default' => '',
            ],
            [
                'key' => 'mymemory_email',
                'label' => 'Email для MyMemory (опционально, выше лимит)',
                'type' => 'text',
                'default' => '',
            ],
            [
                'key' => 'rate_limit',
                'label' => 'Лимит запросов / мин (на IP, публичный API)',
                'type' => 'number',
                'default' => 60,
            ],
        ];
    }

    public function settings(): array
    {
        $out = [];
        foreach ($this->settingsSchema() as $f) {
            if (($f['type'] ?? '') === 'heading') {
                continue;
            }
            $out[$f['key']] = $f['default'] ?? '';
        }
        return $out;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Сайт',
                'path' => '/admin/translate',
                'label' => 'Переводчик',
                'permission' => 'settings.manage',
                'icon' => 'globe',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $settings = $this->resolvedSettings();
        $limit = max(5, min(180, (int) ($settings['rate_limit'] ?? 60)));
        $rate = new RateLimitMiddleware($db, $limit, 60);
        $protected = [
            new AuthMiddleware($app['jwt_secret']),
            new PermissionMiddleware(new PermissionService($db)),
        ];

        // Background worker: ~5 req/min/tab; headroom for retries / multi-tab.
        $autoRate = new RateLimitMiddleware($db, 20, 60);

        $router->post($p('/translate/batch'), function (Request $r) use ($db) {
            $settings = $this->resolvedSettings();
            if (!(bool) ($settings['widget_enabled'] ?? true)) {
                Response::error('Translate widget disabled', 403);
            }

            $source = strtolower(trim((string) ($r->input('source') ?? $settings['source_lang'] ?? 'ru')));
            $target = strtolower(trim((string) ($r->input('target') ?? '')));
            $raw = $r->input('texts');
            if (!is_array($raw)) {
                Response::error('texts must be an array', 422);
            }

            $allowed = $this->allowedTargets($settings);
            if ($target === '' || (!in_array($target, $allowed, true) && $target !== $source)) {
                Response::error('Unsupported target language', 422);
            }

            $texts = [];
            foreach ($raw as $item) {
                if (!is_string($item)) {
                    continue;
                }
                $t = trim($item);
                if ($t === '' || mb_strlen($t) > 2000) {
                    continue;
                }
                $texts[] = $t;
                if (count($texts) >= 80) {
                    break;
                }
            }
            if ($texts === []) {
                Response::json(['data' => ['translations' => [], 'cached' => 0, 'fetched' => 0]]);
            }

            $svc = new TranslateService($settings, $db);
            $result = $svc->translateBatch($texts, $source, $target);
            Response::json(['data' => $result]);
        }, [$rate]);

        // Background auto-warmup for visitors (no auth). Small batches + rate limit.
        $router->post($p('/translate/auto-warmup'), function (Request $r) use ($db) {
            @set_time_limit(90);
            $settings = $this->resolvedSettings();
            if (!(bool) ($settings['widget_enabled'] ?? true)) {
                Response::json(['data' => ['enabled' => false, 'finished' => true, 'translated' => 0]]);
            }
            if (!(bool) ($settings['auto_warmup'] ?? true)) {
                Response::json(['data' => ['enabled' => false, 'finished' => true, 'translated' => 0]]);
            }
            $batchSize = max(3, min(12, (int) ($r->input('batch_size') ?? 6)));
            $data = $this->runWarmupChunk($db, $settings, $batchSize, null);
            $data['enabled'] = true;
            Response::json(['data' => $data]);
        }, [$autoRate]);

        $router->get($p('/admin/translate/status'), function () use ($db) {
            $settings = $this->resolvedSettings();
            $source = (string) ($settings['source_lang'] ?? 'ru');
            $targets = $this->allowedTargets($settings);
            $cache = new TranslateCache($db);
            $cache->ensureTable();
            $corpus = (new TranslateCorpus($db))->collect(2500);
            $stats = $cache->stats();
            $missing = [];
            $ready = true;
            foreach ($targets as $t) {
                $m = $cache->missingCount($source, $t, $corpus);
                $missing[$t] = $m;
                if ($m > 0) {
                    $ready = false;
                }
            }
            Response::json([
                'data' => [
                    'source_lang' => $source,
                    'targets' => $targets,
                    'corpus_size' => count($corpus),
                    'cache' => $stats,
                    'missing' => $missing,
                    'ready' => $ready,
                    'provider' => $settings['provider'] ?? 'mymemory',
                    'auto_warmup' => (bool) ($settings['auto_warmup'] ?? true),
                ],
            ]);
        }, $protected);

        // One chunk of warmup — FE loops until finished (avoids PHP timeout).
        $router->post($p('/admin/translate/warmup'), function (Request $r) use ($db) {
            @set_time_limit(120);
            $settings = $this->resolvedSettings();
            $batchSize = max(5, min(40, (int) ($r->input('batch_size') ?? 15)));
            $onlyTarget = strtolower(trim((string) ($r->input('target') ?? '')));
            if ($onlyTarget !== '') {
                $allowed = $this->allowedTargets($settings);
                if (!in_array($onlyTarget, $allowed, true)) {
                    Response::error('Unknown target', 422);
                }
            } else {
                $onlyTarget = null;
            }
            Response::json(['data' => $this->runWarmupChunk($db, $settings, $batchSize, $onlyTarget)]);
        }, $protected);
    }

    /**
     * Translate up to $batchSize missing corpus strings for the next unfinished target.
     *
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    private function runWarmupChunk(Database $db, array $settings, int $batchSize, ?string $onlyTarget): array
    {
        $source = (string) ($settings['source_lang'] ?? 'ru');
        $targets = $this->allowedTargets($settings);
        if ($onlyTarget !== null) {
            $targets = [$onlyTarget];
        }

        $cache = new TranslateCache($db);
        $cache->ensureTable();
        $corpus = (new TranslateCorpus($db))->collect(2500);
        $svc = new TranslateService($settings, $db);

        $translated = 0;
        $targetDone = null;
        $remainingForTarget = 0;

        foreach ($targets as $target) {
            $cachedMap = $cache->getMany($source, $target, $corpus);
            $miss = [];
            foreach ($corpus as $text) {
                if (!isset($cachedMap[TranslateCache::hash($text)])) {
                    $miss[] = $text;
                    if (count($miss) >= $batchSize) {
                        break;
                    }
                }
            }
            if ($miss === []) {
                continue;
            }
            $targetDone = $target;
            $result = $svc->translateBatch($miss, $source, $target);
            $translated = (int) ($result['fetched'] ?? count($miss));
            $remainingForTarget = $cache->missingCount($source, $target, $corpus);
            break;
        }

        $missing = [];
        $ready = true;
        $missingTotal = 0;
        foreach ($this->allowedTargets($settings) as $t) {
            $m = $cache->missingCount($source, $t, $corpus);
            $missing[$t] = $m;
            $missingTotal += $m;
            if ($m > 0) {
                $ready = false;
            }
        }

        return [
            'translated' => $translated,
            'target' => $targetDone,
            'remaining_for_target' => $remainingForTarget,
            'corpus_size' => count($corpus),
            'missing' => $missing,
            'missing_total' => $missingTotal,
            'ready' => $ready,
            'cache' => $cache->stats(),
            'finished' => $ready,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publicConfig(): array
    {
        $s = $this->resolvedSettings();
        return [
            'widget_enabled' => (bool) ($s['widget_enabled'] ?? true),
            'auto_warmup' => (bool) ($s['auto_warmup'] ?? true),
            'source_lang' => (string) ($s['source_lang'] ?? 'ru'),
            'languages' => $this->allowedTargets($s),
            'position' => (string) ($s['position'] ?? 'bottom-right'),
            'provider' => (string) ($s['provider'] ?? 'mymemory'),
        ];
    }

    /**
     * @param array<string, mixed> $settings
     * @return list<string>
     */
    private function allowedTargets(array $settings): array
    {
        $raw = (string) ($settings['languages'] ?? 'en,de,fr,es');
        $parts = preg_split('/[\s,;]+/', strtolower($raw)) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = preg_replace('/[^a-z\-]/', '', $p) ?? '';
            if ($p !== '' && strlen($p) <= 8 && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }
        return $out ?: ['en'];
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('translate');
            if ($module) {
                return $reg->state()->getSettings($module);
            }
        } catch (\Throwable) {
        }
        return $this->settings();
    }
}
