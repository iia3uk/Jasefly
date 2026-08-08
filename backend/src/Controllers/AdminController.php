<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\PageScheduleService;
use App\Services\PermissionService;
use App\Services\SlugService;
use App\Services\SoftDeleteService;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Utils\Password;
use App\Support\AdminBasePath;
use App\Platform\Adapters\ContentResourcesAdapter;
use App\Platform\Contracts\PlatformContentResourcesInterface;
use App\Platform\Surfaces\PackageSurfaceRegistry;
use App\Platform\Surfaces\SurfaceSql;

final class AdminController
{
    private array $tables = [
        'social-links' => 'social_links',
        'statistics' => 'statistics',
        'experience' => 'experience',
        'education' => 'education',
        'skill-categories' => 'skill_categories',
        'skills' => 'skills',
        // Package domains (blog/projects/products/orders) register via ContentResourcesAdapter / surfaces.
        'services' => 'services',
        'testimonials' => 'testimonials',
        'navigation' => 'navigation_items',
        'homepage-sections' => 'homepage_sections',
        'pages' => 'pages',
    ];

    private array $slugTables = [
        'pages' => ['table' => 'pages', 'type' => 'page'],
        'services' => ['table' => 'services', 'type' => 'service'],
        'skill-categories' => ['table' => 'skill_categories', 'type' => 'skill_category'],
    ];

    private array $singletonTables = [
        'profile' => 'profile',
        'contact-info' => 'contact_info',
        'footer' => 'footer_settings',
        'hero' => 'hero_settings',
        'seo' => 'seo_settings',
        'site-settings' => 'site_settings',
        'theme' => 'theme_settings',
        'email-settings' => 'email_settings',
    ];

    private SoftDeleteService $softDelete;
    private SlugService $slugs;
    private ActivityLogService $activity;
    private PermissionService $permissions;
    private ?EventDispatcher $events = null;

    public function __construct(private Database $db, private array $app)
    {
        $this->softDelete = new SoftDeleteService($db);
        $this->slugs = new SlugService($db);
        $this->activity = new ActivityLogService($db);
        $this->permissions = new PermissionService($db);
        $container = Container::getInstance();
        if ($container->has(EventDispatcher::class)) {
            $this->events = $container->get(EventDispatcher::class);
        }
    }

    /** Explicit capability gate for AdminController mutations (not Auth-only). */
    private function assertResourceMutation(Request $r, string $resource, string $op): void
    {
        $user = $r->user ?? null;
        if (!is_array($user)) {
            Response::error('Unauthorized', 401);
        }
        if ($this->permissions->isContentResource($resource)) {
            $this->permissions->requireContentMutation($user, $op);
        }
    }

    private function dispatch(string $event, mixed $payload): mixed
    {
        return $this->events?->dispatch($event, $payload);
    }

    private function table(string $resource): string
    {
        if ($this->contentResources()->has($resource)) {
            throw new \LogicException("Resource '{$resource}' is package-owned and must not use host tables");
        }
        if (!isset($this->tables[$resource])) {
            Response::error('Unknown resource', 404);
        }
        return $this->tables[$resource];
    }

    private function contentResources(): PlatformContentResourcesInterface
    {
        return new ContentResourcesAdapter('host');
    }

    private function resourceError(array $result): never
    {
        $status = ($result['code'] ?? '') === 'not_found' ? 404 : 422;
        Response::error((string) ($result['error'] ?? 'Resource operation failed'), $status);
    }

    /** True if the table exists in the current DB (plugin migrations may not have run). */
    private function tableExists(string $table): bool
    {
        return $this->db->inspector()->tableExists($table);
    }

    private function columns(string $table): array
    {
        return array_keys($this->db->inspector()->columns($table));
    }

    private function deletedFilter(string $table): string
    {
        return $this->softDelete->notDeletedClause($table);
    }

