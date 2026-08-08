<?php
declare(strict_types=1);

namespace App\Modules\System;

use App\Core\AbstractModule;
use App\Controllers\ActivityController;
use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Controllers\SearchController;
use App\Controllers\SystemController;
use App\Controllers\TrashController;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\BackupService;
use App\Services\MigrationService;
use App\Services\SiteUpdater;
use App\Support\DeployTelegramApprove;
use App\Services\AgentDiagnosticsService;
use App\Services\PageDigestService;
use App\Services\SchemaSnapshotService;
use App\Support\ContentPackImporter;
use App\Services\PermissionService;
use App\Services\SearchService;
use App\Services\SoftDeleteService;
use App\Services\SystemHealthService;
use App\Core\ModuleRegistry;
use App\Core\Container;
use App\Core\Services\PageSeedService;

/**
 * Core CMS platform: auth, trash, search, activity, health, shared admin CRUD glue.
 */
final class SystemModule extends AbstractModule
{
    public function name(): string
    {
        return 'system';
    }

    public function label(): string
    {
        return 'System';
    }

    public function priority(): int
    {
        return 10;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $auth = new AuthController($db, $app);
        $admin = new AdminController($db, $app);
        $trash = new TrashController($db, new SoftDeleteService($db), new ActivityLogService($db));
        $search = new SearchController(new SearchService($db));
        $perms = new PermissionService($db);
        $activity = new ActivityController(new ActivityLogService($db), $perms);
        $system = new SystemController(new SystemHealthService($db, $app), $perms);
        $rate = new RateLimitMiddleware($db);
        $loginRate = new RateLimitMiddleware($db, 5, 900, true);
        // OriginCheckMiddleware is global (public/index.php) — covers Content/Media/… too.
        $protected = [
            new AuthMiddleware($app['jwt_secret']),
            new PermissionMiddleware($perms),
        ];

        $router->get($p('/health'), fn() => Response::json(['data' => [
            'status' => 'ok',
            'time' => gmdate(DATE_ATOM),
            'api_version' => 'v1',
        ]]));

        // Telegram deploy-approve webhook (no Auth — secret_token + chat allowlist inside handler).
        // Path is outside /admin → OriginCheckMiddleware already skips CSRF.
        $router->post($p('/telegram/deploy-webhook'), function (Request $r) use ($db, $app) {
            $svc = new DeployTelegramApprove($app, $db);
            $result = $svc->handleWebhook($r);
            $status = !empty($result['ok']) || !empty($result['ignored']) ? 200 : 403;
            if (($result['error'] ?? '') === 'bad_secret') {
                $status = 401;
            }
            Response::json(['data' => $result], $status);
        });

        $router->get($p('/capabilities'), function () {
            $candidates = [
                dirname(__DIR__, 4) . '/contracts/capabilities/capabilities.v1.json', // monorepo
                dirname(__DIR__, 3) . '/contracts/capabilities/capabilities.v1.json', // hosting api/contracts
            ];
            $doc = ['baseline' => [], 'extended' => [], 'capabilities' => []];
            foreach ($candidates as $path) {
                if (is_file($path)) {
                    $parsed = json_decode((string) file_get_contents($path), true);
                    if (is_array($parsed)) {
                        $doc = $parsed;
                        break;
                    }
                }
            }
            $baseline = is_array($doc['baseline'] ?? null) ? $doc['baseline'] : [];
            $extended = is_array($doc['extended'] ?? null) ? $doc['extended'] : [];
            Response::json(['data' => [
                'runtime' => 'php-shared',
                'baseline' => $baseline,
                'extended' => $extended,
                // Shared runtime exposes baseline only (VPS extended caps unavailable)
                'available' => array_values(array_unique($baseline)),
            ]]);
        });

        $router->get($p('/docs'), fn() => Response::json(['data' => require dirname(__DIR__, 3) . '/docs/openapi.php']));

        // Legacy catalog endpoint (installed package manager owns GET /admin/modules).
        $router->get($p('/admin/module-catalog'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            Response::json(['data' => $registry->catalog()]);
        }, $protected);

        // Plugins management: list / toggle / configure.
        $router->get($p('/admin/plugins'), function (Request $r) {
            \App\Core\PluginCatalogMeta::setLocaleFromAcceptLanguage(
                (string) ($r->header('Accept-Language') ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'ru'))
            );
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            Response::json(['data' => $registry->catalog()]);
        }, $protected);

