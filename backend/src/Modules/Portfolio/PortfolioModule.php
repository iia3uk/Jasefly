<?php
declare(strict_types=1);

namespace App\Modules\Portfolio;

use App\Core\AbstractModule;

/**
 * Portfolio plugin — the portfolio product built on top of the CMS kernel.
 *
 * Owns the declarative metadata (blueprints, admin nav, builder blocks,
 * public routes) for every portfolio-specific content type. The actual
 * REST routes remain registered by ContentModule / ProjectsModule /
 * BlogModule to preserve backward-compatible /api/v1 endpoints — this
 * module is the single source of truth for *what* the portfolio plugin
 * contributes, so it can be enabled/disabled as a unit and discovered by
 * tooling (catalog, blueprints, blocks, public-routes endpoints).
 *
 * Disabling this module hides portfolio content from the admin UI and
 * public route map without touching the API layer.
 */
final class PortfolioModule extends AbstractModule
{
    public function name(): string
    {
        return 'portfolio';
    }

    public function label(): string
    {
        return 'Portfolio';
    }

    public function priority(): int
    {
        return 25;
    }

    public function registerRoutes(\App\Router $router, \App\Database $db, array $app, string $apiPrefix): void
    {
        // No routes — API compatibility is handled by Content/Projects/Blog modules.
        // This module only contributes declarative metadata.
    }

    public function adminNav(): array
    {
        // Projects / Blog / Services have their own modules (and FE manifests).
        // Do not advertise /admin/projects here — that route only exists when
        // the Projects plugin is enabled; otherwise the SPA gets a hard 404.
        return [
            ['group' => 'Контент', 'path' => '/admin/profile', 'label' => 'Профиль'],
            ['group' => 'Контент', 'path' => '/admin/statistics', 'label' => 'Статистика'],
            ['group' => 'Контент', 'path' => '/admin/experience', 'label' => 'Опыт'],
            ['group' => 'Контент', 'path' => '/admin/education', 'label' => 'Образование'],
            ['group' => 'Контент', 'path' => '/admin/skills', 'label' => 'Навыки'],
            ['group' => 'Контент', 'path' => '/admin/skill-categories', 'label' => 'Категории навыков'],
            ['group' => 'Контент', 'path' => '/admin/testimonials', 'label' => 'Отзывы'],
            ['group' => 'Сайт', 'path' => '/admin/homepage', 'label' => 'Главная (портфолио)'],
        ];
    }

