<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Core\PluginCatalogMeta;
use App\Request;
use App\Response;

/**
 * Serves demo admin operations from overlays / synthetic data.
 * Never reads or writes production CMS tables.
 */
final class DemoSandboxGateway
{
    public function __construct(
        private DemoSessionService $sessions,
        private DemoOverlayStore $store,
    ) {}

    public function handle(Request $r, DemoContext $ctx, string $mode): never
    {
        $path = DemoRoutePolicy::normalizePath($r->path);
        $method = strtoupper($r->method);

        if ($mode === DemoRoutePolicy::DENY) {
            $this->forbidden($ctx, $path);
        }

        try {
            if ($path === 'admin/demo/bootstrap' || $path === 'admin/demo') {
                $this->respond($this->bootstrap($ctx));
            }

            if (str_starts_with($path, 'admin/page-templates')) {
                if ($method === 'GET') {
                    $this->respond(['data' => [], 'meta' => $this->demoMeta()]);
                }
                // ensure / other — no-op success (never touches production templates)
                $this->respond([
                    'data' => ['created' => 0, 'filled' => 0, 'skipped' => 0, 'marked_seed' => 0],
                    'meta' => $this->demoMeta(),
                ]);
            }

            if (str_starts_with($path, 'admin/pages')) {
                $this->handlePages($r, $ctx, $path, $method);
            }

            if (str_starts_with($path, 'admin/media')) {
                $this->handleMedia($r, $ctx, $path, $method);
            }

            if (str_starts_with($path, 'admin/blog') || str_starts_with($path, 'admin/posts')) {
                $this->handleBlog($r, $ctx, $path, $method);
            }

            if (str_starts_with($path, 'admin/users')) {
                $this->respond(['data' => $this->syntheticUsers(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/modules')) {
                $this->respond(['data' => $this->syntheticModules(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/module-operations')) {
                $this->respond(['data' => [], 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/plugins')) {
                $this->respond(['data' => $this->syntheticPlugins($r), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/migrations')) {
                $this->respond(['data' => $this->syntheticMigrations(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/analytics')) {
                $this->respond(['data' => $this->syntheticAnalytics($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/comments')) {
                $this->respond(['data' => [], 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/support')) {
                $this->respond(['data' => $this->syntheticSupportPayload($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/translate')) {
                $this->respond(['data' => $this->syntheticTranslatePayload($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/scheduler')) {
                $this->respond(['data' => $this->syntheticSchedulerPayload($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/notifications')) {
                $this->respond(['data' => $this->syntheticNotificationsPayload($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/contact-messages') || $path === 'admin/messages') {
                $this->respond(['data' => [], 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/system')) {
                $this->respond(['data' => $this->syntheticDiagnostics($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/overload')) {
                $this->respond(['data' => $this->syntheticOverloadStatus(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/ddos')) {
                $this->respond(['data' => $this->syntheticDdosStatus($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/trash')) {
                // FE expects Record<resource, item[]> — empty object = empty trash UI
                $this->respond(['data' => new \stdClass(), 'meta' => $this->demoMeta()]);
            }

            if (preg_match('#^admin/(site-settings|theme|seo|footer|hero|contact-info|profile|email-settings|updates|backup|password)$#', $path)) {
                $this->respond(['data' => $this->syntheticSettings($path), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/access')) {
                $this->respond(['data' => $this->syntheticAccessBootstrap(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/roles') || str_starts_with($path, 'admin/permissions')) {
                $this->respond(['data' => $this->syntheticRoles(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/activity')) {
                $this->respond(['data' => $this->syntheticActivity(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/dashboard') || $path === 'admin' || str_starts_with($path, 'admin/search')) {
                $this->respond(['data' => $this->syntheticDashboard(), 'meta' => $this->demoMeta()]);
            }

            if (preg_match('#^admin/updates/?$#', $path) || str_starts_with($path, 'admin/updates/')) {
                // Status only — ZIP install remains DENY on non-GET
                $this->respond(['data' => $this->syntheticUpdatesStatus(), 'meta' => $this->demoMeta()]);
            }

            if (str_starts_with($path, 'admin/navigation')) {
                $this->respond(['data' => [], 'meta' => $this->demoMeta()]);
            }

            // Full demo admin: any remaining preview GET → empty/synthetic payload (never production).
            if ($mode === DemoRoutePolicy::PREVIEW && $method === 'GET') {
                $this->respond(['data' => $this->syntheticPreviewPayload($path), 'meta' => $this->demoMeta()]);
            }

            $this->forbidden($ctx, $path);
        } catch (\Throwable $e) {
            if ($e->getMessage() === 'demo_restricted') {
                $this->forbidden($ctx, $path);
            }
            Response::error('Demo sandbox error', 500, [], ['code' => 'demo_error']);
        }
    }

    /** @param array<string, mixed> $payload */
    private function respond(array $payload): never
    {
        Response::json(DemoResponseSanitizer::sanitize($payload));
    }

    private function forbidden(DemoContext $ctx, string $path): never
    {
        $this->sessions->audit($ctx->sessionId, 'deny', $path, []);
        Response::error('Demo restricted', 403, [], ['code' => 'demo_restricted']);
    }

    /** @return array<string, mixed> */
    private function bootstrap(DemoContext $ctx): array
    {
        $meta = $this->store->get($ctx->sessionId, 'meta', 'bootstrap') ?? [];
        return [
            'data' => [
                'is_demo' => true,
                'session_id' => $ctx->sessionId,
                'user' => $this->sessions->syntheticUser(),
                'capabilities' => DemoCapabilityPolicy::allowedCapabilities(),
                'home_page_id' => (int) ($meta['home_page_id'] ?? 900001),
                'nav_modes' => $meta['nav_modes'] ?? [],
                'notice' => $meta['notice'] ?? 'Demo data. Production secrets and destructive actions are unavailable.',
                'github' => 'https://github.com/iia3uk/jasefly',
            ],
            'meta' => $this->demoMeta(),
        ];
    }

    private function handlePages(Request $r, DemoContext $ctx, string $path, string $method): never
    {
        if ($method === 'GET' && preg_match('#^admin/pages/?$#', $path)) {
            $this->respond(['data' => $this->store->listByType($ctx->sessionId, 'page'), 'meta' => $this->demoMeta()]);
        }
        if ($method === 'POST' && preg_match('#^admin/pages/?$#', $path)) {
            $body = $r->all();
            unset($body['site_id'], $body['user_id'], $body['resource_owner_id']);
            $existing = $this->store->listByType($ctx->sessionId, 'page');
            $nextId = 900100;
            foreach ($existing as $row) {
                $nextId = max($nextId, ((int) ($row['id'] ?? 900100)) + 1);
            }
            if ($nextId > 909999) {
                $this->forbidden($ctx, $path);
            }
            $page = [
                'id' => $nextId,
                'title' => (string) ($body['title'] ?? 'New demo page'),
                'slug' => (string) ($body['slug'] ?? ('demo-page-' . $nextId)),
                'status' => (string) ($body['status'] ?? 'draft'),
                'template' => (string) ($body['template'] ?? 'builder'),
                'is_home' => 0,
                'seo_title' => (string) ($body['seo_title'] ?? ''),
                'seo_description' => (string) ($body['seo_description'] ?? ''),
                'layout' => is_array($body['layout'] ?? null) ? $body['layout'] : [
                    'version' => 1,
                    'meta' => ['demo' => true, 'useOnSite' => true],
                    'elements' => [],
                ],
            ];
            $this->store->put($ctx->sessionId, 'page', (string) $nextId, $page);
            $this->sessions->audit($ctx->sessionId, 'page.create', $path, ['id' => $nextId]);
            $this->respond(['data' => $page, 'meta' => $this->demoMeta()]);
        }
        if (preg_match('#^admin/pages/(\d+)$#', $path, $m)) {
            $id = $m[1];
            if (!$this->isDemoId((int) $id, 900000, 909999)) {
                $this->forbidden($ctx, $path);
            }
            if ($method === 'GET') {
                $row = $this->store->get($ctx->sessionId, 'page', $id);
                if (!$row) {
                    Response::error('Not found', 404, [], ['code' => 'demo_not_found']);
                }
                $this->respond(['data' => $row, 'meta' => $this->demoMeta()]);
            }
            if ($method === 'PUT' || $method === 'PATCH') {
                $existing = $this->store->get($ctx->sessionId, 'page', $id);
                if (!$existing) {
                    Response::error('Not found', 404, [], ['code' => 'demo_not_found']);
                }
                $body = $r->all();
                // Never accept production scope spoof
                unset($body['site_id'], $body['user_id'], $body['resource_owner_id']);
                if (isset($body['layout']) && is_array($body['layout'])) {
                    $existing['layout'] = $body['layout'];
                }
                if (isset($body['layout_json']) && is_string($body['layout_json'])) {
                    $decoded = json_decode($body['layout_json'], true);
                    if (is_array($decoded)) {
                        $existing['layout'] = $decoded;
                    }
                }
                foreach (['title', 'slug', 'status', 'seo_title', 'seo_description', 'template'] as $field) {
                    if (array_key_exists($field, $body)) {
                        $existing[$field] = $body[$field];
                    }
                }
                // Publish stays inside sandbox only
                if (($body['status'] ?? '') === 'published') {
                    $existing['status'] = 'published';
                }
                $this->store->put($ctx->sessionId, 'page', $id, $existing);
                $this->sessions->audit($ctx->sessionId, 'page.update', $path, ['id' => $id]);
                $this->respond(['data' => $existing, 'meta' => $this->demoMeta()]);
            }
        }
        $this->forbidden($ctx, $path);
    }

    private function handleMedia(Request $r, DemoContext $ctx, string $path, string $method): never
    {
        if ($method === 'GET' && preg_match('#^admin/media/?$#', $path)) {
            $this->respond(['data' => $this->store->listByType($ctx->sessionId, 'media'), 'meta' => $this->demoMeta()]);
        }
        if ($method === 'POST') {
            // Block dangerous uploads — no PHP/JS/ZIP
            $file = $r->file('file') ?? $r->file('media');
            if (!is_array($file)) {
                Response::error('Upload not available in demo (use seed media)', 403, [], ['code' => 'demo_restricted']);
            }
            $name = strtolower((string) ($file['name'] ?? ''));
            if (preg_match('/\.(php|phtml|phar|js|mjs|zip|tar|gz|sh|exe|bat)$/i', $name)) {
                Response::error('File type blocked in demo', 403, [], ['code' => 'demo_restricted']);
            }
            Response::error('Binary upload disabled in demo sandbox', 403, [], ['code' => 'demo_restricted']);
        }
        if (preg_match('#^admin/media/(\d+)$#', $path, $m)) {
            if (!$this->isDemoId((int) $m[1], 910000, 919999)) {
                $this->forbidden($ctx, $path);
            }
            if ($method === 'GET') {
                $row = $this->store->get($ctx->sessionId, 'media', $m[1]);
                if (!$row) {
                    Response::error('Not found', 404, [], ['code' => 'demo_not_found']);
                }
                $this->respond(['data' => $row, 'meta' => $this->demoMeta()]);
            }
        }
        $this->forbidden($ctx, $path);
    }

    private function handleBlog(Request $r, DemoContext $ctx, string $path, string $method): never
    {
        if ($method === 'GET' && preg_match('#^admin/(blog|posts)/?$#', $path)) {
            $this->respond(['data' => $this->store->listByType($ctx->sessionId, 'blog'), 'meta' => $this->demoMeta()]);
        }
        if (preg_match('#^admin/(blog|posts)/(\d+)$#', $path, $m)) {
            $id = $m[2];
            if (!$this->isDemoId((int) $id, 920000, 929999)) {
                $this->forbidden($ctx, $path);
            }
            if ($method === 'GET') {
                $row = $this->store->get($ctx->sessionId, 'blog', $id);
                if (!$row) {
                    Response::error('Not found', 404, [], ['code' => 'demo_not_found']);
                }
                $this->respond(['data' => $row, 'meta' => $this->demoMeta()]);
            }
            if ($method === 'PUT' || $method === 'PATCH') {
                $existing = $this->store->get($ctx->sessionId, 'blog', $id);
                if (!$existing) {
                    Response::error('Not found', 404, [], ['code' => 'demo_not_found']);
                }
                $body = $r->all();
                unset($body['site_id'], $body['user_id']);
                foreach (['title', 'slug', 'status', 'excerpt', 'content'] as $field) {
                    if (array_key_exists($field, $body)) {
                        $existing[$field] = $body[$field];
                    }
                }
                $this->store->put($ctx->sessionId, 'blog', $id, $existing);
                $this->respond(['data' => $existing, 'meta' => $this->demoMeta()]);
            }
        }
        $this->forbidden($ctx, $path);
    }

    private function isDemoId(int $id, int $min, int $max): bool
    {
        return $id >= $min && $id <= $max;
    }

    /** @return array<string, mixed> */
    private function demoMeta(): array
    {
        return [
            'api_version' => 'v1',
            'demo' => true,
            'notice' => 'Demo data. Production secrets and destructive actions are unavailable.',
        ];
    }

    /** @return list<array<string, mixed>> */
    private function syntheticUsers(): array
    {
        return [
            ['id' => 1, 'name' => 'Demo Admin', 'email' => 'redacted@demo.local', 'role' => 'admin'],
            ['id' => 2, 'name' => 'Demo Editor', 'email' => 'redacted@demo.local', 'role' => 'editor'],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function syntheticModules(): array
    {
        return [
            [
                'slug' => 'demo-kit',
                'name' => 'demo-kit',
                'label' => 'Demo Kit',
                'enabled' => true,
                'is_enabled' => true,
                'version' => '1.0.0',
                'status' => 'active',
            ],
            [
                'slug' => 'forms',
                'name' => 'forms',
                'label' => 'Forms',
                'enabled' => true,
                'is_enabled' => true,
                'version' => '1.0.0',
                'status' => 'active',
            ],
        ];
    }

    /**
     * Real catalog metadata (labels, descriptions, settings schema) — no production secrets,
     * toggles/saves disabled in demo.
     *
     * @return list<array<string, mixed>>
     */
    private function syntheticPlugins(Request $r): array
    {
        PluginCatalogMeta::setLocaleFromAcceptLanguage(
            (string) ($r->header('Accept-Language') ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'ru'))
        );
        try {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $catalog = $registry->catalog();
        } catch (\Throwable) {
            $catalog = [];
        }

        $en = PluginCatalogMeta::locale() === 'en';
        $block = $en
            ? 'Demo sandbox — plugin toggles and saves are unavailable.'
            : 'Demo sandbox — включение/выключение и сохранение настроек недоступны.';

        $out = [];
        foreach ($catalog as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = (string) ($row['name'] ?? '');
            if ($name === '' || $name === 'demo') {
                continue;
            }
            $schema = is_array($row['settings_schema'] ?? null) ? $row['settings_schema'] : [];
            $row['is_enabled'] = true;
            $row['enabled'] = true;
            $row['can_enable'] = false;
            $row['can_disable'] = false;
            $row['block_disable_reason'] = $block;
            $row['block_enable_reason'] = $block;
            $row['missing_requires'] = [];
            $row['settings'] = $this->emptySettingsFromSchema($schema);
            $row['demo'] = true;
            // Keep demo_pages for «О плагине», but seed action is blocked server-side.
            $out[] = $row;
        }

        // Fallback if registry unavailable (tests / broken boot)
        if ($out === []) {
            foreach (['system', 'users', 'site', 'media', 'blog', 'seo'] as $name) {
                $meta = PluginCatalogMeta::get($name);
                $out[] = [
                    'name' => $name,
                    'label' => PluginCatalogMeta::displayLabel($name, ucfirst($name)),
                    'description' => $meta['description'],
                    'long_description' => $meta['long_description'],
                    'category' => $meta['category'],
                    'category_label' => PluginCatalogMeta::categoryLabel($meta['category']),
                    'is_enabled' => true,
                    'can_enable' => false,
                    'can_disable' => false,
                    'block_disable_reason' => $block,
                    'settings' => [],
                    'settings_schema' => [],
                    'demo' => true,
                ];
            }
        }

        return $out;
    }

    /**
     * @param list<array<string, mixed>>|array<int, mixed> $schema
     * @return array<string, mixed>
     */
    private function emptySettingsFromSchema(array $schema): array
    {
        $out = [];
        foreach ($schema as $field) {
            if (!is_array($field)) {
                continue;
            }
            $key = (string) ($field['key'] ?? '');
            $type = (string) ($field['type'] ?? 'text');
            if ($key === '' || $type === 'heading') {
                continue;
            }
            if (array_key_exists('default', $field)) {
                $out[$key] = $field['default'];
                continue;
            }
            $out[$key] = match ($type) {
                'toggle', 'checkbox' => false,
                'number' => null,
                'select' => ($field['options'][0]['value'] ?? ''),
                default => '',
            };
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private function syntheticMigrations(): array
    {
        return [
            'ok' => true,
            'pending' => [],
            'applied' => [],
            'blocked' => false,
            'error' => null,
            'demo' => true,
            'notice' => 'Demo sandbox — production migrations are unreachable.',
        ];
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticAnalytics(string $path): array
    {
        if (str_contains($path, 'goals')) {
            return [];
        }
        $daily = [];
        for ($i = 13; $i >= 0; $i--) {
            $day = gmdate('Y-m-d', time() - ($i * 86400));
            $daily[] = [
                'date' => $day,
                'events' => 20 + ($i % 5) * 3,
                'visitors' => 8 + ($i % 4),
                'page_views' => 30 + ($i % 7) * 4,
                'sessions' => 10 + ($i % 3),
            ];
        }
        return [
            'range' => ['from' => $daily[0]['date'] ?? null, 'to' => $daily[count($daily) - 1]['date'] ?? null],
            'summary' => [
                'events' => 128,
                'visitors' => 42,
                'sessions' => 56,
                'page_views' => 210,
                'value_total' => 0,
            ],
            'daily' => $daily,
            'pages' => [
                ['path' => '/', 'views' => 90, 'visitors' => 28],
                ['path' => '/demo-about', 'views' => 36, 'visitors' => 14],
            ],
            'events' => [],
            'goals' => [],
            'demo' => true,
        ];
    }

    /**
     * Smart fallthrough for unknown admin GET paths.
     * Default unknown collections → [] (never settings blobs that break .map).
     *
     * @return array<string, mixed>|list<mixed>
     */
    private function syntheticPreviewPayload(string $path): array
    {
        $rest = preg_replace('#^admin/#', '', $path) ?? $path;
        $parts = array_values(array_filter(explode('/', $rest), static fn($p) => $p !== ''));
        $leaf = $parts[0] ?? '';
        $tail = $parts[1] ?? null;
        $tail2 = $parts[2] ?? null;

        // Nested status / stats / counts — always objects
        if ($tail === 'unread-count') {
            return ['count' => 0];
        }
        if ($tail === 'stats' || $tail === 'status' || $tail === 'overview' || $tail === 'summary') {
            return $this->syntheticGenericStatus($leaf);
        }
        if ($tail === 'last-error') {
            return ['message' => null, 'at' => null, 'demo' => true];
        }

        // Detail / nested: prefer empty object for :id (not [] — [] is truthy and breaks forms)
        if ($tail !== null && ctype_digit($tail)) {
            if ($tail2 === 'runs' || $tail2 === 'messages' || $tail2 === 'entries' || $tail2 === 'items') {
                return [];
            }
            return [
                'id' => (int) $tail,
                'title' => 'Demo item',
                'name' => 'Demo item',
                'status' => 'draft',
                'fields' => [],
                'items' => [],
                'demo' => true,
            ];
        }

        // Collection roots — always empty arrays (including portfolio blueprints)
        $listish = [
            'projects', 'products', 'services', 'orders', 'payments', 'users', 'roles',
            'webhooks', 'forms', 'form-submissions', 'comments', 'newsletter', 'notifications',
            'automations', 'scheduler', 'messages', 'contact-messages', 'social-links', 'lab',
            'support', 'redirects', 'statistics', 'experience', 'education', 'skills',
            'skill-categories', 'testimonials', 'subscribers', 'campaigns', 'jobs',
            'experiments', 'goals', 'providers',
        ];
        if ($tail === null || $tail === 'jobs' || $tail === 'list' || $tail === 'tickets'
            || $tail === 'subscribers' || $tail === 'campaigns' || $tail === 'experiments'
            || $tail === 'entries' || $tail === 'faq') {
            if ($tail === null && !in_array($leaf, $listish, true) && $leaf !== '') {
                // Unknown singleton-ish leaf → empty settings shell (safe fields)
                return [
                    'demo' => true,
                    'path' => $path,
                    'notice' => 'Demo data. Production settings are unreachable.',
                ];
            }
            return [];
        }

        return [];
    }

    /** @return array<string, mixed> */
    private function syntheticGenericStatus(string $leaf): array
    {
        return match ($leaf) {
            'scheduler' => [
                'by_status' => [],
                'by_queue' => [],
                'handlers' => [],
                'cron_stale' => false,
                'last_tick_at' => null,
                'demo' => true,
            ],
            'translate' => $this->syntheticTranslateStatus(),
            default => [
                'ok' => true,
                'demo' => true,
                'count' => 0,
                'total' => 0,
                'items' => [],
                'targets' => [],
                'providers' => [],
                'events' => [],
                'stats' => ['total' => 0, 'last_24h' => 0],
            ],
        };
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticTranslatePayload(string $path): array
    {
        if (str_contains($path, 'status') || preg_match('#^admin/translate/?$#', $path)) {
            return $this->syntheticTranslateStatus();
        }
        return [];
    }

    /** @return array<string, mixed> */
    private function syntheticTranslateStatus(): array
    {
        return [
            'source_lang' => 'ru',
            'targets' => ['en'],
            'corpus_size' => 0,
            'cache' => ['rows' => 0, 'by_target' => ['en' => 0]],
            'missing' => [],
            'ready' => true,
            'provider' => 'demo',
            'auto_warmup' => false,
            'sync_on_save' => false,
            'demo' => true,
        ];
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticSchedulerPayload(string $path): array
    {
        if (str_contains($path, 'stats') || str_contains($path, 'status')) {
            return $this->syntheticGenericStatus('scheduler');
        }
        return [];
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticNotificationsPayload(string $path): array
    {
        if (str_contains($path, 'unread-count')) {
            return ['count' => 0];
        }
        return [];
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticSupportPayload(string $path): array
    {
        if (preg_match('#^admin/support/tickets/(\d+)$#', $path, $m)) {
            return [
                'ticket' => [
                    'id' => (int) $m[1],
                    'status' => 'waiting_agent',
                    'subject' => 'Demo ticket',
                    'demo' => true,
                ],
                'messages' => [],
            ];
        }
        return [];
    }

    /** @return array<string, mixed> */
    private function syntheticDiagnostics(string $path = 'admin/system'): array
    {
        if (str_contains($path, 'last-error')) {
            return ['message' => null, 'at' => null, 'demo' => true];
        }
        return [
            'status' => 'ok',
            'demo' => true,
            'php_version' => PHP_VERSION,
            'message' => 'Synthetic diagnostics — no host paths or secrets.',
            'migrations_ok' => true,
            'last_error' => null,
            'mcp' => ['ok' => false, 'demo' => true],
            'module_load_failures' => [],
        ];
    }

    /** @return array<string, mixed> */
    private function syntheticSettings(string $path): array
    {
        $leaf = str_contains($path, '/') ? (explode('/', $path)[1] ?? $path) : preg_replace('#^admin/#', '', $path);
        $leaf = (string) $leaf;

        // Empty field shells so singleton forms render; secrets never from production.
        $byPath = [
            'site-settings' => [
                'site_name' => 'Jasefly Demo',
                'timezone' => 'UTC',
                'locale' => 'ru',
                'posts_per_page' => 10,
                'projects_per_page' => 12,
                'maintenance_title' => '',
                'maintenance_message' => '',
                'cookie_banner_enabled' => 1,
                'cookie_banner_text' => '',
                'cookie_policy_href' => '/privacy',
                'admin_base_path' => 'admin',
                'logo_media_id' => null,
            ],
            'seo' => [
                'site_title' => 'Jasefly Demo',
                'site_description' => '',
                'site_keywords' => '',
                'canonical_base_url' => '',
                'og_title' => '',
                'og_description' => '',
                'twitter_card' => 'summary_large_image',
                'twitter_handle' => '',
                'google_analytics_id' => '',
                'google_tag_manager_id' => '',
                'target_regions' => [],
                'custom_head_scripts' => '',
                'og_image_id' => null,
            ],
            'footer' => [
                'copyright_text' => '',
                'tagline' => '',
                'show_social' => true,
            ],
            'hero' => [
                'headline' => '',
                'subheadline' => '',
                'badge_text' => '',
                'primary_cta_label' => '',
                'primary_cta_href' => '',
                'secondary_cta_label' => '',
                'secondary_cta_href' => '',
                'animation_style' => '',
                'background_media_id' => null,
            ],
            'contact-info' => [
                'email' => '',
                'phone' => '',
                'address' => '',
                'city' => '',
                'country' => '',
                'map_embed' => '',
                'form_success_message' => '',
            ],
            'theme' => [
                'primary_color' => '',
                'font_heading' => '',
                'font_body' => '',
                'header_style' => '',
            ],
            'profile' => [
                'name' => 'Demo Explorer',
                'bio' => '',
                'title' => '',
            ],
            'email-settings' => [
                'from_name' => '',
                'from_email' => '',
                'to_email' => '',
                'smtp_host' => '',
                'smtp_port' => '',
                'smtp_username' => '',
                'smtp_password' => '',
            ],
            'password' => [
                'notice' => 'Demo sandbox — password / 2FA changes are unavailable.',
            ],
            'updates' => [
                'current_version' => 'demo',
                'latest' => null,
                'notice' => 'Demo sandbox — CMS updates are unavailable.',
            ],
            'backup' => [
                'items' => [],
                'notice' => 'Demo sandbox — backups are unavailable.',
            ],
            'ddos' => ['enabled' => false, 'notice' => 'Demo preview'],
            'overload' => ['enabled' => false, 'notice' => 'Demo preview'],
        ];

        $base = $byPath[$leaf] ?? [];
        return array_merge([
            'demo' => true,
            'path' => $path,
            'notice' => 'Demo data. Production settings are unreachable; saves are disabled.',
        ], $base);
    }

    /** @return array<string, mixed> */
    private function syntheticAccessBootstrap(): array
    {
        return [
            'capabilities' => DemoCapabilityPolicy::allowedCapabilities(),
            'roles' => [['slug' => 'demo_explorer', 'label' => 'Demo Explorer']],
            'is_super' => false,
            'is_demo' => true,
            'notice' => 'Demo data. Production secrets and destructive actions are unavailable.',
        ];
    }

    /** @return list<array<string, mixed>> */
    private function syntheticRoles(): array
    {
        return [
            [
                'id' => 1,
                'slug' => 'demo_explorer',
                'name' => 'Demo Explorer',
                'perm_count' => count(DemoCapabilityPolicy::ALLOWED),
            ],
            [
                'id' => 2,
                'slug' => 'admin',
                'name' => 'Admin',
                'perm_count' => 0,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function syntheticDashboard(): array
    {
        return [
            'stats' => [
                'pages' => 2,
                'posts' => 1,
                'media' => 2,
                'users' => 2,
            ],
            'counts' => [
                'pages' => 2,
                'posts' => 1,
                'media' => 2,
                'users' => 2,
                'projects' => 0,
                'messages' => 0,
            ],
            'messages' => [],
            'activity' => $this->syntheticActivity(),
            'unread_messages' => 0,
            'trash_total' => 0,
            'demo' => true,
            'notice' => 'Demo data. Production secrets and destructive actions are unavailable.',
        ];
    }

    /** @return list<array<string, mixed>> */
    private function syntheticActivity(): array
    {
        $now = time();
        return [
            [
                'id' => 900001,
                'action' => 'demo.session.start',
                'user_name' => 'Demo Explorer',
                'source' => 'admin',
                'entity_type' => 'demo',
                'entity_label' => 'Demo Sandbox',
                'metadata' => ['demo' => true],
                'created_at' => gmdate('Y-m-d H:i:s', $now - 120),
            ],
            [
                'id' => 900002,
                'action' => 'page.update',
                'user_name' => 'Demo Explorer',
                'source' => 'admin',
                'entity_type' => 'page',
                'entity_label' => 'Demo Home',
                'metadata' => ['demo' => true, 'changes' => ['title', 'layout']],
                'created_at' => gmdate('Y-m-d H:i:s', $now - 60),
            ],
            [
                'id' => 900003,
                'action' => 'demo.session.reset',
                'user_name' => 'Demo Explorer',
                'source' => 'admin',
                'entity_type' => 'demo',
                'entity_label' => 'Demo Sandbox',
                'metadata' => ['demo' => true],
                'created_at' => gmdate('Y-m-d H:i:s', $now - 30),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function syntheticUpdatesStatus(): array
    {
        return [
            'version' => 'demo',
            'zip_available' => false,
            'hosting_layout' => true,
            'max_zip_mb' => 0,
            'php_upload_max' => '—',
            'php_post_max' => '—',
            'last' => null,
            'demo' => true,
            'notice' => 'Demo sandbox — ZIP updates are unavailable.',
        ];
    }

    /** @return array<string, mixed> */
    private function syntheticOverloadStatus(): array
    {
        return [
            'available' => true,
            'platform' => 'Demo',
            'cpus' => 2,
            'normalize_by_cpu' => true,
            'require_sustained' => true,
            'load' => ['1' => 0.42, '5' => 0.38, '15' => 0.35],
            'load_per_core' => ['1' => 0.21, '5' => 0.19, '15' => 0.18],
            'threshold_1m' => 2.5,
            'threshold_5m' => 0,
            'threshold_1m_absolute' => 5.0,
            'threshold_5m_absolute' => 3.75,
            'mode' => 'log',
            'overloaded' => false,
            'quiet_until' => null,
            'tripped' => false,
            'last_trip_at' => null,
            'last_notify_at' => null,
            'retry_after' => 30,
            'error_message' => '',
            'stats' => ['total' => 0, 'last_24h' => 0, 'closed_24h' => 0],
            'events' => [],
            'hint' => 'Demo sandbox — synthetic load metrics. Production overload controls are unreachable.',
            'demo' => true,
        ];
    }

    /** @return array<string, mixed>|list<mixed> */
    private function syntheticDdosStatus(string $path): array
    {
        if (str_contains($path, 'providers') || str_contains($path, 'events')) {
            return [];
        }
        return [
            'protection_enabled' => false,
            'under_attack' => false,
            'under_attack_rpm' => 0,
            'normal_rpm' => 0,
            'challenge_enabled' => false,
            'providers' => [],
            'active_count' => 0,
            'demo' => true,
            'notice' => 'Demo sandbox — DDoS controls are unavailable.',
        ];
    }
}