        $router->post($p('/admin/plugins/{name}/toggle'), function (Request $r, string $name) use ($db, $app) {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $module = $registry->get($name);
            if ($module === null) {
                Response::error('Plugin not found', 404);
            }
            $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
            $enabled = (bool) ($body['enabled'] ?? false);
            $autoDeps = (bool) ($body['auto_enable_deps'] ?? true);

            // Protect core modules from being disabled.
            if (in_array($name, ['system', 'users', 'module-manager'], true) && !$enabled) {
                Response::error('Ядро нельзя отключить', 422);
            }

            $packageRepo = new \App\Services\Modules\ModuleRegistryRepository($db);
            $mirror = new \App\Services\Modules\ModulePluginMirror($db);
            $isPackage = $mirror->isPackageBacked($packageRepo, $name);

            $enabledChain = [];
            if ($isPackage) {
                // ZIP modules: installed_modules.status is canonical; Plugins UI delegates.
                try {
                    $pkg = $this->packageLifecycleService($db, $app);
                    if ($enabled) {
                        $pkg->enable($name, isset($r->user['sub']) ? (int) $r->user['sub'] : null);
                        $enabledChain = [$name];
                    } else {
                        $requiredBy = $registry->requiredByEnabled($name);
                        if ($requiredBy !== []) {
                            Response::error(
                                'Сначала отключите зависимые плагины: ' . implode(', ', $requiredBy),
                                422,
                                [],
                                ['required_by' => $requiredBy],
                            );
                        }
                        $pkg->disable($name, isset($r->user['sub']) ? (int) $r->user['sub'] : null);
                    }
                } catch (\Throwable $e) {
                    Response::error($e->getMessage(), 422);
                }
            } elseif ($enabled) {
                $missing = $registry->missingRequires($name);
                if ($missing !== [] && !$autoDeps) {
                    Response::error(
                        'Сначала включите зависимости: ' . implode(', ', $missing),
                        422,
                        [],
                        ['missing_requires' => $missing],
                    );
                }
                try {
                    $enabledChain = $registry->enableWithDependencies($name);
                } catch (\Throwable $e) {
                    Response::error($e->getMessage(), 422);
                }
            } else {
                $requiredBy = $registry->requiredByEnabled($name);
                if ($requiredBy !== []) {
                    Response::error(
                        'Сначала отключите зависимые плагины: ' . implode(', ', $requiredBy),
                        422,
                        [],
                        ['required_by' => $requiredBy],
                    );
                }
                $registry->state()->setEnabled($name, false);
            }

            $seed = null;
            if ($enabled && !$isPackage) {
                // WordPress-style: create the plugin's demo/default pages on
                // activation. Strictly additive & idempotent — existing pages
                // are never touched. Package modules seed via their own lifecycle.
                $seed = (new \App\Core\Services\PageSeedService(
                    Container::getInstance()->get('db')
                ))->seedModule($module);
                $registry->events()->dispatch('plugin.enabled', [
                    'module' => $name,
                    'pages' => $seed,
                    'enabled_chain' => $enabledChain,
                ]);
            } elseif ($enabled && $isPackage) {
                $registry->events()->dispatch('plugin.enabled', [
                    'module' => $name,
                    'pages' => null,
                    'enabled_chain' => $enabledChain,
                ]);
            } else {
                $registry->events()->dispatch('plugin.disabled', ['module' => $name]);
            }
            Response::json([
                'success' => true,
                'data' => [
                    'name' => $name,
                    'is_enabled' => $enabled,
                    'seed' => $seed,
                    'enabled_chain' => $enabledChain,
                ],
            ]);
        }, $protected);