    public function suggests(): array
    {
        return ['projects', 'blog', 'services'];
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_heading_home', 'label' => 'Главная страница', 'type' => 'heading',
                'help' => 'Откуда собирается лента главной: классический шаблон портфолио или конструктор страниц.'],
            ['key' => 'homepage_template', 'label' => 'Шаблон главной', 'type' => 'select',
                'default' => 'classic',
                'help' => 'Classic: Hero → кратко обо мне с фото → проекты, навыки (вкладки), опыт… Builder: разметка страницы «Главная» из конструктора.',
                'options' => [
                    ['value' => 'classic', 'label' => 'Classic — Hero → обо мне → остальное'],
                    ['value' => 'builder', 'label' => 'Builder — страница из конструктора'],
                ],
            ],
            ['key' => 'owner_name', 'label' => 'Имя владельца', 'type' => 'text', 'default' => ''],
            ['key' => 'owner_role', 'label' => 'Должность / специализация', 'type' => 'text', 'default' => ''],
            ['key' => 'resume_url', 'label' => 'Ссылка на резюме (PDF)', 'type' => 'url', 'default' => ''],
            ['key' => 'show_blog', 'label' => 'Показывать блог на сайте', 'type' => 'checkbox', 'default' => true],
            ['key' => 'show_services', 'label' => 'Показывать блок услуг', 'type' => 'checkbox', 'default' => true],
            ['key' => 'show_testimonials', 'label' => 'Показывать отзывы', 'type' => 'checkbox', 'default' => true],
            ['key' => 'projects_per_page', 'label' => 'Проектов на странице', 'type' => 'number', 'default' => 6],
        ];
    }

    public function settings(): array
    {
        return [
            'homepage_template' => 'classic',
            'owner_name' => '',
            'owner_role' => '',
            'resume_url' => '',
            'show_blog' => true,
            'show_services' => true,
            'show_testimonials' => true,
            'projects_per_page' => 6,
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'profile', 'table' => 'profile', 'soft_delete' => false],
            ['key' => 'statistics', 'table' => 'statistics', 'soft_delete' => false],
            ['key' => 'experience', 'table' => 'experience', 'soft_delete' => true],
            ['key' => 'education', 'table' => 'education', 'soft_delete' => true],
            ['key' => 'skills', 'table' => 'skills', 'soft_delete' => true],
            ['key' => 'skill-categories', 'table' => 'skill_categories', 'soft_delete' => true, 'sluggable' => true],
            ['key' => 'projects', 'table' => 'projects', 'soft_delete' => true, 'sluggable' => true],
            ['key' => 'services', 'table' => 'services', 'soft_delete' => true, 'sluggable' => true],
            ['key' => 'testimonials', 'table' => 'testimonials', 'soft_delete' => true],
            ['key' => 'homepage-sections', 'table' => 'homepage_sections', 'soft_delete' => false],
        ];
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'statistics',
                'table' => 'statistics',
                'label' => 'Статистика',
                'group' => 'Контент',
                'orderable' => true,
                'icon' => 'layout-dashboard',
                'columns' => [
                    'label' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Название'],
                    'value' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Значение'],
                    'suffix' => ['type' => 'string', 'widget' => 'text', 'label' => 'Суффикс'],
                    'icon' => ['type' => 'string', 'widget' => 'text', 'label' => 'Иконка'],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Порядок'],
                ],
                'permissions' => ['content.view', 'content.edit'],
            ],
            [
                'key' => 'experience',
                'table' => 'experience',
                'label' => 'Опыт',
                'soft_delete' => true,
                'group' => 'Контент',
                'orderable' => true,
                'icon' => 'briefcase',
                'columns' => [
                    'company' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Компания'],
                    'role' => ['type' => 'string', 'widget' => 'text', 'label' => 'Роль'],
                    'location' => ['type' => 'string', 'widget' => 'text', 'label' => 'Локация'],
                    'start_date' => ['type' => 'date', 'widget' => 'date', 'label' => 'Начало'],
                    'end_date' => ['type' => 'date', 'widget' => 'date', 'label' => 'Конец'],
                    'description' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Описание'],
                ],
                'permissions' => ['content.view', 'content.edit', 'content.delete'],
            ],
            [
                'key' => 'education',
                'table' => 'education',
                'label' => 'Образование',
                'soft_delete' => true,
                'group' => 'Контент',
                'orderable' => true,
                'icon' => 'graduation',
                'columns' => [
                    'institution' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Учебное заведение'],
                    'degree' => ['type' => 'string', 'widget' => 'text', 'label' => 'Степень'],
                    'field_of_study' => ['type' => 'string', 'widget' => 'text', 'label' => 'Направление'],
                    'start_date' => ['type' => 'date', 'widget' => 'date', 'label' => 'Начало'],
                    'end_date' => ['type' => 'date', 'widget' => 'date', 'label' => 'Конец'],
                    'description' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Описание'],
                ],
                'permissions' => ['content.view', 'content.edit', 'content.delete'],
            ],
        ];
    }

    public function blocks(): array
    {
        // Builder blocks contributed by the portfolio plugin (metadata only;
        // renderers live on the frontend portfolio module manifest).
        return [
            ['type' => 'hero', 'label' => 'Hero', 'category' => 'portfolio'],
            ['type' => 'projects-grid', 'label' => 'Сетка проектов', 'category' => 'portfolio'],
            ['type' => 'skills', 'label' => 'Навыки', 'category' => 'portfolio'],
            ['type' => 'experience-timeline', 'label' => 'Опыт (таймлайн)', 'category' => 'portfolio'],
            ['type' => 'services-grid', 'label' => 'Услуги', 'category' => 'portfolio'],
            ['type' => 'testimonials', 'label' => 'Отзывы', 'category' => 'portfolio'],
            ['type' => 'contact-cta', 'label' => 'Контакты CTA', 'category' => 'portfolio'],
            ['type' => 'blog-grid', 'label' => 'Сетка блога', 'category' => 'portfolio'],
        ];
    }

    public function publicRoutes(): array
    {
        return [
            ['path' => '/projects', 'label' => 'Проекты'],
            ['path' => '/projects/:slug', 'label' => 'Проект'],
            ['path' => '/blog', 'label' => 'Блог'],
            ['path' => '/blog/:slug', 'label' => 'Пост'],
            ['path' => '/services', 'label' => 'Услуги'],
            ['path' => '/about', 'label' => 'О себе'],
            ['path' => '/contact', 'label' => 'Контакты'],
        ];
    }

    public function demoPages(): array
    {
        // Layouts live in SystemTemplates (shared catalog); this plugin owns them.
        if (!class_exists(\App\Modules\System\SystemTemplates::class)) {
            return [];
        }
        return \App\Modules\System\SystemTemplates::demoPagesForPlugin('portfolio');
    }
}
