<?php
declare(strict_types=1);

namespace App\Core\Contract;

use App\Core\EventDispatcher;
use App\Database;
use App\Router;

/**
 * Every CMS feature is a Module/Plugin. Register one from
 * Modules/{Name}/*Module.php and the registry discovers routes,
 * boot hooks, admin metadata, blueprints, builder blocks and public routes.
 *
 * Backward compatible: methods added after the original contract have
 * safe defaults in {@see \App\Core\AbstractModule}, so existing modules
 * keep working without changes.
 */
interface ModuleInterface
{
    /** Unique machine name, e.g. "projects" */
    public function name(): string;

    /** Human label for menus / docs */
    public function label(): string;

    /** Short one-line description for Plugins admin catalog */
    public function description(): string;

    /** Longer help text (plain, paragraphs / bullets) for expanded plugin card */
    public function longDescription(): string;

    /**
     * Catalog category key: core|content|commerce|comms|security|integrations|other
     */
    public function category(): string;

    /**
     * Hard dependencies: machine names of plugins that MUST be enabled
     * for this plugin to work (e.g. payments → products).
     *
     * @return list<string>
     */
    public function requires(): array;

    /**
     * Soft dependencies: recommended plugins (UI hint only, not enforced).
     *
     * @return list<string>
     */
    public function suggests(): array;

    /** Install order; lower boots first */
    public function priority(): int;

    /** Whether this module is enabled (config / modules table) */
    public function enabled(array $app): bool;

    /** Optional DB / kernel bootstrap */
    public function boot(Database $db, array $app): void;

    /** Register routes under the given API prefix (e.g. /api/v1) */
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void;

    /**
     * Admin navigation entries contributed by this module.
     * @return list<array{group:string, path:string, label:string, permission?:string}>
     */
    public function adminNav(): array;

    /**
     * Resource metadata for generic CMS tooling / discoverability.
     * @return list<array{key:string, table:string, soft_delete?:bool, sluggable?:bool}>
     */
    public function resources(): array;

    /**
     * Declarative blueprints describing content types owned by this plugin.
     * Used by auto-migration, generic CRUD and admin UI generation.
     *
     * @return list<array<string, mixed>> raw blueprint arrays (normalized by Blueprint)
     */
    public function blueprints(): array;

    /**
     * Event subscriptions. Each entry: [event, callable(pay­load), priority?].
     * The dispatcher is provided so plugins can also subscribe imperatively
     * inside boot(); this method lets the kernel expose subscriptions in the
     * module catalog for tooling.
     *
     * @return list<array{0:string, 1:callable, 2?:int}>
     */
    public function hooks(): array;

    /**
     * Builder blocks contributed by this plugin. Backend returns metadata
     * only (type, label, category, default settings schema); the frontend
     * module manifest supplies the React renderer.
     *
     * @return list<array{type:string, label:string, category:string, settings_schema?:array}>
     */
    public function blocks(): array;

    /**
     * Public site routes contributed by this plugin (metadata for the SPA
     * route map so the public site can render plugin pages without code edits).
     *
     * @return list<array{path:string, label:string, component?:string}>
     */
    public function publicRoutes(): array;

    /**
     * Declarative settings schema for this plugin's configuration screen
     * (rendered generically by the Plugins admin page). Each entry describes
     * one field: key, label, widget type, optional options/help/default.
     *
     * @return list<array<string, mixed>>
     */
    public function settingsSchema(): array;

    /**
     * Default settings values (merged with stored values on read).
     *
     * @return array<string, mixed>
     */
    public function settings(): array;

    /**
     * Demo / default pages this plugin contributes to the CMS "Pages" list
     * (WordPress-style plugin-driven content). Pages are created idempotently
     * and additively by {@see \App\Core\Services\PageSeedService} — existing
     * pages are NEVER modified or deleted, only missing slugs are inserted.
     *
     * Each entry keys (all optional except slug+title):
     *   slug (required, unique), title (required), content (HTML),
     *   layout (builder JSON document or array), status ('draft'|'published'),
     *   template, seo_title, seo_description, is_home (always forced to 0).
     *
     * Seeding runs on plugin enable, on fresh install, and on demand from
     * the Plugins admin screen.
     *
     * @return list<array<string, mixed>>
     */
    public function demoPages(): array;

    /**
     * Global HTTP middleware contributed by this plugin (run on every request).
     * Each entry is a callable(Request $r, callable $next): mixed.
     *
     * @return list<callable>
     */
    public function globalMiddleware(Database $db, array $app): array;
}