        // Re-seed a plugin's demo pages on demand (idempotent — only missing slugs).
        $router->post($p('/admin/plugins/{name}/seed-pages'), function (Request $r, string $name) {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $module = $registry->get($name);
            if ($module === null) {
                Response::error('Plugin not found', 404);
            }
            $seed = (new \App\Core\Services\PageSeedService(
                Container::getInstance()->get('db')
            ))->seedModule($module);
            Response::json(['success' => true, 'data' => $seed]);
        }, $protected);

        $router->put($p('/admin/plugins/{name}/settings'), function (Request $r, string $name) {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $module = $registry->get($name);
            if ($module === null) {
                Response::error('Plugin not found', 404);
            }
            $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
            $registry->state()->setSettings($module, is_array($body['settings'] ?? null) ? $body['settings'] : []);
            Response::json(['success' => true, 'data' => [
                'name' => $name,
                'settings' => $registry->state()->getPublicSettings($module),
            ]]);
        }, $protected);

        // Plugin kernel: aggregated blueprints / blocks / public routes / events
        $router->get($p('/admin/blueprints'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $out = [];
            foreach ($registry->blueprints() as $bp) {
                $out[] = $bp->toArray();
            }
            Response::json(['data' => $out]);
        }, $protected);
        $router->get($p('/admin/blueprints/{key}'), function (Request $r, string $key) {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $bp = $registry->blueprint($key);
            if (!$bp) {
                Response::error('Blueprint not found', 404);
            }
            Response::json(['data' => $bp->toArray()]);
        }, $protected);
        $router->get($p('/admin/blocks'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            Response::json(['data' => $registry->blocks()]);
        }, $protected);
        $router->get($p('/admin/public-routes'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            Response::json(['data' => $registry->publicRoutes()]);
        }, $protected);
        $router->get($p('/admin/events'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            Response::json(['data' => $registry->events()->events()]);
        }, $protected);

