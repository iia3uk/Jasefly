<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\PageScheduleService;
use App\Services\SlugService;
use App\Services\SoftDeleteService;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Utils\Password;
use App\Support\AdminBasePath;

final class AdminController
{
    private array $tables = [
        'social-links' => 'social_links',
        'statistics' => 'statistics',
        'experience' => 'experience',
        'education' => 'education',
        'skill-categories' => 'skill_categories',
        'skills' => 'skills',
        'projects' => 'projects',
        'project-categories' => 'project_categories',
        'blog' => 'blog_posts',
        'blog-categories' => 'blog_categories',
        'blog-tags' => 'blog_tags',
        'services' => 'services',
        'testimonials' => 'testimonials',
        'navigation' => 'navigation_items',
        'homepage-sections' => 'homepage_sections',
        'pages' => 'pages',
        // Integration plugins
        'webhooks' => 'webhooks',
        'orders' => 'orders',
        'payments' => 'payments',
        'products' => 'products',
    ];

    private array $slugTables = [
        'projects' => ['table' => 'projects', 'type' => 'project'],
        'blog' => ['table' => 'blog_posts', 'type' => 'blog_post'],
        'pages' => ['table' => 'pages', 'type' => 'page'],
        'services' => ['table' => 'services', 'type' => 'service'],
        'products' => ['table' => 'products', 'type' => 'product'],
        'project-categories' => ['table' => 'project_categories', 'type' => 'project_category'],
        'blog-categories' => ['table' => 'blog_categories', 'type' => 'blog_category'],
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
    private ?EventDispatcher $events = null;

    public function __construct(private Database $db, private array $app)
    {
        $this->softDelete = new SoftDeleteService($db);
        $this->slugs = new SlugService($db);
        $this->activity = new ActivityLogService($db);
        $container = Container::getInstance();
        if ($container->has(EventDispatcher::class)) {
            $this->events = $container->get(EventDispatcher::class);
        }
    }

    private function dispatch(string $event, mixed $payload): mixed
    {
        return $this->events?->dispatch($event, $payload);
    }

    private function table(string $resource): string
    {
        if (!isset($this->tables[$resource])) {
            Response::error('Unknown resource', 404);
        }
        return $this->tables[$resource];
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
        $table = $this->table($resource);
        $row = $this->db->one("SELECT * FROM `$table` WHERE id=? AND {$this->deletedFilter($table)}", [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        if ($resource === 'projects') {
            $row = $this->loadProjectRelations($row);
        }
        if ($resource === 'blog') {
            $row['tags'] = $this->db->all(
                'SELECT t.* FROM blog_tags t INNER JOIN blog_post_tags p ON p.tag_id=t.id WHERE p.post_id=?',
                [$id]
            );
            $row['tag_ids'] = array_map(fn($t) => (int) $t['id'], $row['tags']);
        }
        if ($resource === 'pages') {
            $row = $this->normalizePageRow($row);
        }
        Response::json(['data' => $row]);
    }

    public function create(Request $r, string $resource): never
    {
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
            $revSvc = new \App\Services\PageRevisionService($this->db);
            $revSvc->snapshot((int) $id, $r->user['id'] ?? null, 'Save');
        }
        $this->show($r, $resource, $id);
    }

    public function delete(Request $r, string $resource, string $id): never
    {
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
        $countTables = [
            'projects', 'blog_posts', 'contact_messages', 'media', 'services', 'testimonials',
            'pages', 'users', 'experience', 'education', 'skills', 'products',
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
            'projects' => $this->dashboardStatusCount('projects', 'draft'),
            'posts' => $this->dashboardStatusCount('blog_posts', 'draft'),
            'pages' => $this->dashboardStatusCount('pages', 'draft'),
        ];

        $publish = [
            'projects' => [
                'published' => $this->dashboardStatusCount('projects', 'published'),
                'draft' => $drafts['projects'],
                'archived' => $this->dashboardStatusCount('projects', 'archived'),
            ],
            'posts' => [
                'published' => $this->dashboardStatusCount('blog_posts', 'published'),
                'draft' => $drafts['posts'],
                'archived' => $this->dashboardStatusCount('blog_posts', 'archived'),
            ],
            'pages' => [
                'published' => $this->dashboardStatusCount('pages', 'published'),
                'draft' => $drafts['pages'],
                'archived' => $this->dashboardStatusCount('pages', 'archived'),
            ],
        ];

        $projectLifecycle = [];
        foreach (['completed', 'in_progress', 'on_hold', 'concept', 'cancelled'] as $st) {
            $projectLifecycle[$st] = $this->dashboardProjectStatusCount($st);
        }

        $recent = [
            'projects_7d' => $this->dashboardRecentCount('projects', 7),
            'posts_7d' => $this->dashboardRecentCount('blog_posts', 7),
            'media_7d' => $this->dashboardRecentCount('media', 7),
            'messages_7d' => $this->tableExists('contact_messages')
                ? (int) ($this->db->one('SELECT COUNT(*) c FROM contact_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)')['c'] ?? 0)
                : 0,
        ];

        $trashTotal = 0;
        foreach (SoftDeleteService::TRASHABLE as $table) {
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

    private function dashboardStatusCount(string $table, string $status): int
    {
        if (!$this->tableExists($table)) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause($table);
            return (int) ($this->db->one(
                "SELECT COUNT(*) c FROM `$table` WHERE status=? AND $where",
                [$status]
            )['c'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function dashboardProjectStatusCount(string $status): int
    {
        if (!$this->tableExists('projects')) {
            return 0;
        }
        try {
            $where = $this->softDelete->notDeletedClause('projects');
            return (int) ($this->db->one(
                "SELECT COUNT(*) c FROM projects WHERE project_status=? AND $where",
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
            $revSvc = new \App\Services\PageRevisionService($this->db);
            $revSvc->snapshot((int) $id, $r->user['id'] ?? null, 'Publish');
        }
        $this->dispatch('page.afterPublish', ['pageId' => (int) $id, 'resource' => $resource, 'status' => $status]);
        $this->activity->log($r, 'publish', $resource, (int) $id, null, ['status' => $status]);
        Response::json(['message' => 'Status updated', 'status' => $status]);
    }

    public function reorder(Request $r, string $resource): never
    {
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

    private function extractRelations(string $resource, array &$payload): array
    {
        $keys = match ($resource) {
            'projects' => ['technologies', 'features', 'timeline', 'tags', 'tag_ids', 'media', 'gallery'],
            'blog' => ['tag_ids', 'tags'],
            default => [],
        };
        $out = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $payload)) {
                $out[$key] = $payload[$key];
                unset($payload[$key]);
            }
        }
        return $out;
    }

    private function syncRelations(string $resource, int $id, array $relations): void
    {
        if ($resource === 'projects') {
            if (isset($relations['technologies'])) {
                $this->db->run('DELETE FROM project_technologies WHERE project_id=?', [$id]);
                foreach ((array) $relations['technologies'] as $i => $tech) {
                    if (is_string($tech)) {
                        $tech = ['name' => $tech];
                    }
                    $this->db->run(
                        'INSERT INTO project_technologies(project_id,name,icon,sort_order) VALUES(?,?,?,?)',
                        [$id, $tech['name'] ?? '', $tech['icon'] ?? null, $tech['sort_order'] ?? $i]
                    );
                }
            }
            if (isset($relations['features'])) {
                $this->db->run('DELETE FROM project_features WHERE project_id=?', [$id]);
                foreach ((array) $relations['features'] as $i => $feature) {
                    if (is_string($feature)) {
                        $feature = ['title' => $feature];
                    }
                    $this->db->run(
                        'INSERT INTO project_features(project_id,title,description,icon,sort_order) VALUES(?,?,?,?,?)',
                        [$id, $feature['title'] ?? '', $feature['description'] ?? null, $feature['icon'] ?? null, $feature['sort_order'] ?? $i]
                    );
                }
            }
            if (isset($relations['timeline'])) {
                $this->db->run('DELETE FROM project_timeline WHERE project_id=?', [$id]);
                foreach ((array) $relations['timeline'] as $i => $event) {
                    if (is_string($event)) {
                        $event = ['title' => $event];
                    }
                    $this->db->run(
                        'INSERT INTO project_timeline(project_id,title,description,event_date,sort_order) VALUES(?,?,?,?,?)',
                        [$id, $event['title'] ?? '', $event['description'] ?? null, $event['event_date'] ?? null, $event['sort_order'] ?? $i]
                    );
                }
            }
            if (isset($relations['media']) || isset($relations['gallery'])) {
                $items = $relations['media'] ?? $relations['gallery'] ?? [];
                if (is_string($items)) {
                    $decoded = json_decode($items, true);
                    $items = is_array($decoded) ? $decoded : [];
                }
                if (!is_array($items)) {
                    $items = [];
                }
                $this->db->run('DELETE FROM project_media WHERE project_id=?', [$id]);
                foreach ($items as $i => $item) {
                    $url = is_array($item) ? trim((string) ($item['url'] ?? '')) : '';
                    if ($url === '') {
                        $url = null;
                    }
                    // Prefer media_id — never treat project_media.id as media_id when media_id is present
                    if (is_array($item)) {
                        $mediaId = $item['media_id'] ?? null;
                        // Loaded rows may include project_media_id / joined media.id — only use media_id
                        if ($mediaId === null && !isset($item['url']) && isset($item['id']) && !isset($item['project_media_id'])) {
                            $mediaId = $item['id'];
                        }
                    } else {
                        $mediaId = $item;
                    }
                    $mediaId = is_numeric($mediaId) ? (int) $mediaId : 0;
                    if ($mediaId <= 0) {
                        $mediaId = null;
                    }

                    if ($mediaId !== null) {
                        $mediaNotDeleted = $this->softDelete->notDeletedClause('media');
                        $exists = $this->db->one("SELECT id FROM media WHERE id=? AND {$mediaNotDeleted}", [$mediaId]);
                        if (!$exists) {
                            continue;
                        }
                    } elseif ($url === null) {
                        continue;
                    }

                    $caption = is_array($item) ? ($item['caption'] ?? null) : null;
                    if ($caption === '') {
                        $caption = null;
                    }
                    $type = is_array($item) ? ($item['media_type'] ?? 'gallery') : 'gallery';
                    if ($url !== null || (is_array($item) && (str_starts_with((string) ($item['media_mime'] ?? $item['mime_type'] ?? ''), 'video/')))) {
                        $type = 'video';
                    }
                    if (!in_array($type, ['image', 'screenshot', 'video', 'gallery'], true)) {
                        $type = 'gallery';
                    }
                    $this->db->run(
                        'INSERT INTO project_media(project_id,media_id,caption,url,media_type,sort_order) VALUES(?,?,?,?,?,?)',
                        [$id, $mediaId, $caption, $url, $type, is_array($item) ? (int) ($item['sort_order'] ?? $i) : $i]
                    );
                }
            }
            $this->syncProjectTags($id, $relations);
        }

        if ($resource === 'blog') {
            $this->syncBlogTags($id, $relations);
            $content = $this->db->one('SELECT content FROM blog_posts WHERE id=?', [$id])['content'] ?? null;
            if ($content) {
                $words = str_word_count(strip_tags((string) $content));
                $this->db->run('UPDATE blog_posts SET reading_time=? WHERE id=?', [max(1, (int) ceil($words / 200)), $id]);
            }
        }
    }

    private function syncProjectTags(int $id, array $relations): void
    {
        $tagIds = $relations['tag_ids'] ?? null;
        if ($tagIds === null && isset($relations['tags'])) {
            $tagIds = [];
            foreach ((array) $relations['tags'] as $tag) {
                $name = is_array($tag) ? ($tag['name'] ?? '') : (string) $tag;
                if ($name === '') {
                    continue;
                }
                $slug = \App\Utils\Str::slug($name);
                $existing = $this->db->one('SELECT id FROM project_tags WHERE slug=?', [$slug]);
                if ($existing) {
                    $tagIds[] = (int) $existing['id'];
                } else {
                    $this->db->run('INSERT INTO project_tags(name,slug) VALUES(?,?)', [$name, $slug]);
                    $tagIds[] = $this->db->id();
                }
            }
        }
        if (is_array($tagIds)) {
            $this->db->run('DELETE FROM project_tag_pivot WHERE project_id=?', [$id]);
            foreach ($tagIds as $tagId) {
                $this->db->run('INSERT INTO project_tag_pivot(project_id,tag_id) VALUES(?,?)', [$id, $tagId]);
            }
        }
    }

    private function syncBlogTags(int $id, array $relations): void
    {
        $tagIds = $relations['tag_ids'] ?? null;
        if ($tagIds === null && isset($relations['tags'])) {
            $tagIds = [];
            foreach ((array) $relations['tags'] as $tag) {
                $name = is_array($tag) ? ($tag['name'] ?? '') : (string) $tag;
                if ($name === '') {
                    continue;
                }
                $slug = \App\Utils\Str::slug($name);
                $existing = $this->db->one('SELECT id FROM blog_tags WHERE slug=?', [$slug]);
                if ($existing) {
                    $tagIds[] = (int) $existing['id'];
                } else {
                    $this->db->run('INSERT INTO blog_tags(name,slug) VALUES(?,?)', [$name, $slug]);
                    $tagIds[] = $this->db->id();
                }
            }
        }
        if (is_array($tagIds)) {
            $this->db->run('DELETE FROM blog_post_tags WHERE post_id=?', [$id]);
            foreach ($tagIds as $tagId) {
                $this->db->run('INSERT INTO blog_post_tags(post_id,tag_id) VALUES(?,?)', [$id, $tagId]);
            }
        }
    }

    private function loadProjectRelations(array $row): array
    {
        $id = (int) $row['id'];
        $row['technologies'] = $this->db->all('SELECT * FROM project_technologies WHERE project_id=? ORDER BY sort_order', [$id]);
        $row['features'] = $this->db->all('SELECT * FROM project_features WHERE project_id=? ORDER BY sort_order', [$id]);
        $row['timeline'] = $this->db->all('SELECT * FROM project_timeline WHERE project_id=? ORDER BY sort_order', [$id]);
        $mediaNotDeleted = $this->softDelete->notDeletedClause('media', 'm');
        $row['media'] = $this->db->all(
            "SELECT pm.id AS project_media_id, pm.project_id, pm.media_id, pm.caption, pm.url, pm.media_type, pm.sort_order,
                    m.id, m.path, m.thumbnail_path, m.webp_path, m.alt_text, m.original_name, m.mime_type
             FROM project_media pm
             LEFT JOIN media m ON m.id = pm.media_id AND {$mediaNotDeleted}
             WHERE pm.project_id = ?
               AND (pm.media_id IS NULL OR m.id IS NOT NULL OR (pm.url IS NOT NULL AND pm.url != ''))
             ORDER BY pm.sort_order, pm.id",
            [$id]
        );
        $row['tags'] = $this->db->all(
            'SELECT t.* FROM project_tags t INNER JOIN project_tag_pivot p ON p.tag_id=t.id WHERE p.project_id=?',
            [$id]
        );
        $row['tag_ids'] = array_map(fn($t) => (int) $t['id'], $row['tags']);
        return $row;
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
