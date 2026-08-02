<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\SoftRateLimitMiddleware;
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

        try {
            $this->migrateToFreeNeuralProvider($db);
        } catch (\Throwable) {
        }

        // After admin/MCP saves content — translate new phrases into cache.
        try {
            $events = Container::getInstance()->get(EventDispatcher::class);
            $events->subscribe('resource.afterSave', function (array $payload) use ($db): void {
                $this->onContentSaved($db, $payload);
            });
            $events->subscribe('page.afterPublish', function (array $payload) use ($db): void {
                // Soft nudge: mark cache not ready so warmup/status picks up new copy.
                $this->persistReadyState('', false);
            });
        } catch (\Throwable) {
        }
    }

    /**
     * Prefer free neural (Google) when DeepL has no key or old default was MyMemory.
     * Keeps DeepL if Auth Key is already saved.
     */
    private function migrateToFreeNeuralProvider(Database $db): void
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('translate');
            if (!$module) {
                return;
            }
            $state = $reg->state();
            $s = $state->getSettings($module);
            $provider = strtolower(trim((string) ($s['provider'] ?? 'google')));
            $deeplKey = trim((string) ($s['deepl_api_key'] ?? ''));
            $next = $provider;
            if ($provider === 'deepl' && $deeplKey === '') {
                $next = 'google';
            } elseif ($provider === 'mymemory') {
                $next = 'google';
            }
            if ($next === $provider) {
                return;
            }
            $s['provider'] = $next;
            $state->setSettings($module, $s);
        } catch (\Throwable) {
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function onContentSaved(Database $db, array $payload): void
    {
        try {
            $table = (string) ($payload['table'] ?? $payload['resource'] ?? '');
            if ($table === '' || !in_array($table, TranslateSync::CONTENT_TABLES, true)) {
                return;
            }
            $settings = $this->resolvedSettings();
            if (!(bool) ($settings['sync_on_save'] ?? true)) {
                return;
            }
            $data = $payload['data'] ?? null;
            if (!is_array($data) || $data === []) {
                return;
            }
            // Don't block forever — small batch of strings from this save.
            @set_time_limit(60);
            $sync = new TranslateSync($db, $settings);
            $result = $sync->syncPayload($data, 36);
            if (($result['fetched'] ?? 0) > 0 || ($result['failed'] ?? 0) > 0) {
                $this->persistReadyState('', false);
            }
        } catch (\Throwable) {
            // Never break content save because of translation.
        }
    }

    public function settingsSchema(): array
    {
        return [
            [
                'key' => '_heading',
                'label' => 'Оверлей-переводчик',
                'type' => 'heading',
                'help' => 'На сайте виджет читает только кэш (мгновенно). Реальный перевод делает прогрев / автосинк при сохранении. Фейковые записи (оригинал = «перевод») не сохраняются.',
            ],
            [
                'key' => 'widget_enabled',
                'label' => 'Показывать виджет на сайте',
                'type' => 'checkbox',
                'default' => true,
            ],
            [
                'key' => 'sync_on_save',
                'label' => 'Переводить новый контент при сохранении',
                'type' => 'checkbox',
                'default' => true,
                'help' => 'После сохранения страницы/статьи/навигации (админка или MCP) новые фразы сразу уходят в кэш для всех языков виджета.',
            ],
            [
                'key' => 'auto_warmup',
                'label' => 'Автопрогрев кэша (один раз, пока не готов)',
                'type' => 'checkbox',
                'default' => true,
                'help' => 'Фоном догоняет кэш, пока не станет ready. Не крутится заново без смены контента.',
            ],
            [
                'key' => 'geo_auto_lang',
                'label' => 'Авто-язык по стране посетителя',
                'type' => 'checkbox',
                'default' => true,
                'help' => 'Если пользователь ещё не выбирал язык: страна → язык виджета; если языка нет в списке — нейтральный English. Ручной выбор в виджете всегда важнее.',
            ],
            [
                'key' => 'content_hash',
                'label' => 'Хеш контента (служебное)',
                'type' => 'text',
                'default' => '',
                'help' => 'Служебное поле: обновляется при готовности кэша. Менять вручную не нужно.',
            ],
            [
                'key' => 'cache_ready',
                'label' => 'Кэш готов (служебное)',
                'type' => 'checkbox',
                'default' => false,
                'help' => 'Служебный флаг готовности. Сбрасывается при смене контента на следующем прогреве.',
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
                'help' => 'Меньше языков = быстрее прогрев. Для старта достаточно en; es/de/fr добавляйте после прогрева en.',
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
                'default' => 'google',
                'options' => [
                    ['value' => 'google', 'label' => 'Google Translate (бесплатно, нейросеть, без ключа)'],
                    ['value' => 'libretranslate', 'label' => 'LibreTranslate (публичные инстансы / свой URL)'],
                    ['value' => 'mymemory', 'label' => 'MyMemory (бесплатно, лимит символов/день)'],
                    ['value' => 'deepl', 'label' => 'DeepL (только если есть свой API key)'],
                ],
                'help' => 'Google gtx — бесплатно, качество среднее. Для нормального RU↔EN лучше DeepL (свой API key). Лоховый Libre больше не подмешивается в кэш при сбое Google.',
            ],
            [
                'key' => 'deepl_api_key',
                'label' => 'DeepL Auth Key (опционально)',
                'type' => 'password',
                'default' => '',
                'help' => 'Только если выбран движок DeepL. Ключ из DeepL API (Free/Pro), формат …:fx для Free.',
            ],
            [
                'key' => 'deepl_plan',
                'label' => 'DeepL план',
                'type' => 'select',
                'default' => 'free',
                'options' => [
                    ['value' => 'free', 'label' => 'Free (api-free.deepl.com)'],
                    ['value' => 'pro', 'label' => 'Pro (api.deepl.com)'],
                ],
            ],
            [
                'key' => 'deepl_api_url',
                'label' => 'DeepL API URL (опционально)',
                'type' => 'text',
                'default' => '',
                'help' => 'Оставьте пустым для стандартного Free/Pro. Или укажите свой endpoint …/v2/translate.',
            ],
            [
                'key' => 'api_url',
                'label' => 'LibreTranslate URL',
                'type' => 'text',
                'default' => '',
                'help' => 'Пусто = публичные инстансы. Или свой сервер, например https://translate.example.com — без /translate.',
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
        // Cache-only overlay: soft limit (HTTP 200) — hard 429 floods the browser console.
        $batchLimit = max(30, min(180, (int) ($settings['rate_limit'] ?? 60) * 2));
        $batchRate = new SoftRateLimitMiddleware($db, $batchLimit, 60);
        $protected = [
            new AuthMiddleware($app['jwt_secret']),
            new PermissionMiddleware(new PermissionService($db)),
        ];

        // Background worker: soft throttle (HTTP 200) so console stays clean.
        $autoRate = new SoftRateLimitMiddleware($db, 12, 60);

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
            // Neutral English always allowed for geo fallback / overlay.
            if ($target === '' || (!in_array($target, $allowed, true) && $target !== $source && $target !== 'en')) {
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
                if (count($texts) >= 200) {
                    break;
                }
            }
            if ($texts === []) {
                Response::json(['data' => ['translations' => [], 'cached' => 0, 'fetched' => 0, 'missing' => 0]]);
            }

            // Cache-first; optional soft live-fill for visitor-selected language (capped).
            $fillMisses = (bool) ($r->input('fill_misses') ?? false);
            $fillCap = $fillMisses ? 12 : 0;
            $svc = new TranslateService($settings, $db);
            $result = $svc->translateBatch($texts, $source, $target, true, $fillCap);
            Response::json(['data' => $result]);
        }, [$batchRate]);

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

            $checkOnly = (bool) ($r->input('check_only') ?? false);
            $status = $this->warmupStatus($db, $settings);
            $hash = (string) ($status['content_hash'] ?? '');
            $ready = (bool) ($status['ready'] ?? false);
            $storedHash = (string) ($settings['content_hash'] ?? '');
            $storedReady = (bool) ($settings['cache_ready'] ?? false);

            // Fully cached for current fingerprint and already marked — skip MT.
            if ($ready && $hash !== '' && $hash === $storedHash && $storedReady) {
                Response::json([
                    'data' => array_merge($status, [
                        'enabled' => true,
                        'finished' => true,
                        'translated' => 0,
                        'skipped' => true,
                    ]),
                ]);
            }

            // Content fully covered but fingerprint changed (or never marked) — just stamp ready.
            if ($ready && $hash !== '') {
                $this->persistReadyState($hash, true);
                Response::json([
                    'data' => array_merge($status, [
                        'enabled' => true,
                        'finished' => true,
                        'translated' => 0,
                        'skipped' => true,
                    ]),
                ]);
            }

            if ($checkOnly) {
                Response::json([
                    'data' => array_merge($status, [
                        'enabled' => true,
                        'finished' => false,
                        'translated' => 0,
                    ]),
                ]);
            }

            // Stale ready flag while content still has gaps.
            if ($storedReady && $hash !== $storedHash) {
                $this->persistReadyState($hash, false);
            }

            $batchSize = max(3, min(12, (int) ($r->input('batch_size') ?? 6)));
            $data = $this->runWarmupChunk($db, $settings, $batchSize, null);
            $data['enabled'] = true;
            $data['content_hash'] = $this->corpusFingerprint(
                (new TranslateCorpus($db))->collect(2500),
                $this->allowedTargets($settings)
            );
            if (!empty($data['ready'])) {
                $this->persistReadyState((string) $data['content_hash']);
            }
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
                    'sync_on_save' => (bool) ($settings['sync_on_save'] ?? true),
                    'invalid_hint' => 'Если перевод «как оригинал» — нажмите «Очистить фейки и прогреть».',
                ],
            ]);
        }, $protected);

        // Delete bogus cache rows (source === translated) then report status.
        $router->post($p('/admin/translate/purge-invalid'), function () use ($db) {
            $cache = new TranslateCache($db);
            $cache->ensureTable();
            $deleted = $cache->purgeInvalid();
            $this->persistReadyState('', false);
            $settings = $this->resolvedSettings();
            $status = $this->warmupStatus($db, $settings);
            Response::json([
                'data' => array_merge($status, [
                    'purged' => $deleted,
                    'message' => $deleted > 0
                        ? "Удалено фейковых записей: {$deleted}. Запустите прогрев."
                        : 'Фейковых записей не найдено.',
                ]),
            ]);
        }, $protected);

        // One chunk of warmup — FE loops until finished (avoids PHP timeout).
        $router->post($p('/admin/translate/warmup'), function (Request $r) use ($db) {
            @set_time_limit(120);
            $settings = $this->resolvedSettings();
            // Smaller batches = fewer MyMemory rate-limits.
            $batchSize = max(3, min(12, (int) ($r->input('batch_size') ?? 6)));
            $onlyTarget = strtolower(trim((string) ($r->input('target') ?? '')));
            if ($onlyTarget !== '') {
                $allowed = $this->allowedTargets($settings);
                if (!in_array($onlyTarget, $allowed, true)) {
                    Response::error('Unknown target', 422);
                }
            } else {
                $onlyTarget = null;
            }
            $purgeFirst = (bool) ($r->input('purge_invalid') ?? false);
            if ($purgeFirst) {
                (new TranslateCache($db))->purgeInvalid();
            }
            $data = $this->runWarmupChunk($db, $settings, $batchSize, $onlyTarget);
            $data['content_hash'] = $this->corpusFingerprint(
                (new TranslateCorpus($db))->collect(2500),
                $this->allowedTargets($settings)
            );
            if (!empty($data['ready'])) {
                $this->persistReadyState($data['content_hash']);
            } else {
                $this->persistReadyState('', false);
            }
            Response::json(['data' => $data]);
        }, $protected);
    }

    /**
     * @param array<string, mixed> $settings
     * @return array{ready: bool, content_hash: string, missing_total: int, missing: array<string, int>, corpus_size: int, cache: array<string, mixed>}
     */
    private function warmupStatus(Database $db, array $settings): array
    {
        $source = (string) ($settings['source_lang'] ?? 'ru');
        $targets = $this->allowedTargets($settings);
        $cache = new TranslateCache($db);
        $cache->ensureTable();
        $corpus = (new TranslateCorpus($db))->collect(2500);
        $hash = $this->corpusFingerprint($corpus, $targets);
        $missing = [];
        $missingTotal = 0;
        $ready = true;
        foreach ($targets as $t) {
            $m = $cache->missingCount($source, $t, $corpus);
            $missing[$t] = $m;
            $missingTotal += $m;
            if ($m > 0) {
                $ready = false;
            }
        }
        return [
            'ready' => $ready,
            'finished' => $ready,
            'content_hash' => $hash,
            'missing_total' => $missingTotal,
            'missing' => $missing,
            'corpus_size' => count($corpus),
            'cache' => $cache->stats(),
        ];
    }

    /**
     * @param list<string> $corpus
     * @param list<string> $targets
     */
    private function corpusFingerprint(array $corpus, array $targets): string
    {
        return hash('sha256', implode("\0", $corpus) . '|' . implode(',', $targets));
    }

    private function persistReadyState(string $contentHash, bool $ready = true): void
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('translate');
            if (!$module) {
                return;
            }
            $settings = $reg->state()->getSettings($module);
            $settings['content_hash'] = $contentHash;
            $settings['cache_ready'] = $ready;
            $reg->state()->setSettings($module, $settings);
        } catch (\Throwable) {
        }
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
        $failed = 0;
        $targetDone = null;
        $remainingForTarget = 0;

        foreach ($targets as $target) {
            if ($target === '' || $target === $source) {
                continue;
            }
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
            $result = $svc->translateBatch($miss, $source, $target, false);
            $translated = (int) ($result['fetched'] ?? 0);
            $failed = (int) ($result['failed'] ?? 0);
            $quotaHit = !empty($result['quota_hit']);
            $remainingForTarget = $cache->missingCount($source, $target, $corpus);
            // If everything failed this round, still advance reporting so FE can pause.
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
            'failed' => $failed,
            'quota_hit' => $quotaHit ?? false,
            'target' => $targetDone,
            'remaining_for_target' => $remainingForTarget,
            'corpus_size' => count($corpus),
            'missing' => $missing,
            'missing_total' => $missingTotal,
            'ready' => $ready,
            'cache' => $cache->stats(),
            'finished' => $ready,
            'provider_hint' => !empty($quotaHit)
                ? (
                    (($settings['provider'] ?? 'google') === 'mymemory')
                        ? 'MyMemory: дневная квота исчерпана. Переключите движок на Google в настройках плагина или подождите до завтра.'
                        : 'Провайдер временно ограничил запросы (rate limit). Подождите минуту и продолжите прогрев.'
                )
                : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publicConfig(): array
    {
        $s = $this->resolvedSettings();
        $source = (string) ($s['source_lang'] ?? 'ru');
        $targets = $this->allowedTargets($s);
        $geoOn = (bool) ($s['geo_auto_lang'] ?? true);
        $geo = $geoOn
            ? TranslateGeo::suggest($source, $targets, Request::fromGlobals())
            : ['country' => null, 'suggested_lang' => $source, 'via' => 'off'];

        return [
            'widget_enabled' => (bool) ($s['widget_enabled'] ?? true),
            'auto_warmup' => (bool) ($s['auto_warmup'] ?? true),
            'geo_auto_lang' => $geoOn,
            'source_lang' => $source,
            'languages' => $targets,
            'position' => (string) ($s['position'] ?? 'bottom-right'),
            'provider' => (string) ($s['provider'] ?? 'mymemory'),
            'cache_ready' => (bool) ($s['cache_ready'] ?? false),
            'content_hash' => (string) ($s['content_hash'] ?? ''),
            'mode' => 'cache',
            'visitor_country' => $geo['country'],
            'suggested_lang' => $geo['suggested_lang'],
            'geo_via' => $geo['via'],
        ];
    }

    /**
     * @param array<string, mixed> $settings
     * @return list<string>
     */
    private function allowedTargets(array $settings): array
    {
        $source = strtolower(trim((string) ($settings['source_lang'] ?? 'ru')));
        $raw = (string) ($settings['languages'] ?? 'en,de,fr,es');
        $parts = preg_split('/[\s,;]+/', strtolower($raw)) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = preg_replace('/[^a-z\-]/', '', $p) ?? '';
            // Same-lang pairs never translate (TranslateService no-ops) and stall admin warmup.
            if ($p !== '' && $p !== $source && strlen($p) <= 8 && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }
        if ($out !== []) {
            return $out;
        }
        foreach (['en', 'ru', 'de', 'fr', 'es'] as $fallback) {
            if ($fallback !== $source) {
                return [$fallback];
            }
        }
        return [];
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