        $router->get($p('/admin/dashboard'), [$admin, 'dashboard'], $protected);
        $router->get($p('/admin/search'), [$search, 'global'], $protected);
        $router->get($p('/admin/activity'), [$activity, 'index'], $protected);
        $router->get($p('/admin/system/status'), [$system, 'status'], $protected);
        $router->get($p('/admin/system/last-error'), function () {
            $report = \App\Services\ErrorReportService::last();
            Response::json([
                'data' => $report,
                'message' => $report
                    ? 'Последняя ошибка API'
                    : 'Пока нет записанных ошибок (storage/logs/last-error.json пуст)',
            ]);
        }, $protected);
        $router->post($p('/admin/system/last-error/clear'), function () {
            $ok = \App\Services\ErrorReportService::clear();
            Response::json([
                'success' => true,
                'data' => ['cleared' => $ok],
                'message' => $ok ? 'Лог ошибки очищен' : 'Не удалось удалить файл лога',
            ]);
        }, $protected);
        $router->get($p('/admin/migrations'), function () use ($db, $app) {
            $svc = new MigrationService(
                $db,
                dirname(__DIR__, 3) . '/migrations',
                (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage'),
                dirname(__DIR__, 3) . '/src/Modules'
            );
            $status = $svc->status(true);

            // Blueprint-driven auto-migrations: diff declared blueprints vs DB
            // and apply missing columns/indexes (additive only — safe on every load).
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $bpSvc = new \App\Core\Services\BlueprintMigrationService($db, $db->dialect(), $db->inspector());
            $bpResults = $bpSvc->migrateAll(array_values($registry->blueprints()));
            $status['blueprints'] = $bpResults;
            $status['ok'] = $status['ok'] && array_reduce($bpResults, static fn(bool $c, $r) => $c && $r['error'] === null, true);

            Response::json(['data' => $status]);
        }, $protected);
        $router->post($p('/admin/migrations/retry'), function () use ($db, $app) {
            $svc = new MigrationService(
                $db,
                dirname(__DIR__, 3) . '/migrations',
                (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage'),
                dirname(__DIR__, 3) . '/src/Modules'
            );
            Response::json(['data' => $svc->retry()]);
        }, $protected);

        // Blueprint-driven auto-migrations: diff declared blueprints vs live DB.
        $router->post($p('/admin/migrations/blueprints'), function () {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $db = Container::getInstance()->get('db');
            $svc = new \App\Core\Services\BlueprintMigrationService(
                $db,
                $db->dialect(),
                $db->inspector()
            );
            $blueprints = array_values($registry->blueprints());
            $result = $svc->migrateAll($blueprints);
            $registry->events()->dispatch('migration.after', ['blueprints' => $result]);
            Response::json(['data' => $result]);
        }, $protected);

        // Content pack apply via authenticated API (for MCP / remote agents)
        $router->post($p('/admin/content-pack/apply'), function (Request $r) use ($db, $app) {
            $body = $r->all();
            $pack = $body['pack'] ?? $body;
            if (!is_array($pack) || !isset($pack['version'])) {
                Response::error('Ожидается content pack: { version, mode?, singletons?, … } или { pack: {…} }', 422);
            }
            $mode = (string) ($pack['mode'] ?? $body['mode'] ?? 'replace_content');
            $pack['mode'] = $mode;
            if ($mode === 'replace_content' && empty($body['confirm_replace'])) {
                Response::error(
                    'Замена всего контента требует confirm_replace: true. Медиафайлы на диске не удаляются; записи в БД контента — да.',
                    422
                );
            }
            try {
                $importer = new ContentPackImporter($db->pdo());
                $report = $importer->import($pack);
                try {
                    (new ActivityLogService($db))->log(
                        $r,
                        'content_pack.apply',
                        'cms',
                        null,
                        $mode,
                        ['report' => $report]
                    );
                } catch (\Throwable) {
                }
                Response::json([
                    'data' => [
                        'ok' => true,
                        'mode' => $mode,
                        'report' => $report,
                    ],
                    'message' => 'Content pack применён',
                ]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->get($p('/admin/content-pack/info'), function () use ($app) {
            Response::json([
                'data' => [
                    'version' => 1,
                    'modes' => ['replace_content'],
                    'auth' => [
                        'jwt' => 'POST /auth/login → Bearer access_token',
                        'mcp_token' => 'config.local.php mcp_api_token → Authorization: Bearer <token>',
                        'mcp_token_configured' => ((string) ($app['mcp_api_token'] ?? '')) !== '',
                    ],
                    'endpoint' => 'POST /admin/content-pack/apply',
                    'note' => 'replace_content требует confirm_replace: true',
                ],
            ]);
        }, $protected);

        // MCP-agent-only diagnostics (logs for the neural net — not for browser admin JWT)
        $router->get($p('/admin/mcp/diagnostics'), function (Request $r) use ($db, $app) {
            AgentDiagnosticsService::requireMcpAgent($r);
            $svc = new AgentDiagnosticsService($db, $app);
            Response::json(['data' => $svc->snapshot()]);
        }, $protected);
        $router->get($p('/admin/mcp/last-error'), function (Request $r) {
            AgentDiagnosticsService::requireMcpAgent($r);
            $report = \App\Services\ErrorReportService::last();
            Response::json([
                'data' => $report,
                'broken' => $report !== null,
                'message' => $report ? 'Есть last-error' : 'last-error пуст',
            ]);
        }, $protected);

        // Page digests for MCP agent (short map of every page / styles / widgets)
        $router->get($p('/admin/mcp/site-map'), function (Request $r) use ($db) {
            AgentDiagnosticsService::requireMcpAgent($r);
            Response::json(['data' => (new PageDigestService($db))->siteMap()]);
        }, $protected);
        $router->get($p('/admin/mcp/pages-digest'), function (Request $r) use ($db) {
            AgentDiagnosticsService::requireMcpAgent($r);
            Response::json(['data' => (new PageDigestService($db))->all()]);
        }, $protected);
        $router->get($p('/admin/mcp/pages-digest/{idOrSlug}'), function (Request $r, string $idOrSlug) use ($db) {
            AgentDiagnosticsService::requireMcpAgent($r);
            $one = (new PageDigestService($db))->one($idOrSlug);
            if (!$one) {
                Response::error('Страница не найдена', 404);
            }
            Response::json(['data' => $one]);
        }, $protected);

        // MCP agent: live DB schema snapshot (tables created? columns?)
        $router->get($p('/admin/mcp/schema'), function (Request $r) use ($db) {
            AgentDiagnosticsService::requireMcpAgent($r);
            $table = (string) $r->query('table', '');
            $countsRaw = (string) $r->query('counts', '0');
            $detail = (string) $r->query('detail', 'names');
            $counts = in_array(strtolower($countsRaw), ['1', 'true', 'yes'], true);
            Response::json([
                'data' => (new SchemaSnapshotService($db))->snapshot([
                    'table' => $table,
                    'counts' => $counts,
                    'detail' => $detail,
                ]),
            ]);
        }, $protected);

        // MCP agent: record release changelog (gate step before deploy)
        $router->post($p('/admin/mcp/changelog'), function (Request $r) use ($db) {
            AgentDiagnosticsService::requireMcpAgent($r);
            $summary = trim((string) ($r->input('summary') ?? ''));
            if ($summary === '' || mb_strlen($summary) < 8) {
                Response::error('summary обязателен (минимум 8 символов) — что изменилось в этом апдейте.', 422);
            }
            $changes = $r->input('changes');
            if (!is_array($changes)) {
                $changes = [];
            }
            $changes = array_values(array_filter(array_map(
                static fn ($x) => trim((string) $x),
                $changes
            ), static fn ($x) => $x !== ''));
            $body = trim((string) ($r->input('body') ?? ''));
            $package = trim((string) ($r->input('package') ?? ''));
            $zipSha = trim((string) ($r->input('zip_sha256') ?? ''));

            (new ActivityLogService($db))->log(
                $r,
                'mcp_changelog',
                'cms',
                null,
                $summary,
                [
                    'summary' => $summary,
                    'changes' => $changes,
                    'body' => $body !== '' ? $body : null,
                    'package' => $package !== '' ? $package : null,
                    'zip_sha256' => $zipSha !== '' ? $zipSha : null,
                ]
            );

            Response::json([
                'data' => [
                    'ok' => true,
                    'summary' => $summary,
                    'changes_count' => count($changes),
                ],
                'message' => 'Changelog записан в журнал MCP',
            ], 201);
        }, $protected);

        // Page revisions: list / snapshot / restore.
        $router->get($p('/admin/pages/{id}/revisions'), function (Request $r, string $id) use ($db) {
            $svc = new \App\Services\PageRevisionService($db);
            Response::json(['data' => $svc->list((int) $id)]);
        }, $protected);
        $router->post($p('/admin/pages/{id}/revisions'), function (Request $r, string $id) use ($db) {
            (new PermissionService($db))->requireContentMutation($r->user ?? [], 'update');
            $svc = new \App\Services\PageRevisionService($db);
            $note = $r->input('note');
            $revId = $svc->snapshot((int) $id, $r->user['id'] ?? null, is_string($note) ? $note : null);
            Response::json(['data' => ['id' => $revId]], 201);
        }, $protected);
        $router->get($p('/admin/pages/revisions/{revisionId}'), function (Request $r, string $revisionId) use ($db) {
            $svc = new \App\Services\PageRevisionService($db);
            $rev = $svc->get((int) $revisionId);
            if (!$rev) {
                Response::error('Revision not found', 404);
            }
            Response::json(['data' => $rev]);
        }, $protected);
        $router->post($p('/admin/pages/revisions/{revisionId}/restore'), function (Request $r, string $revisionId) use ($db) {
            (new PermissionService($db))->requireContentMutation($r->user ?? [], 'update');
            $svc = new \App\Services\PageRevisionService($db);
            $restored = $svc->restore((int) $revisionId);
            if (!$restored) {
                Response::error('Revision not found', 404);
            }
            Response::json(['data' => $restored]);
        }, $protected);

        $router->post($p('/auth/login'), [$auth, 'login'], [$loginRate]);
        $router->post($p('/auth/2fa/verify'), [$auth, 'verify2fa'], [$loginRate]);
        $router->post($p('/auth/refresh'), [$auth, 'refresh']);
        $router->post($p('/auth/logout'), [$auth, 'logout']);
        $router->get($p('/auth/me'), [$auth, 'me'], $protected);
        $router->post($p('/auth/2fa/setup'), [$auth, 'setup2fa'], $protected);
        $router->post($p('/auth/2fa/enable'), [$auth, 'enable2fa'], $protected);
        $router->post($p('/auth/2fa/disable'), [$auth, 'disable2fa'], $protected);

        $router->get($p('/admin/trash'), [$trash, 'index'], $protected);
        $router->post($p('/admin/trash/{resource}/{id}/restore'), fn(Request $r, $resource, $id) => $trash->restore($r, $resource, $id), $protected);
        $router->delete($p('/admin/trash/{resource}/{id}'), fn(Request $r, $resource, $id) => $trash->forceDelete($r, $resource, $id), $protected);
        $router->post($p('/admin/trash/{resource}/empty'), fn(Request $r, $resource) => $trash->emptyTrash($r, $resource), $protected);
        $router->post($p('/admin/trash/empty-all'), [$trash, 'emptyAll'], $protected);

        $router->put($p('/admin/users/password'), [$admin, 'password'], $protected);
        $router->post($p('/admin/backup'), function (Request $r) use ($db, $app) {
            Response::json(['data' => ['file' => (new BackupService($db, $app))->create()]], 201);
        }, $protected);

        // In-panel CMS update (upload hosting update ZIP → unpack → migrate)
        // When TELEGRAM_DEPLOY_APPROVE=1 → stage + Telegram Approve (or admin escape hatch).
        $router->get($p('/admin/updates'), function () use ($db, $app) {
            $updater = new SiteUpdater($app, $db);
            $data = $updater->status();
            $tg = new DeployTelegramApprove($app, $db);
            $data['telegram_deploy_approve'] = $tg->statusPublic();
            Response::json(['data' => $data]);
        }, $protected);
        $router->post($p('/admin/updates'), function (Request $r) use ($db, $app) {
            $file = $r->file('package') ?? $r->file('file');
            if (!$file) {
                Response::error('Прикрепите ZIP как поле package', 422);
            }
            $via = (($r->user['auth'] ?? '') === 'mcp_token') ? 'mcp' : 'admin';
            try {
                if (DeployTelegramApprove::enabled($app)) {
                    $tg = new DeployTelegramApprove($app, $db);
                    $result = $tg->stageUpload($file, $via);
                    try {
                        (new ActivityLogService($db))->log(
                            $r,
                            'system.update.pending',
                            'cms',
                            null,
                            $result['package'] ?? null,
                            [
                                'deploy_id' => $result['deploy_id'] ?? null,
                                'package' => $result['package'] ?? null,
                                'via' => $via,
                                'pending_approval' => true,
                            ]
                        );
                    } catch (\Throwable) {
                        // non-fatal
                    }
                    Response::json(['data' => $result, 'message' => $result['message'] ?? 'OK']);
                }

                $updater = new SiteUpdater($app, $db);
                $result = $updater->applyUpload($file);
                try {
                    (new ActivityLogService($db))->log(
                        $r,
                        'system.update',
                        'cms',
                        null,
                        $result['package'] ?? null,
                        [
                            'files_copied' => $result['files_copied'] ?? 0,
                            'package' => $result['package'] ?? null,
                            'via' => $via,
                        ]
                    );
                } catch (\Throwable) {
                    // non-fatal
                }
                Response::json(['data' => $result, 'message' => $result['message'] ?? 'OK']);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);
        $router->post($p('/admin/updates/pending/{id}/approve'), function (Request $r, string $id) use ($db, $app) {
            try {
                $tg = new DeployTelegramApprove($app, $db);
                $result = $tg->approve($id, 'admin');
                try {
                    (new ActivityLogService($db))->log(
                        $r,
                        'system.update',
                        'cms',
                        null,
                        $result['package'] ?? null,
                        [
                            'files_copied' => $result['files_copied'] ?? 0,
                            'package' => $result['package'] ?? null,
                            'deploy_id' => $id,
                            'via' => 'admin_escape',
                        ]
                    );
                } catch (\Throwable) {
                }
                Response::json(['data' => $result, 'message' => $result['message'] ?? 'OK']);
            } catch (\Throwable $e) {
                $code = (int) $e->getCode();
                Response::error($e->getMessage(), $code >= 400 && $code < 600 ? $code : 422);
            }
        }, $protected);
        $router->post($p('/admin/updates/pending/{id}/reject'), function (Request $r, string $id) use ($db, $app) {
            try {
                $tg = new DeployTelegramApprove($app, $db);
                $result = $tg->reject($id, 'admin');
                Response::json(['data' => $result, 'message' => $result['message'] ?? 'OK']);
            } catch (\Throwable $e) {
                $code = (int) $e->getCode();
                Response::error($e->getMessage(), $code >= 400 && $code < 600 ? $code : 422);
            }
        }, $protected);

        // Singleton settings owned by Settings module but CRUD glue stays available
        foreach (['profile', 'contact-info', 'footer', 'hero', 'seo', 'site-settings', 'theme', 'email-settings'] as $singleton) {
            $router->get($p("/admin/$singleton"), fn(Request $r) => $admin->singletonGet($r, $singleton), $protected);
            $router->put($p("/admin/$singleton"), fn(Request $r) => $admin->singleton($r, $singleton), $protected);
        }

        $router->get($p('/admin/contact-messages'), [$admin, 'messages'], $protected);
        $router->delete($p('/admin/contact-messages/{id}'), [$admin, 'deleteMessage'], $protected);
        $router->post($p('/admin/contact-messages/{id}/mark-read'), [$admin, 'readMessage'], $protected);

        // Каталог системных шаблонов (логин, 404, about, contact, …)
        $router->get($p('/admin/page-templates'), function () use ($db) {
            $rows = $db->all('SELECT id, slug, title, status, layout_json, template, is_home FROM pages');
            $bySlug = [];
            foreach ($rows as $row) {
                $bySlug[(string) $row['slug']] = $row;
            }
            $enabledPlugins = SystemTemplates::enabledPluginMap();
            $items = [];
            foreach (SystemTemplates::catalog() as $t) {
                $plugin = $t['plugin'] ?? null;
                if (is_string($plugin) && $plugin !== '' && !SystemTemplates::pluginActive($plugin, $enabledPlugins)) {
                    continue;
                }
                $row = $bySlug[$t['slug']] ?? null;
                $raw = $row ? trim((string) ($row['layout_json'] ?? '')) : '';
                $hasLayout = $raw !== '' && $raw !== 'null' && $raw !== '{"version":1,"elements":[]}';
                $isSeed = false;
                $useOnSite = false;
                if ($hasLayout) {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded)) {
                        $meta = is_array($decoded['meta'] ?? null) ? $decoded['meta'] : [];
                        $isSeed = !empty($meta['seed']);
                        $useOnSite = !empty($meta['useOnSite']);
                    }
                }
                $items[] = [
                    'slug' => $t['slug'],
                    'title' => $t['title'],
                    'group' => $t['group'],
                    'route' => $t['route'],
                    'description' => $t['description'],
                    'plugin' => $plugin,
                    'page_id' => $row ? (int) $row['id'] : null,
                    'status' => $row['status'] ?? null,
                    'has_layout' => (bool) $hasLayout,
                    'is_seed' => $isSeed,
                    'use_on_site' => $useOnSite,
                    'exists' => $row !== null,
                ];
            }
            Response::json(['data' => $items]);
        }, $protected);

        $router->post($p('/admin/page-templates/ensure'), function () use ($db) {
            // Only seed templates owned by currently enabled plugins (core templates always).
            $stats = (new PageSeedService($db))->ensureEntries(SystemTemplates::demoPagesForEnabled());
            Response::json(['success' => true, 'data' => $stats]);
        }, $protected);

        // Копировать layout (стиль/структуру) с одной страницы на другую
        $router->post($p('/admin/pages/{id}/copy-layout'), function (Request $r, string $id) use ($db) {
            (new PermissionService($db))->requireContentMutation($r->user ?? [], 'update');
            $targetId = (int) $id;
            $sourceId = (int) ($r->input('source_id') ?? 0);
            if ($targetId < 1 || $sourceId < 1) {
                Response::error('source_id обязателен', 422);
            }
            if ($targetId === $sourceId) {
                Response::error('Нельзя копировать страницу в саму себя', 422);
            }
            $source = $db->one('SELECT id, layout_json, title FROM pages WHERE id=?', [$sourceId]);
            $target = $db->one('SELECT id, title, slug, is_home FROM pages WHERE id=?', [$targetId]);
            if (!$source || !$target) {
                Response::error('Страница не найдена', 404);
            }
            $layout = $source['layout_json'] ?? null;
            if ($layout === null || trim((string) $layout) === '' || trim((string) $layout) === 'null') {
                Response::error('У исходной страницы нет layout для копирования', 422);
            }
            // Перегенерируем id элементов, чтобы не было коллизий в билдере
            $decoded = json_decode((string) $layout, true);
            if (!is_array($decoded)) {
                Response::error('Некорректный layout источника', 422);
            }
            $cloned = self::rekeyLayoutIds($decoded);
            $db->run('UPDATE pages SET layout_json=? WHERE id=?', [
                json_encode($cloned, JSON_UNESCAPED_UNICODE),
                $targetId,
            ]);
            Response::json([
                'success' => true,
                'data' => [
                    'target_id' => $targetId,
                    'source_id' => $sourceId,
                    'message' => 'Стиль (layout) скопирован с «' . $source['title'] . '» на «' . $target['title'] . '»',
                ],
            ]);
        }, $protected);
    }

    /**
     * Глубоко клонирует layout и назначает новые id всем узлам.
     *
     * @param array<string, mixed> $layout
     * @return array<string, mixed>
     */
    private static function rekeyLayoutIds(array $layout): array
    {
        $walk = function (&$node) use (&$walk): void {
            if (!is_array($node)) {
                return;
            }
            if (isset($node['id'])) {
                $node['id'] = 'el_' . bin2hex(random_bytes(6));
            }
            if (!empty($node['elements']) && is_array($node['elements'])) {
                foreach ($node['elements'] as &$child) {
                    $walk($child);
                }
                unset($child);
            }
        };
        if (!empty($layout['elements']) && is_array($layout['elements'])) {
            foreach ($layout['elements'] as &$el) {
                $walk($el);
            }
            unset($el);
        }
        return $layout;
    }

    public function demoPages(): array
    {
        // Core System templates only — portfolio/blog/commerce/auth live on owning plugins.
        return SystemTemplates::demoPagesForPlugin(null);
    }

    private function packageLifecycleService(Database $db, array $app): \App\Services\Modules\ModulePackageService
    {
        $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
        $registry = new \App\Services\Modules\ModuleRegistryRepository($db);
        $staging = new \App\Services\Modules\ModuleStagingService($paths);
        $snapshots = new \App\Services\Modules\ModuleSnapshotService($paths, $registry);
        $migrations = new \App\Services\Modules\ModuleMigrationService($db);
        $hooks = new \App\Services\Modules\ModuleHookRunner();
        $health = new \App\Services\Modules\ModuleHealthService($registry, $paths, $migrations, $app);

        return new \App\Services\Modules\ModulePackageService(
            $db,
            $app,
            $paths,
            $registry,
            $staging,
            $snapshots,
            $migrations,
            $hooks,
            $health,
        );
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'System', 'path' => '/admin/activity', 'label' => 'Activity log', 'permission' => 'activity.view'],
            ['group' => 'System', 'path' => '/admin/system', 'label' => 'System status', 'permission' => 'system.manage'],
            ['group' => 'System', 'path' => '/admin/plugins', 'label' => 'Plugins', 'permission' => 'system.manage'],
            ['group' => 'System', 'path' => '/admin/trash', 'label' => 'Trash', 'permission' => 'content.restore'],
            ['group' => 'System', 'path' => '/admin/backup', 'label' => 'Backup', 'permission' => 'system.manage'],
            ['group' => 'System', 'path' => '/admin/updates', 'label' => 'Updates', 'permission' => 'system.manage'],
            ['group' => 'System', 'path' => '/admin/password', 'label' => 'Password', 'permission' => 'settings.manage'],
        ];
    }
}
