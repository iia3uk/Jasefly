<?php
declare(strict_types=1);

namespace App\Support;

use PDO;
use RuntimeException;
use Throwable;

/**
 * Imports a versioned JSON content pack into Jasefly CMS tables.
 * Does not touch users or config.local.php.
 */
final class ContentPackImporter
{
    /** @var array<string, int> */
    private array $skillCategoryRefs = [];

    /** @var array<string, int> */
    private array $projectCategoryRefs = [];

    /** @var array<string, int> */
    private array $projectTagRefs = [];

    /** @var array<string, int> */
    private array $projectRefs = [];

    /** @var array<string, int> */
    private array $blogCategoryRefs = [];

    /** @var array<string, int> */
    private array $blogTagRefs = [];

    /** @var array<string, int> */
    private array $report = [];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param array<string, mixed> $pack
     * @return array<string, int>
     */
    public function import(array $pack): array
    {
        $version = (int) ($pack['version'] ?? 0);
        if ($version !== 1) {
            throw new RuntimeException('Unsupported content pack version. Expected version: 1.');
        }

        $mode = (string) ($pack['mode'] ?? 'replace_content');
        if ($mode !== 'replace_content') {
            throw new RuntimeException('Unsupported mode. Use "replace_content".');
        }

        $this->report = [];
        $this->pdo->beginTransaction();
        try {
            $this->clearContent();
            $this->importSingletons($pack['singletons'] ?? []);
            $this->importSocialLinks($pack['social_links'] ?? []);
            $this->importStatistics($pack['statistics'] ?? []);
            $this->importExperience($pack['experience'] ?? []);
            $this->importEducation($pack['education'] ?? []);
            $this->importSkillCategories($pack['skill_categories'] ?? []);
            $this->importSkills($pack['skills'] ?? []);
            $this->importProjectCategories($pack['project_categories'] ?? []);
            $this->importProjectTags($pack['project_tags'] ?? []);
            $this->importProjects($pack['projects'] ?? []);
            $this->importBlogCategories($pack['blog_categories'] ?? []);
            $this->importBlogTags($pack['blog_tags'] ?? []);
            $this->importBlogPosts($pack['blog_posts'] ?? []);
            $this->importServices($pack['services'] ?? []);
            // Товары витрины: явный products[] или автоиз services (новый развёрнутый формат).
            $products = $pack['products'] ?? null;
            if (!is_array($products) || $products === []) {
                $products = self::servicesToProducts($pack['services'] ?? []);
            }
            $this->importProducts($products);
            $this->importTestimonials($pack['testimonials'] ?? []);
            $this->importNavigation($pack['navigation_items'] ?? []);
            $this->importHomepageSections($pack['homepage_sections'] ?? []);
            $this->importPages($pack['pages'] ?? []);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $this->report;
    }

    /**
     * @return array<string, int>
     */
    public function report(): array
    {
        return $this->report;
    }

    private function bump(string $key, int $n = 1): void
    {
        $this->report[$key] = ($this->report[$key] ?? 0) + $n;
    }

    private function clearContent(): void
    {
        $driver = (string) $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        // Disable FK checks for the wipe (driver-specific).
        match ($driver) {
            'sqlite' => $this->pdo->exec('PRAGMA foreign_keys = OFF'),
            'pgsql' => $this->pdo->exec("SET session_replication_role = 'replica'"),
            default => $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 0'),
        };
        $tables = [
            'project_tag_pivot', 'project_technologies', 'project_features', 'project_timeline', 'project_media',
            'blog_post_tags', 'blog_posts', 'blog_tags', 'blog_categories',
            'projects', 'project_categories', 'project_tags',
            'skills', 'skill_categories',
            'experience', 'education', 'services', 'testimonials', 'statistics', 'social_links',
            'navigation_items', 'homepage_sections', 'contact_messages', 'pages',
        ];
        if ($this->tableExists('products')) {
            $tables[] = 'products';
        }
        foreach ($tables as $t) {
            try {
                $this->pdo->exec("DELETE FROM `$t`");
            } catch (Throwable) {
                continue;
            }
            // AUTO_INCREMENT reset is MySQL-only.
            if ($driver === 'mysql') {
                try {
                    $this->pdo->exec("ALTER TABLE `$t` AUTO_INCREMENT = 1");
                } catch (Throwable) {
                }
            }
        }
        match ($driver) {
            'sqlite' => $this->pdo->exec('PRAGMA foreign_keys = ON'),
            'pgsql' => $this->pdo->exec("SET session_replication_role = 'origin'"),
            default => $this->pdo->exec('SET FOREIGN_KEY_CHECKS = 1'),
        };
        $this->bump('cleared_tables', count($tables));
    }

    /** @param array<string, mixed> $singletons */
    private function importSingletons(array $singletons): void
    {
        $map = [
            'profile' => [
                'name', 'job_title', 'short_bio', 'bio', 'location',
                'availability_status', 'years_experience',
            ],
            'hero_settings' => [
                'headline', 'subheadline', 'badge_text',
                'primary_cta_label', 'primary_cta_href',
                'secondary_cta_label', 'secondary_cta_href',
                'show_scroll_indicator', 'animation_style',
            ],
            'site_settings' => [
                'site_name', 'maintenance_mode', 'maintenance_title', 'maintenance_message',
                'maintenance_allow_staff', 'timezone', 'locale',
                'posts_per_page', 'projects_per_page',
            ],
            'seo_settings' => [
                'site_title', 'site_description', 'site_keywords', 'target_regions',
                'canonical_base_url', 'og_title', 'og_description',
                'twitter_card', 'twitter_handle', 'google_analytics_id', 'google_tag_manager_id',
            ],
            'contact_info' => [
                'email', 'phone', 'address', 'city', 'country',
                'map_embed', 'form_enabled', 'form_success_message',
            ],
            'footer_settings' => [
                'copyright_text', 'tagline', 'show_social',
            ],
            'theme_settings' => [
                'preset', 'primary_color', 'accent_color', 'background_color',
                'surface_color', 'text_color', 'muted_color',
                'font_display', 'font_body', 'border_radius', 'glass_opacity', 'custom_css',
                'custom_html', 'custom_js',
            ],
            'email_settings' => [
                'mailer', 'from_email', 'from_name', 'to_email',
                'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption',
            ],
        ];

        foreach ($map as $table => $cols) {
            if (!isset($singletons[$table]) || !is_array($singletons[$table])) {
                continue;
            }
            $row = $singletons[$table];
            $sets = [];
            $params = [];
            foreach ($cols as $col) {
                if (!array_key_exists($col, $row)) {
                    continue;
                }
                $sets[] = "`$col` = ?";
                $params[] = $this->scalar($row[$col]);
            }
            if ($table === 'footer_settings' && array_key_exists('columns_json', $row)) {
                $sets[] = '`columns_json` = ?';
                $params[] = $this->jsonEncode($row['columns_json']);
            }
            if ($sets === []) {
                continue;
            }
            $sql = 'UPDATE `' . $table . '` SET ' . implode(', ', $sets) . ' WHERE id = 1';
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $this->bump('singletons');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importSocialLinks(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO social_links (platform, label, url, icon, sort_order, is_visible) VALUES (?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['platform'] ?? ''),
                (string) ($row['label'] ?? $row['platform'] ?? ''),
                (string) ($row['url'] ?? ''),
                $row['icon'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('social_links');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importStatistics(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO statistics (label, value, suffix, icon, sort_order, is_visible) VALUES (?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['label'] ?? ''),
                (string) ($row['value'] ?? ''),
                $row['suffix'] ?? null,
                $row['icon'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('statistics');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importExperience(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO experience (company, role, location, description, start_date, end_date, is_current, technologies, sort_order, is_visible)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['company'] ?? ''),
                (string) ($row['role'] ?? ''),
                $row['location'] ?? null,
                $row['description'] ?? null,
                (string) ($row['start_date'] ?? '2000-01-01'),
                $row['end_date'] ?? null,
                (int) ($row['is_current'] ?? 0),
                $this->jsonEncode($row['technologies'] ?? null),
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('experience');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importEducation(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO education (institution, degree, field_of_study, description, start_date, end_date, is_current, sort_order, is_visible)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['institution'] ?? ''),
                (string) ($row['degree'] ?? ''),
                $row['field_of_study'] ?? null,
                $row['description'] ?? null,
                $row['start_date'] ?? null,
                $row['end_date'] ?? null,
                (int) ($row['is_current'] ?? 0),
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('education');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importSkillCategories(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO skill_categories (name, slug, description, icon, sort_order, is_visible) VALUES (?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['name'] ?? 'skill-' . ($i + 1)));
            $stmt->execute([
                (string) ($row['name'] ?? ''),
                $slug,
                $row['description'] ?? null,
                $row['icon'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $id = (int) $this->pdo->lastInsertId();
            $ref = (string) ($row['ref'] ?? $slug);
            $this->skillCategoryRefs[$ref] = $id;
            $this->bump('skill_categories');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importSkills(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO skills (category_id, name, percentage, icon, sort_order, is_visible) VALUES (?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $catRef = (string) ($row['category_ref'] ?? '');
            $categoryId = $this->skillCategoryRefs[$catRef] ?? (int) ($row['category_id'] ?? 0);
            if ($categoryId <= 0) {
                throw new RuntimeException("skills[$i]: unknown category_ref \"$catRef\"");
            }
            $stmt->execute([
                $categoryId,
                (string) ($row['name'] ?? ''),
                (int) ($row['percentage'] ?? 0),
                $row['icon'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('skills');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importProjectCategories(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO project_categories (name, slug, description, sort_order) VALUES (?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['name'] ?? 'cat-' . ($i + 1)));
            $stmt->execute([
                (string) ($row['name'] ?? ''),
                $slug,
                $row['description'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
            ]);
            $id = (int) $this->pdo->lastInsertId();
            $this->projectCategoryRefs[(string) ($row['ref'] ?? $slug)] = $id;
            $this->bump('project_categories');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importProjectTags(array $rows): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO project_tags (name, slug) VALUES (?,?)');
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['name'] ?? 'tag-' . ($i + 1)));
            $stmt->execute([(string) ($row['name'] ?? ''), $slug]);
            $id = (int) $this->pdo->lastInsertId();
            $this->projectTagRefs[(string) ($row['ref'] ?? $slug)] = $id;
            $this->bump('project_tags');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importProjects(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO projects (
                title, slug, short_description, description, content, category_id, status, project_status,
                is_featured, sort_order, role, team_size, completion_date,
                github_url, website_url, steam_url, itch_url, google_play_url, app_store_url,
                download_url, download_label, video_url, youtube_url,
                challenges, seo_title, seo_description, seo_keywords, published_at
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $techStmt = $this->pdo->prepare(
            'INSERT INTO project_technologies (project_id, name, icon, sort_order) VALUES (?,?,?,?)'
        );
        $featStmt = $this->pdo->prepare(
            'INSERT INTO project_features (project_id, title, description, icon, sort_order) VALUES (?,?,?,?,?)'
        );
        $timeStmt = $this->pdo->prepare(
            'INSERT INTO project_timeline (project_id, title, description, event_date, sort_order) VALUES (?,?,?,?,?)'
        );
        $pivotStmt = $this->pdo->prepare(
            'INSERT INTO project_tag_pivot (project_id, tag_id) VALUES (?,?)'
        );

        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['title'] ?? 'project-' . ($i + 1)));
            $catRef = (string) ($row['category_ref'] ?? '');
            $categoryId = $catRef !== ''
                ? ($this->projectCategoryRefs[$catRef] ?? null)
                : ($row['category_id'] ?? null);

            $stmt->execute([
                (string) ($row['title'] ?? ''),
                $slug,
                $row['short_description'] ?? null,
                $row['description'] ?? null,
                $row['content'] ?? null,
                $categoryId,
                (string) ($row['status'] ?? 'published'),
                (string) ($row['project_status'] ?? 'completed'),
                (int) ($row['is_featured'] ?? 0),
                (int) ($row['sort_order'] ?? $i + 1),
                $row['role'] ?? null,
                $row['team_size'] ?? null,
                $row['completion_date'] ?? null,
                $row['github_url'] ?? null,
                $row['website_url'] ?? null,
                $row['steam_url'] ?? null,
                $row['itch_url'] ?? null,
                $row['google_play_url'] ?? null,
                $row['app_store_url'] ?? null,
                $row['download_url'] ?? null,
                $row['download_label'] ?? null,
                $row['video_url'] ?? null,
                $row['youtube_url'] ?? null,
                $row['challenges'] ?? null,
                $row['seo_title'] ?? null,
                $row['seo_description'] ?? null,
                $row['seo_keywords'] ?? null,
                $row['published_at'] ?? date('Y-m-d H:i:s'),
            ]);
            $projectId = (int) $this->pdo->lastInsertId();
            $this->projectRefs[(string) ($row['ref'] ?? $slug)] = $projectId;
            $this->bump('projects');

            $techs = $row['technologies'] ?? [];
            if (is_array($techs)) {
                foreach (array_values($techs) as $ti => $tech) {
                    if (is_string($tech)) {
                        $techStmt->execute([$projectId, $tech, null, $ti + 1]);
                    } else {
                        $techStmt->execute([
                            $projectId,
                            (string) ($tech['name'] ?? ''),
                            $tech['icon'] ?? null,
                            (int) ($tech['sort_order'] ?? $ti + 1),
                        ]);
                    }
                    $this->bump('project_technologies');
                }
            }

            $features = $row['features'] ?? [];
            if (is_array($features)) {
                foreach (array_values($features) as $fi => $feat) {
                    if (is_string($feat)) {
                        $featStmt->execute([$projectId, $feat, null, null, $fi + 1]);
                    } else {
                        $featStmt->execute([
                            $projectId,
                            (string) ($feat['title'] ?? ''),
                            $feat['description'] ?? null,
                            $feat['icon'] ?? null,
                            (int) ($feat['sort_order'] ?? $fi + 1),
                        ]);
                    }
                    $this->bump('project_features');
                }
            }

            $timeline = $row['timeline'] ?? [];
            if (is_array($timeline)) {
                foreach (array_values($timeline) as $ei => $event) {
                    $timeStmt->execute([
                        $projectId,
                        (string) ($event['title'] ?? ''),
                        $event['description'] ?? null,
                        $event['event_date'] ?? null,
                        (int) ($event['sort_order'] ?? $ei + 1),
                    ]);
                    $this->bump('project_timeline');
                }
            }

            foreach ($row['tag_refs'] ?? [] as $tagRef) {
                $tagId = $this->projectTagRefs[(string) $tagRef] ?? null;
                if ($tagId) {
                    $pivotStmt->execute([$projectId, $tagId]);
                    $this->bump('project_tag_pivot');
                }
            }
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importBlogCategories(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO blog_categories (name, slug, description, sort_order) VALUES (?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['name'] ?? 'blog-cat-' . ($i + 1)));
            $stmt->execute([
                (string) ($row['name'] ?? ''),
                $slug,
                $row['description'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
            ]);
            $this->blogCategoryRefs[(string) ($row['ref'] ?? $slug)] = (int) $this->pdo->lastInsertId();
            $this->bump('blog_categories');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importBlogTags(array $rows): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO blog_tags (name, slug) VALUES (?,?)');
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['name'] ?? 'blog-tag-' . ($i + 1)));
            $stmt->execute([(string) ($row['name'] ?? ''), $slug]);
            $this->blogTagRefs[(string) ($row['ref'] ?? $slug)] = (int) $this->pdo->lastInsertId();
            $this->bump('blog_tags');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importBlogPosts(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO blog_posts (
                title, slug, excerpt, content, content_format, category_id, status,
                reading_time, seo_title, seo_description, seo_keywords, published_at
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $pivot = $this->pdo->prepare('INSERT INTO blog_post_tags (post_id, tag_id) VALUES (?,?)');

        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['title'] ?? 'post-' . ($i + 1)));
            $catRef = (string) ($row['category_ref'] ?? '');
            $categoryId = $catRef !== ''
                ? ($this->blogCategoryRefs[$catRef] ?? null)
                : ($row['category_id'] ?? null);

            $stmt->execute([
                (string) ($row['title'] ?? ''),
                $slug,
                $row['excerpt'] ?? null,
                $row['content'] ?? null,
                (string) ($row['content_format'] ?? 'html'),
                $categoryId,
                (string) ($row['status'] ?? 'published'),
                $row['reading_time'] ?? null,
                $row['seo_title'] ?? null,
                $row['seo_description'] ?? null,
                $row['seo_keywords'] ?? null,
                $row['published_at'] ?? date('Y-m-d H:i:s'),
            ]);
            $postId = (int) $this->pdo->lastInsertId();
            $this->bump('blog_posts');

            foreach ($row['tag_refs'] ?? [] as $tagRef) {
                $tagId = $this->blogTagRefs[(string) $tagRef] ?? null;
                if ($tagId) {
                    $pivot->execute([$postId, $tagId]);
                    $this->bump('blog_post_tags');
                }
            }
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importServices(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO services (title, slug, short_description, description, icon, price_label, features, sort_order, is_visible)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['title'] ?? 'service-' . ($i + 1)));
            $stmt->execute([
                (string) ($row['title'] ?? ''),
                $slug,
                $row['short_description'] ?? null,
                $row['description'] ?? null,
                $row['icon'] ?? null,
                $row['price_label'] ?? null,
                $this->jsonEncode($row['features'] ?? null),
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('services');
        }
    }

    /**
     * Upsert витрины без wipe (для migrate-скрипта на уже залитом сайте).
     *
     * @param list<array<string, mixed>> $rows
     * @return int число обработанных строк
     */
    public function syncProducts(array $rows): int
    {
        $this->report = [];
        $this->upsertProducts($rows);
        return (int) ($this->report['products'] ?? 0);
    }

    /**
     * Старые услуги → товары витрины (tabs из features).
     *
     * @param list<array<string, mixed>> $services
     * @return list<array<string, mixed>>
     */
    public static function servicesToProducts(array $services): array
    {
        $out = [];
        foreach ($services as $i => $row) {
            $features = $row['features'] ?? [];
            if (is_string($features)) {
                $decoded = json_decode($features, true);
                $features = is_array($decoded) ? $decoded : [];
            }
            if (!is_array($features)) {
                $features = [];
            }
            $lis = '';
            foreach ($features as $f) {
                $lis .= '<li>' . htmlspecialchars((string) $f, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li>';
            }
            $desc = (string) ($row['description'] ?? '');
            $slug = (string) ($row['slug'] ?? '');
            $out[] = [
                'title' => (string) ($row['title'] ?? ''),
                'slug' => $slug,
                'sku' => 'SVC-' . strtoupper($slug !== '' ? $slug : (string) ($i + 1)),
                'badge' => 'Услуга',
                'short_description' => $row['short_description'] ?? null,
                'description' => $desc,
                'price' => (float) ($row['price'] ?? 0),
                'currency' => (string) ($row['currency'] ?? 'RUB'),
                'is_purchasable' => (int) ($row['is_purchasable'] ?? 0),
                'is_visible' => (int) ($row['is_visible'] ?? 1),
                'sort_order' => (int) ($row['sort_order'] ?? $i + 1),
                'attrs' => [
                    'category' => 'Услуги',
                    'platform' => (string) ($row['icon'] ?? ''),
                    'delivery' => 'По договорённости',
                    'icon' => $row['icon'] ?? null,
                ],
                'tags' => array_values(array_filter(array_map(
                    static function ($f) {
                        if (!is_string($f) || $f === '') {
                            return '';
                        }
                        $t = preg_replace('/\s+/', '-', $f) ?? '';
                        return function_exists('mb_strtolower')
                            ? mb_strtolower($t, 'UTF-8')
                            : strtolower($t);
                    },
                    array_slice($features, 0, 4),
                ))),
                'tabs' => array_values(array_filter([
                    $lis !== '' ? ['label' => 'Что входит', 'html' => '<ul>' . $lis . '</ul>'] : null,
                    $desc !== '' ? ['label' => 'Описание', 'html' => $desc] : null,
                ])),
                'variants' => [],
                'gallery' => [],
            ];
        }
        return $out;
    }

    /**
     * Развёрнутая витрина: attrs / tabs / tags / variants (INSERT при полном импорте).
     *
     * @param list<array<string, mixed>> $rows
     */
    private function importProducts(array $rows): void
    {
        $this->upsertProducts($rows, replaceInsert: true);
    }

    /**
     * @param list<array<string, mixed>> $rows
     */
    private function upsertProducts(array $rows, bool $replaceInsert = false): void
    {
        if ($rows === [] || !$this->tableExists('products')) {
            return;
        }
        $hasStorefront = $this->columnExists('products', 'attrs');
        $find = $this->pdo->prepare('SELECT id FROM products WHERE slug = ? LIMIT 1');

        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['title'] ?? 'product-' . ($i + 1)));
            $title = (string) ($row['title'] ?? '');
            $price = round((float) ($row['price'] ?? 0), 2);
            $currency = strtoupper((string) ($row['currency'] ?? 'RUB'));
            $mediaId = isset($row['media_id']) ? (int) $row['media_id'] : null;
            $stock = array_key_exists('stock', $row) && $row['stock'] !== null && $row['stock'] !== ''
                ? (int) $row['stock'] : null;
            $purchasable = (int) ($row['is_purchasable'] ?? 0);
            $visible = (int) ($row['is_visible'] ?? 1);
            $sort = (int) ($row['sort_order'] ?? $i + 1);

            $find->execute([$slug]);
            $existingId = $find->fetchColumn();

            if ($existingId && !$replaceInsert) {
                if ($hasStorefront) {
                    $upd = $this->pdo->prepare(
                        'UPDATE products SET
                            title=?, sku=?, badge=?, short_description=?, description=?,
                            price=?, currency=?, media_id=COALESCE(?, media_id), video_url=?,
                            stock=?, sold_count=?, attrs=?, variants=?, gallery=?, tabs=?, tags=?,
                            is_purchasable=?, is_visible=?, sort_order=?
                         WHERE id=?'
                    );
                    $upd->execute([
                        $title,
                        $row['sku'] ?? null,
                        $row['badge'] ?? null,
                        $row['short_description'] ?? null,
                        $row['description'] ?? null,
                        $price,
                        $currency,
                        $mediaId,
                        $row['video_url'] ?? null,
                        $stock,
                        (int) ($row['sold_count'] ?? 0),
                        $this->jsonEncode($row['attrs'] ?? new \stdClass()),
                        $this->jsonEncode($row['variants'] ?? []),
                        $this->jsonEncode($row['gallery'] ?? []),
                        $this->jsonEncode($row['tabs'] ?? []),
                        $this->jsonEncode($row['tags'] ?? []),
                        $purchasable,
                        $visible,
                        $sort,
                        (int) $existingId,
                    ]);
                } else {
                    $upd = $this->pdo->prepare(
                        'UPDATE products SET
                            title=?, sku=?, short_description=?, description=?,
                            price=?, currency=?, media_id=COALESCE(?, media_id), stock=?,
                            is_purchasable=?, is_visible=?, sort_order=?
                         WHERE id=?'
                    );
                    $upd->execute([
                        $title,
                        $row['sku'] ?? null,
                        $row['short_description'] ?? null,
                        $row['description'] ?? null,
                        $price,
                        $currency,
                        $mediaId,
                        $stock,
                        $purchasable,
                        $visible,
                        $sort,
                        (int) $existingId,
                    ]);
                }
            } else {
                if ($hasStorefront) {
                    $ins = $this->pdo->prepare(
                        'INSERT INTO products (
                            title, slug, sku, badge, short_description, description,
                            price, currency, media_id, video_url, stock, sold_count,
                            attrs, variants, gallery, tabs, tags,
                            is_purchasable, is_visible, sort_order
                         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
                    );
                    $ins->execute([
                        $title,
                        $slug,
                        $row['sku'] ?? null,
                        $row['badge'] ?? null,
                        $row['short_description'] ?? null,
                        $row['description'] ?? null,
                        $price,
                        $currency,
                        $mediaId,
                        $row['video_url'] ?? null,
                        $stock,
                        (int) ($row['sold_count'] ?? 0),
                        $this->jsonEncode($row['attrs'] ?? new \stdClass()),
                        $this->jsonEncode($row['variants'] ?? []),
                        $this->jsonEncode($row['gallery'] ?? []),
                        $this->jsonEncode($row['tabs'] ?? []),
                        $this->jsonEncode($row['tags'] ?? []),
                        $purchasable,
                        $visible,
                        $sort,
                    ]);
                } else {
                    $ins = $this->pdo->prepare(
                        'INSERT INTO products (
                            title, slug, sku, short_description, description,
                            price, currency, media_id, stock,
                            is_purchasable, is_visible, sort_order
                         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
                    );
                    $ins->execute([
                        $title,
                        $slug,
                        $row['sku'] ?? null,
                        $row['short_description'] ?? null,
                        $row['description'] ?? null,
                        $price,
                        $currency,
                        $mediaId,
                        $stock,
                        $purchasable,
                        $visible,
                        $sort,
                    ]);
                }
            }
            $this->bump('products');
        }
    }

    private function tableExists(string $table): bool
    {
        try {
            $st = $this->pdo->prepare(
                'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1'
            );
            $st->execute([$table]);
            return (bool) $st->fetchColumn();
        } catch (Throwable) {
            try {
                $this->pdo->query("SELECT 1 FROM `$table` LIMIT 1");
                return true;
            } catch (Throwable) {
                return false;
            }
        }
    }

    private function columnExists(string $table, string $column): bool
    {
        try {
            $st = $this->pdo->prepare(
                'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1'
            );
            $st->execute([$table, $column]);
            return (bool) $st->fetchColumn();
        } catch (Throwable) {
            return false;
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importTestimonials(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO testimonials (author_name, author_role, author_company, content, rating, sort_order, is_visible)
             VALUES (?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['author_name'] ?? ''),
                $row['author_role'] ?? null,
                $row['author_company'] ?? null,
                (string) ($row['content'] ?? ''),
                $row['rating'] ?? null,
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('testimonials');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importNavigation(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO navigation_items (label, href, target, location, sort_order, is_visible) VALUES (?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['label'] ?? ''),
                (string) ($row['href'] ?? '/'),
                (string) ($row['target'] ?? '_self'),
                (string) ($row['location'] ?? 'header'),
                (int) ($row['sort_order'] ?? $i + 1),
                (int) ($row['is_visible'] ?? 1),
            ]);
            $this->bump('navigation_items');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importHomepageSections(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO homepage_sections (
                section_key, title, subtitle, content, cta_label, cta_href,
                secondary_cta_label, secondary_cta_href, is_visible, sort_order, settings_json
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $stmt->execute([
                (string) ($row['section_key'] ?? 'section_' . ($i + 1)),
                $row['title'] ?? null,
                $row['subtitle'] ?? null,
                $row['content'] ?? null,
                $row['cta_label'] ?? null,
                $row['cta_href'] ?? null,
                $row['secondary_cta_label'] ?? null,
                $row['secondary_cta_href'] ?? null,
                (int) ($row['is_visible'] ?? 1),
                (int) ($row['sort_order'] ?? $i + 1),
                $this->jsonEncode($row['settings_json'] ?? null),
            ]);
            $this->bump('homepage_sections');
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function importPages(array $rows): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO pages (title, slug, content, status, seo_title, seo_description, template) VALUES (?,?,?,?,?,?,?)'
        );
        foreach ($rows as $i => $row) {
            $slug = $this->slug((string) ($row['slug'] ?? $row['title'] ?? 'page-' . ($i + 1)));
            $stmt->execute([
                (string) ($row['title'] ?? ''),
                $slug,
                $row['content'] ?? null,
                (string) ($row['status'] ?? 'published'),
                $row['seo_title'] ?? null,
                $row['seo_description'] ?? null,
                (string) ($row['template'] ?? 'default'),
            ]);
            $this->bump('pages');
        }
    }

    private function scalar(mixed $value): mixed
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }
        return $value;
    }

    private function jsonEncode(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $trim = trim($value);
            if ($trim === '') {
                return null;
            }
            // already JSON
            if (($trim[0] ?? '') === '[' || ($trim[0] ?? '') === '{') {
                return $value;
            }
            return json_encode([$value], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: null;
    }

    private function slug(string $text): string
    {
        $text = trim(mb_strtolower($text));
        $map = [
            'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e',
            'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm',
            'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u',
            'ф' => 'f', 'х' => 'h', 'ц' => 'c', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sch',
            'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
        ];
        $text = strtr($text, $map);
        $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? $text;
        $text = trim($text, '-');
        return $text !== '' ? $text : 'item';
    }
}