    private function writable(string $table, array $data): array
    {
        if ($table === 'pages' && array_key_exists('layout', $data) && !array_key_exists('layout_json', $data)) {
            $data['layout_json'] = $data['layout'];
            unset($data['layout']);
        }
        $columns = $this->columns($table);
        $out = [];
        // Columns that hold rich-text HTML and must be sanitized on save.
        $htmlColumns = ['content', 'description', 'short_description', 'excerpt', 'html', 'bio', 'text'];
        foreach ($data as $key => $value) {
            if (!in_array($key, $columns, true) || in_array($key, ['id', 'created_at', 'updated_at', 'deleted_at'], true)) {
                continue;
            }
            if (is_array($value) || is_object($value)) {
                $out[$key] = json_encode($value, JSON_UNESCAPED_UNICODE);
            } else {
                if (is_string($value) && in_array($key, $htmlColumns, true)) {
                    $value = \App\Utils\HtmlSanitizer::clean($value);
                }
                $out[$key] = $value;
            }
        }
        if (isset($out['title']) && !isset($out['slug']) && in_array('slug', $columns, true)) {
            $out['slug'] = $this->slugs->generate($table, (string) $out['title']);
        }
        if (isset($out['name']) && !isset($out['slug']) && in_array('slug', $columns, true)) {
            $out['slug'] = $this->slugs->generate($table, (string) $out['name']);
        }
        if (isset($out['slug']) && in_array('slug', $columns, true)) {
            $out['slug'] = $this->slugs->normalize((string) $out['slug']);
            // Home page must keep the reserved slug (Str::slug would turn __home → home).
            if (!empty($out['is_home']) || !empty($data['is_home'])) {
                $out['slug'] = '__home';
            }
        }
        return $out;
    }

    public function index(Request $r, string $resource): never
    {
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $result = $resources->list($resource, $r->query());
            Response::json(['data' => $result['items'] ?? []]);
        }
        $table = $this->table($resource);
        // A plugin resource whose migration hasn't run yet has no table.
        // Return an empty list rather than 500 so the admin stays usable
        // (the migration banner already nudges the user to retry).
        if (!$this->tableExists($table)) {
            Response::json(['data' => [], 'warning' => "Таблица «{$table}» ещё не создана — выполните миграции."]);
        }
        $where = $this->deletedFilter($table);
        $order = in_array('sort_order', $this->columns($table), true) ? 'sort_order, id DESC' : 'id DESC';
        if ($resource === 'pages') {
            (new PageScheduleService($this->db))->promoteDue();
        }
        $rows = $this->db->all("SELECT * FROM `$table` WHERE $where ORDER BY $order");
        if ($resource === 'pages') {
            $rows = array_map(fn(array $row) => $this->normalizePageRow($row), $rows);
        }
        Response::json(['data' => $rows]);
    }

    public function show(Request $r, string $resource, string $id): never
    {
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $row = $resources->get($resource, $id);
            if (!$row) Response::error('Not found', 404);
            Response::json(['data' => $row]);
        }
        $table = $this->table($resource);
        if ($resource === 'pages') {
            (new PageScheduleService($this->db))->promoteDue();
        }
        $row = $this->db->one("SELECT * FROM `$table` WHERE id=? AND {$this->deletedFilter($table)}", [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        if ($resource === 'pages') {
            $row = $this->normalizePageRow($row);
        }
        Response::json(['data' => $row]);
    }

    public function create(Request $r, string $resource): never
    {
        $this->assertResourceMutation($r, $resource, 'create');
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $result = $resources->create($resource, $r->all(), $r->user);
            if (empty($result['ok'])) $this->resourceError($result);
            Response::json(['data' => $result['data'] ?? $result['item'] ?? null], 201);
        }
        $table = $this->table($resource);
        $payload = $r->all();
        $relations = $this->extractRelations($resource, $payload);
        $values = $this->writable($table, $payload);

        $values = $this->dispatch('resource.beforeSave', ['table' => $table, 'resource' => $resource, 'data' => $values, 'id' => null])['data'] ?? $values;

        if (isset($values['slug'])) {
            $err = $this->slugs->validate($table, $values['slug']);
            if ($err) {
                Response::error($err, 422);
            }
        }

        if (!$values) {
            Response::error('No writable fields', 422);
        }

        if ($resource === 'pages' && !empty($values['is_home'])) {
            $this->db->run('UPDATE pages SET is_home=0 WHERE is_home=1');
            $values['is_home'] = 1;
        }

        $cols = array_keys($values);
        $this->db->run(
            "INSERT INTO `$table` (`" . implode('`,`', $cols) . '`) VALUES(' . implode(',', array_fill(0, count($values), '?')) . ')',
            array_values($values)
        );
        $id = $this->db->id();
        $this->syncRelations($resource, $id, $relations);
        $this->activity->log($r, 'create', $resource, $id, $values['title'] ?? $values['name'] ?? null);
        $this->dispatch('resource.afterSave', ['table' => $table, 'resource' => $resource, 'data' => $values, 'id' => $id]);
        $this->show($r, $resource, (string) $id);
    }

    public function update(Request $r, string $resource, string $id): never
    {
        $this->assertResourceMutation($r, $resource, 'update');
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $result = $resources->update($resource, $id, $r->all(), $r->user);
            if (empty($result['ok'])) $this->resourceError($result);
            Response::json(['data' => $result['data'] ?? $result['item'] ?? null]);
        }
        $table = $this->table($resource);
        $existing = $this->db->one("SELECT * FROM `$table` WHERE id=? AND {$this->deletedFilter($table)}", [$id]);
        if (!$existing) {
            Response::error('Not found', 404);
        }

        $payload = $r->all();
        $relations = $this->extractRelations($resource, $payload);
        $values = $this->writable($table, $payload);

        $values = $this->dispatch('resource.beforeSave', ['table' => $table, 'resource' => $resource, 'data' => $values, 'id' => (int) $id])['data'] ?? $values;

        if (isset($values['slug'])) {
            $err = $this->slugs->validate($table, $values['slug'], (int) $id);
            if ($err) {
                Response::error($err, 422);
            }
            if (isset($this->slugTables[$resource]) && !empty($existing['slug']) && $existing['slug'] !== $values['slug']) {
                $this->slugs->trackChange(
                    $this->slugTables[$resource]['type'],
                    $table,
                    (int) $id,
                    (string) $existing['slug'],
                    (string) $values['slug']
                );
            }
        }

        if ($values) {
            if ($resource === 'pages' && array_key_exists('is_home', $values) && !empty($values['is_home'])) {
                $this->db->run('UPDATE pages SET is_home=0 WHERE is_home=1 AND id<>?', [$id]);
                $values['is_home'] = 1;
            }
            $this->db->run(
                "UPDATE `$table` SET " . implode(',', array_map(fn($c) => "`$c`=?", array_keys($values))) . ' WHERE id=?',
                array_merge(array_values($values), [$id])
            );
        }
        $this->syncRelations($resource, (int) $id, $relations);
        $this->activity->log($r, 'update', $resource, (int) $id, $values['title'] ?? $existing['title'] ?? $existing['name'] ?? null);
        $this->dispatch('resource.afterSave', ['table' => $table, 'resource' => $resource, 'data' => $values, 'id' => (int) $id]);
        if ($resource === 'pages') {
            try {
                $revSvc = new \App\Services\PageRevisionService($this->db);
                $revSvc->snapshot((int) $id, $r->user['id'] ?? null, 'Save');
            } catch (\Throwable $e) {
                // Revision history must never fail the save response (FE would show error while data is already written).
                @error_log('PageRevisionService::snapshot failed: ' . $e->getMessage());
            }
        }
        $this->show($r, $resource, $id);
    }

    public function delete(Request $r, string $resource, string $id): never
    {
        $this->assertResourceMutation($r, $resource, 'delete');
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $result = $resources->delete($resource, $id, $r->user);
            if (empty($result['ok'])) $this->resourceError($result);
            Response::json(['message' => 'Moved to trash', 'data' => $result['data']]);
        }
        $table = $this->table($resource);
        $row = $this->db->one("SELECT * FROM `$table` WHERE id=? AND {$this->deletedFilter($table)}", [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }

        $label = $row['title'] ?? $row['name'] ?? $row['label'] ?? $row['company'] ?? null;
        $this->dispatch('resource.beforeDelete', ['table' => $table, 'resource' => $resource, 'id' => (int) $id]);
        $mode = $this->softDelete->trashOrDelete($resource, $table, (int) $id);
        $this->activity->log($r, $mode === 'trash' ? 'delete' : 'force_delete', $resource, (int) $id, $label);
        $this->dispatch('resource.afterDelete', ['table' => $table, 'resource' => $resource, 'id' => (int) $id, 'mode' => $mode]);
        Response::json([
            'message' => $mode === 'trash' ? 'Moved to trash' : 'Deleted',
            'data' => ['id' => (int) $id, 'resource' => $resource, 'mode' => $mode],
        ]);
    }

    public function singletonGet(Request $r, string $path): never
    {
        $table = $this->singletonTables[$path] ?? null;
        if (!$table) {
            Response::error('Unknown settings resource', 404);
        }
        Response::json(['data' => $this->db->one("SELECT * FROM `$table` LIMIT 1")]);
    }

    public function singleton(Request $r, string $path): never
    {
        $table = $this->singletonTables[$path] ?? null;
        if (!$table) {
            Response::error('Unknown settings resource', 404);
        }
        $payload = $r->all();
        if ($path === 'site-settings' && array_key_exists('admin_base_path', $payload)) {
            $check = AdminBasePath::validateForSave($payload['admin_base_path']);
            if (!$check['ok']) {
                Response::error((string) $check['error'], 422);
            }
            $payload['admin_base_path'] = $check['value'];
            $existingSettings = $this->db->one('SELECT admin_base_path FROM site_settings LIMIT 1');
            $oldBase = AdminBasePath::normalize($existingSettings['admin_base_path'] ?? null);
            $newBase = AdminBasePath::normalize($check['value']);
            if ($oldBase !== $newBase && ($r->user['role'] ?? '') !== 'super_admin') {
                Response::error('Forbidden: only super_admin can change admin_base_path', 403);
            }
        }
        $values = $this->writable($table, $payload);
        $existing = $this->db->one("SELECT id FROM `$table` LIMIT 1");
        if ($existing) {
            if ($values) {
                $this->db->run(
                    "UPDATE `$table` SET " . implode(',', array_map(fn($c) => "`$c`=?", array_keys($values))) . ' WHERE id=?',
                    array_merge(array_values($values), [$existing['id']])
                );
            }
        } else {
            $values['id'] = 1;
            $cols = array_keys($values);
            $this->db->run(
                "INSERT INTO `$table` (`" . implode('`,`', $cols) . '`) VALUES(' . implode(',', array_fill(0, count($values), '?')) . ')',
                array_values($values)
            );
        }
        $this->activity->log($r, 'settings_change', $path);
        Response::json(['data' => $this->db->one("SELECT * FROM `$table` LIMIT 1")]);
    }

    public function dashboard(Request $r): never
    {
        // Host/core countable tables only — package metrics via PackageSurfaceRegistry.
        $countTables = [
            'contact_messages', 'media', 'services', 'testimonials',
            'pages', 'users', 'experience', 'education', 'skills',
        ];
        $counts = [];
        foreach ($countTables as $table) {
            $counts[$table] = $this->dashboardCount($table);
        }

        $unread = 0;
        if ($this->tableExists('contact_messages')) {
            $unread = (int) ($this->db->one('SELECT COUNT(*) c FROM contact_messages WHERE is_read=0')['c'] ?? 0);
        }

        $messages = $this->tableExists('contact_messages')
            ? $this->db->all('SELECT id, name, email, subject, message, is_read, created_at FROM contact_messages ORDER BY id DESC LIMIT 8')
            : [];

        $drafts = [
            'pages' => $this->dashboardStatusCount('pages', 'draft'),
        ];

        $publish = [
            'pages' => [
                'published' => $this->dashboardStatusCount('pages', 'published'),
                'draft' => $drafts['pages'],
                'archived' => $this->dashboardStatusCount('pages', 'archived'),
            ],
        ];

        $projectLifecycle = [];
        $recent = [
            'media_7d' => $this->dashboardRecentCount('media', 7),
            'messages_7d' => $this->tableExists('contact_messages')
                ? (int) ($this->db->one('SELECT COUNT(*) c FROM contact_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)')['c'] ?? 0)
                : 0,
        ];

        foreach (PackageSurfaceRegistry::dashboardMetrics() as $metric) {
            $table = (string) ($metric['table'] ?? '');
            if ($table === '' || !SurfaceSql::ident($table)) {
                continue;
            }
            $statusCol = SurfaceSql::ident((string) ($metric['status_column'] ?? 'status')) ?? 'status';
            if (!empty($metric['count_as'])) {
                $counts[(string) $metric['count_as']] = $this->dashboardCount($table);
            }
            if (!empty($metric['draft_as'])) {
                $drafts[(string) $metric['draft_as']] = $this->dashboardStatusCount($table, 'draft', $statusCol);
            }
            if (!empty($metric['publish_as'])) {
                $key = (string) $metric['publish_as'];
                $draftKey = (string) ($metric['draft_as'] ?? $key);
                $publish[$key] = [
                    'published' => $this->dashboardStatusCount($table, 'published', $statusCol),
                    'draft' => $drafts[$draftKey] ?? $this->dashboardStatusCount($table, 'draft', $statusCol),
                    'archived' => $this->dashboardStatusCount($table, 'archived', $statusCol),
                ];
            }
            if (!empty($metric['recent_as'])) {
                $days = max(1, (int) ($metric['recent_days'] ?? 7));
                $recent[(string) $metric['recent_as']] = $this->dashboardRecentCount($table, $days);
            }
            $extraCol = SurfaceSql::ident((string) ($metric['extra_status_column'] ?? ''));
            $extraStatuses = $metric['extra_statuses'] ?? null;
            if ($extraCol !== null && is_array($extraStatuses)) {
                foreach ($extraStatuses as $st) {
                    $st = (string) $st;
                    if ($st === '') {
                        continue;
                    }
                    $projectLifecycle[$st] = $this->dashboardColumnStatusCount($table, $extraCol, $st);
                }
            }
        }

        $trashTotal = 0;
        foreach (SoftDeleteService::trashableMap() as $table) {
            if (!$this->tableExists($table)) {
                continue;
            }
            try {
                if (!$this->db->inspector()->columnExists($table, 'deleted_at')) {
                    continue;
                }
                $trashTotal += (int) ($this->db->one("SELECT COUNT(*) c FROM `$table` WHERE deleted_at IS NOT NULL")['c'] ?? 0);
            } catch (\Throwable) {
                // ignore missing tables/columns
            }
        }

        $activity = [];
        if ($this->tableExists('activity_logs')) {
            $activity = $this->db->all(
                'SELECT id, user_name, action, entity_type, entity_id, entity_label, created_at
                 FROM activity_logs ORDER BY id DESC LIMIT 10'
            );
        }

        // Shared-hosting lazy scheduler tick (no-op if Scheduler plugin off / recently ran).
        try {
            if (class_exists(\App\Modules\Scheduler\SchedulerModule::class)) {
                \App\Modules\Scheduler\SchedulerModule::maybeLazyTick($this->db);
            }
        } catch (\Throwable) {
        }

        Response::json([
            'data' => [
                'counts' => $counts,
                'unread_messages' => $unread,
                'messages' => $messages,
                'drafts' => $drafts,
                'publish' => $publish,
                'project_lifecycle' => $projectLifecycle,
                'recent' => $recent,
                'trash_total' => $trashTotal,
                'activity' => $activity,
            ],
        ]);
    }

    private function dashboardCount(string $table): int
    {
        if (!$this->tableExists($table)) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause($table);
            return (int) ($this->db->one("SELECT COUNT(*) AS c FROM `$table` WHERE $where")['c'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function dashboardStatusCount(string $table, string $status, string $statusColumn = 'status'): int
    {
        if (!$this->tableExists($table)) {
            return 0;
        }
        $col = SurfaceSql::ident($statusColumn);
        if ($col === null) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause($table);
            return (int) ($this->db->one(
                "SELECT COUNT(*) c FROM `$table` WHERE `{$col}`=? AND $where",
                [$status]
            )['c'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function dashboardColumnStatusCount(string $table, string $column, string $status): int
    {
        if (!$this->tableExists($table)) {
            return 0;
        }
        $col = SurfaceSql::ident($column);
        if ($col === null) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause($table);
            return (int) ($this->db->one(
                "SELECT COUNT(*) c FROM `$table` WHERE `{$col}`=? AND $where",
                [$status]
            )['c'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function dashboardRecentCount(string $table, int $days): int
    {
        if (!$this->tableExists($table)) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause($table);
            return (int) ($this->db->one(
                "SELECT COUNT(*) c FROM `$table` WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND $where",
                [$days]
            )['c'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    public function publish(Request $r, string $resource, string $id): never
    {
        $this->assertResourceMutation($r, $resource, 'publish');
        $resources = $this->contentResources();
        if ($resources->has($resource)) {
            $result = $resources->publish($resource, $id, (string) ($r->input('status') ?? 'published'), $r->user);
            if (empty($result['ok'])) $this->resourceError($result);
            Response::json(['message' => 'Status updated', 'status' => $result['data']['status'] ?? null]);
        }
        $table = $this->table($resource);
        $status = (string) ($r->input('status') ?? 'published');
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            Response::error('Invalid status', 422);
        }
        $notDeleted = $this->softDelete->notDeletedClause($table);
        if ($status === 'published') {
            $this->db->run(
                "UPDATE `$table` SET status=?, published_at=COALESCE(published_at, NOW()) WHERE id=? AND $notDeleted",
                [$status, $id]
            );
        } else {
            $this->db->run("UPDATE `$table` SET status=? WHERE id=? AND $notDeleted", [$status, $id]);
        }
        // Snapshot a revision when publishing a page (rollback support).
        if ($resource === 'pages' && $status === 'published') {
            try {
                $revSvc = new \App\Services\PageRevisionService($this->db);
                $revSvc->snapshot((int) $id, $r->user['id'] ?? null, 'Publish');
            } catch (\Throwable $e) {
                @error_log('PageRevisionService::snapshot(publish) failed: ' . $e->getMessage());
            }
        }
        $this->dispatch('page.afterPublish', ['pageId' => (int) $id, 'resource' => $resource, 'status' => $status]);
        $this->activity->log($r, 'publish', $resource, (int) $id, null, ['status' => $status]);
        Response::json(['message' => 'Status updated', 'status' => $status]);
    }

    public function reorder(Request $r, string $resource): never
    {
        $this->assertResourceMutation($r, $resource, 'update');
        $table = $this->table($resource);
        foreach ((array) $r->input('items', []) as $i => $itemId) {
            $this->db->run("UPDATE `$table` SET sort_order=? WHERE id=?", [$i, $itemId]);
        }
        Response::json(['message' => 'Reordered']);
    }

    public function messages(Request $r): never
    {
        Response::json(['data' => $this->db->all('SELECT * FROM contact_messages ORDER BY id DESC')]);
    }

    public function deleteMessage(Request $r, string $id): never
    {
        $this->db->run('DELETE FROM contact_messages WHERE id=?', [$id]);
        Response::json(['message' => 'Deleted']);
    }

    public function readMessage(Request $r, string $id): never
    {
        $this->db->run('UPDATE contact_messages SET is_read=1 WHERE id=?', [$id]);
        Response::json(['message' => 'Marked read']);
    }

    public function password(Request $r): never
    {
        $password = (string) $r->input('password');
        if (strlen($password) < 10) {
            Response::error('Password must be at least 10 characters', 422);
        }
        $userId = $r->user['sub'] ?? null;
        if (!$userId) {
            Response::error('Unauthorized', 401);
        }
        $this->db->run('UPDATE users SET password_hash=? WHERE id=?', [
            Password::hash($password),
            $userId,
        ]);
        $this->activity->log($r, 'password_change', 'user', (int) $userId);
        Response::json(['message' => 'Password updated']);
    }

    private function normalizePageRow(array $row): array
    {
        $raw = $row['layout_json'] ?? null;
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $row['layout'] = json_last_error() === JSON_ERROR_NONE ? $decoded : null;
        } else {
            $row['layout'] = is_array($raw) ? $raw : null;
        }
        $row['is_home'] = (int) ($row['is_home'] ?? 0) === 1;
        return $row;
    }
}

